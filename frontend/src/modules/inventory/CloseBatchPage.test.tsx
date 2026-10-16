import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CloseBatchPage } from "./CloseBatchPage";
import type { ClosablePage } from "./types";

const { api, post, who } = vi.hoisted(() => ({
  api: vi.fn(),
  post: vi.fn(),
  who: { store: null as { id: number; name: string } | null },
}));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
  post,
}));
vi.mock("@/modules/auth/AuthProvider", () => ({
  useCurrentUser: () => ({ user: { id: 4, full_name: "Akmal Ega", role: "owner" }, store: who.store }),
}));

const sku = (code: string, color: string) => ({
  id: 101, code, fabric_name: "Xon atlas", color_name: color, pattern_name: null, hex: null, image_url: null,
});

// Ega: sklad va do'kon. P-000001 — ikki joyda; P-000002 — do'konda tugagan (0 m), skladda 15 m
const page: ClosablePage = {
  locations: [
    { id: 1, name: "Asosiy sklad", type: "warehouse", can_close: true },
    { id: 2, name: "Chorsu do'koni", type: "store", can_close: true },
  ],
  batches: [
    {
      id: 1, number: "P-000001", sku: sku("M101-03", "Qizil"), cost_per_m: 30000,
      cells: [
        { location_id: 1, qty_m: "650.00", rolls: 13 },
        { location_id: 2, qty_m: "260.75", rolls: 5 },
      ],
    },
    {
      id: 2, number: "P-000002", sku: sku("M101-04", "Ko'k"), cost_per_m: 30000,
      cells: [
        { location_id: 1, qty_m: "15.00", rolls: 1 },
        { location_id: 2, qty_m: "0.00", rolls: 0 },
      ],
    },
  ],
};

// jsdom'da scrollIntoView yo'q; xato xabari (Alert focus) ko'rinadigan joyga suriladi
Element.prototype.scrollIntoView = vi.fn();

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <CloseBatchPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Partiyani yopish", () => {
  beforeEach(() => {
    localStorage.clear();
    api.mockReset();
    post.mockReset();
    api.mockResolvedValue(page);
    post.mockResolvedValue(undefined);
    who.store = null;
  });

  it("bir nechta joy ko'radigan xodimda — jadval: qator partiya, ustunlar joylar, katakda qoldiq va 'Yopish'", async () => {
    renderPage();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Partiya", "Asosiy sklad", "Chorsu do'koni",
    ]);
    const row = within(table).getByRole("row", { name: /P-000001/ });
    const cells = within(row).getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("650 m");
    expect(cells[2]).toHaveTextContent("260.75 m");
    expect(within(cells[1]).getByRole("button", { name: "P-000001 — Asosiy sklad: yopish" })).toBeInTheDocument();
    // Tugagan katak asosiy jadvalda takrorlanmaydi — u "Tugagan" bo'limida
    const second = within(table).getByRole("row", { name: /P-000002/ });
    expect(within(second).getAllByRole("cell")[2]).toHaveTextContent("—");
  });

  it("yopa olmaydigan joyda (omborchi — do'konda) qoldiq ko'rinadi, tugma yo'q", async () => {
    api.mockResolvedValue({
      ...page,
      locations: [page.locations[0], { ...page.locations[1], can_close: false }],
    });
    renderPage();
    const row = within(await screen.findByRole("table")).getByRole("row", { name: /P-000001/ });
    const cells = within(row).getAllByRole("cell");
    expect(cells[2]).toHaveTextContent("260.75 m");
    expect(within(cells[2]).queryByRole("button")).toBeNull();
    expect(within(cells[1]).getByRole("button")).toBeInTheDocument();
    // Tugagan bo'lim ham faqat yopa oladigan joylar uchun
    expect(screen.queryByRole("region", { name: "Tugagan (0 m)" })).toBeNull();
  });

  it("'Tugagan (0 m)' bo'limi tepada — bir bosishda, tasdiqsiz yopiladi", async () => {
    renderPage();
    const finished = await screen.findByRole("region", { name: "Tugagan (0 m)" });
    expect(within(finished).getByText("P-000002")).toBeInTheDocument();
    expect(within(finished).getByText("Chorsu do'koni")).toBeInTheDocument();

    await userEvent.click(within(finished).getByRole("button", { name: "P-000002 — Chorsu do'koni: yopish" }));

    await waitFor(() => expect(post).toHaveBeenCalledWith("/batches/2/close", { location_id: 2, note: null }));
    expect(await screen.findByText("P-000002 yopildi (Chorsu do'koni).")).toBeInTheDocument();
  });

  it("qoldig'i bor partiyani yopishdan oldin natija ko'rinadi: metr farqi va (egaga) taxminiy summa", async () => {
    renderPage();
    const table = await screen.findByRole("table");
    await userEvent.click(within(table).getByRole("button", { name: "P-000002 — Asosiy sklad: yopish" }));

    // 15 m × 30 000 = 450 000
    expect(screen.getByText(/Tizimda: 15 m → metr farqi: 15 m kam chiqdi/)).toBeInTheDocument();
    expect(screen.getByText(/taxminan 450 000 so'm/)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Ha, yopish" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/batches/2/close", { location_id: 1, note: null }));
  });

  it("tannarx kelmagan bo'lsa (sotuvchi, omborchi) — summa ko'rsatilmaydi; manfiy qoldiq 'ortiq chiqdi'", async () => {
    api.mockResolvedValue({
      locations: [page.locations[0], page.locations[1]],
      batches: [{ ...page.batches[0], cost_per_m: null, cells: [{ location_id: 1, qty_m: "-2.50", rolls: 0 }, page.batches[0].cells[1]] }],
    });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "P-000001 — Asosiy sklad: yopish" }));

    expect(screen.getByText(/Tizimda: -2.5 m → metr farqi: 2.5 m ortiq chiqdi/)).toBeInTheDocument();
    expect(screen.queryByText(/taxminan/)).toBeNull();
  });

  it("do'kon qurilmasida (bitta joy) — ro'yxat, joy nomi sarlavhada", async () => {
    who.store = { id: 2, name: "Chorsu do'koni" };
    api.mockResolvedValue({
      locations: [page.locations[1]],
      batches: page.batches.map((batch) => ({ ...batch, cost_per_m: null, cells: batch.cells.filter((cell) => cell.location_id === 2) })),
    });
    renderPage();

    expect(await screen.findByRole("heading", { name: /Chorsu do'koni/ })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: /Chorsu do'koni/ });
    expect(screen.queryByRole("table")).toBeNull();
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(1); // P-000002 tugagan — yuqoridagi bo'limda
    expect(rows[0]).toHaveTextContent("P-000001");
    expect(rows[0]).toHaveTextContent("260.75 m");
    expect(within(rows[0]).queryByText("Chorsu do'koni")).toBeNull();
    expect(within(rows[0]).getByRole("button", { name: "P-000001 — Chorsu do'koni: yopish" })).toBeInTheDocument();
  });
});
