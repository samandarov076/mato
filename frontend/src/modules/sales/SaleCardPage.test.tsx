import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SaleCardPage } from "./SaleCardPage";
import type { SaleCard } from "./types";

const { api, post, me } = vi.hoisted(() => ({
  api: vi.fn(),
  post: vi.fn(),
  me: { id: 1, full_name: "Akmal Ega", role: "owner" },
}));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
  post,
}));
vi.mock("@/modules/auth/AuthProvider", () => ({ useCurrentUser: () => ({ user: me }) }));

// Nasiya sotuv: 10 m × 45 000 = 450 000; boshlang'ich to'lov 150 000, qarz 300 000
const sale: SaleCard = {
  id: 5,
  number: "S-000005",
  created_at: "2026-10-02T06:00:00Z",
  store: { id: 2, name: "Chorsu do'koni" },
  seller: { id: 9, name: "Nodira Sotuvchi" },
  customer: { id: 7, name: "Sardor Usta" },
  total: 450_000,
  returned_total: 0,
  payment_type: "credit",
  status: "completed",
  initial_payment: 150_000,
  initial_payment_method: "card",
  lines: [
    {
      id: 51,
      sku_label: "M101-01 · Atlas · Qizil",
      batch_id: 12,
      batch_number: "P-000012",
      meters: "10.00",
      kg: "2.500",
      price_per_m: 45000,
      recommended_price_per_m: 47000,
      amount: 450_000,
      returned_m: "0.00",
      returned_amount: 0,
      negative_stock_note: null,
      cost_per_m: 30000,
    },
  ],
  debt: { amount: 300_000, remaining: 300_000, due_date: "2026-11-01", status: "active" },
  returns: [],
  profit: 150_000,
  cancelled_by: null,
  cancelled_at: null,
  cancel_reason: null,
  can_cancel: true,
  can_return: true,
};

