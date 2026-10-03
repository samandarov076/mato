import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { setScreenWidth } from "@/test-utils";
import { StockPage } from "./StockPage";
import type { StockPage as Page } from "./types";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
}));
vi.mock("@/modules/auth/AuthProvider", () => ({
  useCurrentUser: () => ({ user: { id: 1, full_name: "Akmal Ega", role: "owner" } }),
}));

const sku = (id: number, code: string, color: string) => ({
  id, code, fabric_name: "Xon atlas", color_name: color, pattern_name: null, hex: null, image_url: null,
});
// Sklad, ikkita do'kon. Qizil: skladda 300, Chorsuda 86 (chegara 100 — kam), Olmazorda yo'q. Ko'k: faqat skladda, manfiy.
const stock: Page = {
  total: 2,
  locations: [
    { id: 1, name: "Asosiy sklad", type: "warehouse" },
    { id: 2, name: "Chorsu do'koni", type: "store" },
    { id: 3, name: "Olmazor do'koni", type: "store" },
  ],
  items: [
    {
      sku: sku(101, "M101-03", "Qizil"), total_m: "386.00", in_transit_m: "40.00", threshold: "100.00",
      totals: [
        { location_id: 2, qty_m: "86.00", low: true },
        { location_id: 1, qty_m: "300.00", low: false },
      ],
      batches: [
        {
          id: 12, number: "P-000012", receipt_date: "2026-09-20", in_transit_m: "40.00",
          stocks: [
            { location_id: 1, qty_m: "300.00", rolls: 6 },
            { location_id: 2, qty_m: "86.00", rolls: 2 },
          ],
        },
      ],
    },
    {
      sku: sku(102, "M101-05", "Ko'k"), total_m: "-4.50", in_transit_m: "0.00", threshold: null,
      totals: [{ location_id: 1, qty_m: "-4.50", low: false }],
      batches: [
        { id: 13, number: "P-000013", receipt_date: "2026-09-25", in_transit_m: "0.00", stocks: [{ location_id: 1, qty_m: "-4.50", rolls: 0 }] },
      ],
    },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/stock"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <StockPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const cells = (row: HTMLElement) =>
  within(row).getAllByRole("cell").map((cell) => cell.textContent?.replace(/\s+/g, " ").trim());

describe("Qoldiq", () => {
  beforeEach(() => {
    localStorage.clear();
    api.mockReset();
    api.mockResolvedValue(stock);
  });
  afterEach(() => setScreenWidth(null));

  it("planshet va kompyuterda — matritsa: qatorda tovar, ustunlarda joylar, oxirida jami", async () => {
    setScreenWidth(1280);
    renderPage();

    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Tovar", "Asosiy sklad", "Chorsu do'koni", "Olmazor do'koni", "Jami",
    ]);
    const [, red, blue] = within(table).getAllByRole("row");
    // Katakda metr; joyda yo'q — chiziqcha; raqamlar o'ngga tekis
    expect(cells(red).slice(1)).toEqual([
      "300", expect.stringMatching(/^86 ?Kam qoldi — chegara 100 m$/), "—", "386",
    ]);
    expect(cells(blue).slice(1)).toEqual(["-4.5", "—", "—", "-4.5"]);
    for (const cell of within(red).getAllByRole("cell").slice(1)) expect(cell).toHaveClass("text-right");
    // Tovar: kod va nom; yo'ldagi metr; partiyalar qator ostida ochiladi
    expect(within(red).getByText("M101-03")).toBeInTheDocument();
    expect(within(red).getByText("Xon atlas · Qizil")).toBeInTheDocument();
    expect(within(red).getByText(/yo'lda/)).toHaveTextContent("40");
    expect(within(red).getByText("1 ta partiya")).toBeInTheDocument();
    expect(within(red).getByRole("link", { name: "P-000012" })).toHaveAttribute("href", "/batches/12");
    // Kam qoldiq — hozirgi ogohlantirish belgisi (izohi bilan); manfiy qoldiq — qizil
    expect(within(red).getByTitle("Kam qoldi — chegara 100 m")).toBeInTheDocument();
    expect(within(blue).getAllByText("-4.5")[0]).toHaveClass("text-madder");
    expect(screen.queryByRole("list", { name: "Qoldiq" })).toBeNull(); // telefon ko'rinishi chizilmaydi
  });

  it("joy tanlansa — faqat o'sha joy ustuni qoladi", async () => {
    setScreenWidth(1280);
    renderPage();
    const { default: userEvent } = await import("@testing-library/user-event");
    await screen.findByRole("table");
    await userEvent.selectOptions(screen.getByLabelText("Joy"), "2");
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Tovar", "Chorsu do'koni", "Jami",
    ]);
  });

  it("telefonda — avvalgi kartochka ko'rinishi (joylar yorliq bo'lib)", async () => {
    renderPage();
    expect(await screen.findByText("M101-03")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("list", { name: "Qoldiq" }).children).toHaveLength(2);
    expect(screen.getAllByText("Asosiy sklad").length).toBeGreaterThan(0);
  });

  it("bo'sh holat xabari saqlanadi", async () => {
    setScreenWidth(1280);
    api.mockResolvedValue({ ...stock, items: [], total: 0 });
    renderPage();
    expect(await screen.findByText(/Hali qoldiq yo'q/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
