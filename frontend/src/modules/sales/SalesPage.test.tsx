import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { todayISO } from "@/shared/format";
import { shift } from "@/shared/period";
import { setScreenWidth } from "@/test-utils";
import { SalesPage } from "./SalesPage";
import type { SalePage, SaleRow } from "./types";

const { api, role } = vi.hoisted(() => ({ api: vi.fn(), role: { current: "owner" } }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
}));
vi.mock("@/modules/auth/AuthProvider", () => ({
  useCurrentUser: () => ({ user: { id: 1, full_name: "Akmal Ega", role: role.current } }),
}));

const row = (changes: Partial<SaleRow>): SaleRow => ({
  id: 5, number: "S-000005", created_at: "2026-10-03T06:08:00Z",
  store: { id: 2, name: "Chorsu do'koni" }, seller: { id: 9, name: "Nodira Yusupova" },
  customer: null, total: 450_000, returned_total: 0, payment_type: "cash", status: "completed",
  ...changes,
});
const sales: SalePage = {
  total: 2,
  amount: 540_000,
  items: [
    row({}),
    row({
      id: 4, number: "S-000004", total: 90_000, payment_type: "credit", status: "partially_returned",
      returned_total: 20_000, customer: { id: 7, name: "Sardor Usta" },
    }),
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/sales"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route path="/sales" element={<SalesPage />} />
          <Route path="/sales/:id" element={<p>sotuv kartochkasi</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const listCalls = () => api.mock.calls.map((call) => call[0] as string).filter((path) => path.startsWith("/sales?"));
const lastQuery = () => new URLSearchParams(listCalls().at(-1)!.split("?")[1]);

describe("Sotuvlar ro'yxati", () => {
  beforeEach(() => {
    role.current = "owner";
    api.mockReset();
    api.mockImplementation((path: string) => {
      if (path.startsWith("/sales?")) return Promise.resolve(sales);
      if (path.startsWith("/locations")) return Promise.resolve([{ id: 2, name: "Chorsu do'koni" }]);
      return Promise.resolve([{ id: 9, full_name: "Nodira Yusupova", role: "seller" }]);
    });
  });
  afterEach(() => setScreenWidth(null));

  it("kompyuter va planshetda (≥768px) — jadval: ustunlar, o'ngga tekis summa, rangli yorliqlar", async () => {
    setScreenWidth(1280);
    renderPage();

    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Raqam", "Vaqt", "Do'kon", "Sotuvchi", "Mijoz", "To'lov turi", "Summa", "Holat",
    ]);
    const [, first, second] = within(table).getAllByRole("row");
    // (sonlardagi bo'shliq uzilmaydigan — oddiy bo'shliqqa keltirib solishtiramiz)
    expect(within(first).getAllByRole("cell").map((cell) => cell.textContent?.replace(/\s/g, " "))).toEqual([
      "S-000005", "03.10.2026, 11:08", "Chorsu do'koni", "Nodira Yusupova", "—", "Naqd", "450 000", "Yakunlangan",
    ]);
    expect(within(second).getByText("Sardor Usta")).toBeInTheDocument();
    expect(within(second).getByText("Nasiya")).toBeInTheDocument();
    expect(within(second).getByText("Qisman qaytarilgan")).toBeInTheDocument();
    expect(within(second).getByText(/20 000 so'm qaytarilgan/)).toBeInTheDocument();
    // Raqam ustunlari o'ngga tekislangan
    expect(within(first).getByText("450 000").closest("td")).toHaveClass("text-right");
    expect(screen.queryByRole("list")).toBeNull(); // telefon ko'rinishi chizilmaydi
    expect(screen.getByText("2 ta sotuv · jami 540 000 so'm")).toBeInTheDocument();

    // Qator bosilsa — kartochka ochiladi (raqam — klaviatura uchun havola)
    expect(within(first).getByRole("link", { name: "S-000005" })).toHaveAttribute("href", "/sales/5");
    await userEvent.click(within(first).getByText("Nodira Yusupova"));
    expect(await screen.findByText("sotuv kartochkasi")).toBeInTheDocument();
  });

  it("telefonda — avvalgi kartochka ko'rinishi", async () => {
    renderPage();
    expect(await screen.findByRole("link", { name: /S-000005/ })).toHaveAttribute("href", "/sales/5");
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("davr: standart — Bugun; tayyor tugmalar sanani o'zi qo'yadi; sana maydonlari faqat ixtiyoriy oraliqda", async () => {
    renderPage();
    await screen.findByRole("link", { name: /S-000005/ });
    const today = todayISO();
    expect(screen.getByRole("radio", { name: "Bugun" })).toBeChecked();
    expect([lastQuery().get("date_from"), lastQuery().get("date_to")]).toEqual([today, today]);
    expect(screen.queryByLabelText("Sanadan")).toBeNull();

    await userEvent.click(screen.getByRole("radio", { name: "Kecha" }));
    await screen.findByRole("link", { name: /S-000005/ });
    expect([lastQuery().get("date_from"), lastQuery().get("date_to")]).toEqual([shift(today, -1), shift(today, -1)]);

    await userEvent.click(screen.getByRole("radio", { name: "Barchasi" }));
    await screen.findByRole("link", { name: /S-000005/ });
    expect(lastQuery().has("date_from")).toBe(false);

    await userEvent.click(screen.getByRole("radio", { name: "Ixtiyoriy oraliq" }));
    expect(screen.getByLabelText("Sanadan")).toBeInTheDocument();
    expect(screen.getByLabelText("Sanagacha")).toBeInTheDocument();
  });

  it("qo'shimcha filtrlar 'Filtr' tugmasi ortida; faol filtrlar soni tugmada ko'rinadi", async () => {
    renderPage();
    await screen.findByRole("link", { name: /S-000005/ });
    expect(screen.getByRole("searchbox", { name: "Sotuv raqami yoki mijoz" })).toBeVisible();
    const toggle = screen.getByRole("button", { name: /^Filtr(?!larni)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("To'lov turi")).not.toBeVisible();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.selectOptions(screen.getByLabelText("To'lov turi"), "credit");
    await userEvent.selectOptions(screen.getByLabelText("Holat"), "cancelled");

    expect(screen.getByRole("button", { name: /^Filtr(?!larni)/ })).toHaveTextContent("2");
    await screen.findByRole("link", { name: /S-000005/ });
    expect([lastQuery().get("payment_type"), lastQuery().get("status")]).toEqual(["credit", "cancelled"]);
  });

  it("sotuvchi: 'Bugungi sotuvlarim' — filtrsiz; do'kon ustuni yo'q", async () => {
    role.current = "seller";
    setScreenWidth(1024);
    renderPage();
    const table = await screen.findByRole("table");
    expect(within(table).queryByRole("columnheader", { name: "Do'kon" })).toBeNull();
    expect(lastQuery().get("mine")).toBe("true");
    expect(screen.queryByRole("button", { name: /^Filtr(?!larni)/ })).toBeNull();
  });
});