function renderPage(card: SaleCard = sale) {
  api.mockResolvedValue(card);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/sales/5"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route path="/sales/:id" element={<SaleCardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const returned = () => screen.getByLabelText("M101-01 · Atlas · Qizil: qaytgan metr");

describe("Sotuv kartochkasi", () => {
  beforeEach(() => {
    api.mockReset();
    post.mockReset();
    post.mockResolvedValue({ id: 1, amount: 180_000, debt_amount: 180_000, refund: 0 });
    me.role = "owner";
  });

  it("biznes egasi tannarx va foydani ko'radi; nasiya — qarz va muddati bilan", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Sotuv S-000005" })).toBeInTheDocument();
    expect(screen.getByText("Yakunlangan")).toBeInTheDocument();
    expect(screen.getByText("Sardor Usta")).toBeInTheDocument();
    expect(screen.getByText("tannarx 30 000")).toBeInTheDocument();
    expect(screen.getByText("Foyda").nextElementSibling).toHaveTextContent("150 000 so'm");
    expect(screen.getByText("Qolgan qarz").nextElementSibling).toHaveTextContent("300 000 so'm");
    expect(screen.getByText("Qarz muddati").nextElementSibling).toHaveTextContent("01.11.2026");
    expect(screen.getByRole("link", { name: "P-000012" })).toHaveAttribute("href", "/batches/12");
  });

  it("qaytarish: summa avval qarzdan ayriladi, qolgani pul bilan", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Qaytarish" }));

    await userEvent.type(returned(), "4");
    expect(screen.getByText("Qaytariladigan summa").nextElementSibling).toHaveTextContent("180 000 so'm");
    expect(screen.getByText("Qarzdan ayriladi").nextElementSibling).toHaveTextContent("180 000 so'm");
    // Hammasi qarzdan yopiladi — pul qaytarish usuli so'ralmaydi
    expect(screen.queryByRole("radiogroup", { name: "Pul qanday qaytariladi" })).toBeNull();

    // Hammasi qaytarilsa: 300 000 qarzdan, 150 000 (mijoz to'lagani) pul bilan
    await userEvent.click(screen.getByRole("button", { name: /Hammasi — 10/ }));
    expect(returned()).toHaveValue("10");
    expect(screen.getByText("Qarzdan ayriladi").nextElementSibling).toHaveTextContent("300 000 so'm");
    expect(screen.getByText("Pul bilan qaytariladi").nextElementSibling).toHaveTextContent("150 000 so'm");
    await userEvent.click(screen.getByRole("radio", { name: "Karta" }));
    await userEvent.click(screen.getByRole("button", { name: "Qaytarishni yozish" }));

    expect(post).toHaveBeenCalledWith("/sales/5/returns", {
      lines: [{ sale_line_id: 51, meters: "10" }],
      method: "card",
    });
    expect(await screen.findByText(/Qaytarish yozildi: 180 000 so'm/)).toBeInTheDocument();
  });

  it("sotilgandan ko'p yoki bo'sh qaytarish yuborilmaydi", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Qaytarish" }));

    await userEvent.click(screen.getByRole("button", { name: "Qaytarishni yozish" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Kamida bitta qatorga qaytgan metrni kiriting");

    await userEvent.type(returned(), "10,5");
    await userEvent.click(screen.getByRole("button", { name: "Qaytarishni yozish" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Metr noto'g'ri");
    expect(post).not.toHaveBeenCalled();
  });

  it("qisman qaytarilgan sotuvda qolgan metr va tarix ko'rinadi", async () => {
    renderPage({
      ...sale,
      status: "partially_returned",
      returned_total: 180_000,
      can_cancel: false,
      lines: [{ ...sale.lines[0], returned_m: "4.00", returned_amount: 180_000 }],
      debt: { ...sale.debt!, remaining: 120_000 },
      returns: [
        {
          id: 1, created_at: "2026-10-02T08:00:00Z", user: "Nodira Sotuvchi", amount: 180_000,
          debt_amount: 180_000, refund: 0, method: null,
          lines: [{ sku_label: "M101-01 · Atlas · Qizil", meters: "4.00", amount: 180_000 }],
        },
      ],
    });

    expect(await screen.findByText("Qisman qaytarilgan")).toBeInTheDocument();
    expect(screen.getByText("4 m qaytarilgan")).toBeInTheDocument();
    expect(screen.getByText("qarzdan 180 000 so'm ayrildi")).toBeInTheDocument();
    // Qaytarish bor — bekor qilib bo'lmaydi; yana ko'pi bilan 6 m qaytadi
    expect(screen.queryByRole("button", { name: "Sotuvni bekor qilish" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Qaytarish" }));
    expect(screen.getByRole("button", { name: /Hammasi — 6/ })).toBeInTheDocument();
  });

  it("bekor qilishda sabab majburiy", async () => {
    post.mockResolvedValue(undefined);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "Sotuvni bekor qilish" }));

    await userEvent.click(screen.getByRole("button", { name: "Ha, bekor qilish" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Sababni yozing");
    expect(post).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Bekor qilish sababi"), "Xato kiritildi");
    await userEvent.click(screen.getByRole("button", { name: "Ha, bekor qilish" }));
    expect(post).toHaveBeenCalledWith("/sales/5/cancel", { reason: "Xato kiritildi" });
  });

  it("sotuvchiga tannarx va foyda ko'rinmaydi; bekor qilingan sotuvda amal yo'q", async () => {
    me.role = "seller";
    renderPage({
      ...sale,
      status: "cancelled",
      profit: null,
      can_cancel: false,
      can_return: false,
      cancelled_by: "Akmal Ega",
      cancelled_at: "2026-10-02T07:00:00Z",
      cancel_reason: "Mijoz voz kechdi",
      debt: { ...sale.debt!, status: "cancelled" },
      lines: [{ ...sale.lines[0], cost_per_m: null }],
    });

    expect(await screen.findByText("Bekor qilingan")).toBeInTheDocument();
    expect(screen.getByText(/Akmal Ega bekor qildi/)).toBeInTheDocument();
    expect(screen.getByText("Sabab: Mijoz voz kechdi")).toBeInTheDocument();
    expect(screen.queryByText(/tannarx/)).toBeNull();
    expect(screen.queryByText("Foyda")).toBeNull();
    expect(screen.queryByRole("button", { name: "Qaytarish" })).toBeNull();
    expect(screen.getByRole("link", { name: "Bugungi sotuvlarim" })).toHaveAttribute("href", "/sales");
  });
});
