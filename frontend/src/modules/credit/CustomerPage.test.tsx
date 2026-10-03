import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/shared/api/client";
import { CustomerPage } from "./CustomerPage";
import { CustomersPage } from "./CustomersPage";
import type { CustomerCard, CustomerPage as CustomerList } from "./types";

const { api, post, patch } = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
  post,
  patch,
}));
vi.mock("@/modules/auth/AuthProvider", () => ({
  useCurrentUser: () => ({ user: { id: 1, full_name: "Akmal Ega", role: "owner" } }),
}));

const debt = {
  store: "Chorsu do'koni", seller: "Nodira Sotuvchi", initial_payment: 0, paid: 0, written_off: 0, returned: 0,
};
// Ikki qarz: eskisi (S-000001) 45 kunlik, muddati o'tgan — 300 000; yangisi — 90 000
const customer: CustomerCard = {
  id: 7,
  name: "Sardor Usta",
  phone: "+998901234567",
  note: "tikuv sexi",
  is_active: true,
  debt: 390_000,
  overdue: 300_000,
  oldest_days: 45,
  last_payment_at: "2026-09-20T06:00:00Z",
  debts: [
    {
      ...debt, id: 31, sale_id: 1, sale_number: "S-000001", created_at: "2026-08-18T06:00:00Z",
      sale_total: 450_000, initial_payment: 50_000, amount: 400_000, paid: 100_000, remaining: 300_000,
      due_date: "2026-09-17", overdue: true, days: 45,
    },
    {
      ...debt, id: 32, sale_id: 2, sale_number: "S-000002", created_at: "2026-10-01T06:00:00Z",
      sale_total: 90_000, amount: 90_000, remaining: 90_000, due_date: "2026-10-31", overdue: false, days: 1,
    },
  ],
  payments: [
    {
      id: 5, created_at: "2026-09-20T06:00:00Z", amount: 100_000, method: "card", user: "Nodira Sotuvchi",
      store: "Chorsu do'koni", allocations: [{ sale_id: 1, sale_number: "S-000001", amount: 100_000 }],
    },
  ],
  writeoffs: [],
};

function renderCard(card: CustomerCard = customer) {
  api.mockResolvedValue(card);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/customers/7"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route path="/customers/:id" element={<CustomerPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Mijoz kartochkasi", () => {
  beforeEach(() => {
    api.mockReset();
    post.mockReset();
    patch.mockReset();
    post.mockResolvedValue({ id: 9, amount: 150_000, debt: 240_000 });
  });

  it("qarzlar, muddati o'tgani va to'lovlar tarixi ko'rinadi", async () => {
    renderCard();
    expect(await screen.findByRole("heading", { name: "Sardor Usta" })).toBeInTheDocument();
    expect(screen.getByText("Jami qarz").closest("section")).toHaveTextContent("390 000 so'm");
    expect(screen.getByText("Muddati o'tgan").closest("section")).toHaveTextContent("300 000 so'm");
    expect(screen.getByRole("link", { name: "S-000001" })).toHaveAttribute("href", "/sales/1");
    expect(screen.getByText("muddati o'tgan")).toBeInTheDocument();
    expect(
      screen.getByText("sotuv 450 000 · boshlang'ich to'lov 50 000 · to'langan 100 000"),
    ).toBeInTheDocument();
    expect(screen.getByText("S-000001: 100 000")).toBeInTheDocument(); // to'lov qaysi qarzga yozilgani
  });

  it("to'lov: qarzdan ko'p qabul qilinmaydi; standart — eng eski qarzdan boshlab", async () => {
    renderCard();
    await userEvent.click(await screen.findByRole("button", { name: "To'lov qabul qilish" }));

    await userEvent.type(screen.getByLabelText("Summa"), "400000");
    await userEvent.click(screen.getByRole("button", { name: "To'lovni qabul qilish" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Qarz 390 000 so'm — bundan ko'p bo'lmaydi");
    expect(post).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText("Summa"));
    await userEvent.type(screen.getByLabelText("Summa"), "150000");
    await userEvent.click(screen.getByRole("radio", { name: "Karta" }));
    await userEvent.click(screen.getByRole("button", { name: "To'lovni qabul qilish" }));

    expect(post).toHaveBeenCalledWith("/customers/7/payments", { amount: 150_000, method: "card", debt_id: null });
    expect(await screen.findByText(/To'lov qabul qilindi: 150 000 so'm. Qolgan qarz: 240 000 so'm/)).toBeInTheDocument();
  });

  it("to'lov aniq qarzga yozilsa, chegara — o'sha qarz", async () => {
    renderCard();
    await userEvent.click(await screen.findByRole("button", { name: "To'lov qabul qilish" }));
    await userEvent.selectOptions(screen.getByLabelText("Qaysi qarzga"), "32");

    await userEvent.click(screen.getByRole("button", { name: /Hammasi — 90\s000/ }));
    expect(screen.getByLabelText("Summa")).toHaveValue("90 000");
    await userEvent.click(screen.getByRole("button", { name: "To'lovni qabul qilish" }));

    expect(post).toHaveBeenCalledWith("/customers/7/payments", { amount: 90_000, method: "cash", debt_id: 32 });
  });

  it("hisobdan chiqarishda sabab majburiy", async () => {
    post.mockResolvedValue(undefined);
    renderCard();
    await userEvent.click(await screen.findByRole("button", { name: "S-000002: qarzni hisobdan chiqarish" }));

    // Boshida — qolgan qarzning hammasi
    expect(screen.getByLabelText("Hisobdan chiqariladigan summa")).toHaveValue("90 000");
    await userEvent.click(screen.getByRole("button", { name: "Ha, hisobdan chiqarish" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Sababni yozing");
    expect(post).not.toHaveBeenCalled();

    await userEvent.clear(screen.getByLabelText("Hisobdan chiqariladigan summa"));
    await userEvent.type(screen.getByLabelText("Hisobdan chiqariladigan summa"), "10000");
    await userEvent.type(screen.getByLabelText("Sabab"), "Mato nuqsonli chiqdi");
    await userEvent.click(screen.getByRole("button", { name: "Ha, hisobdan chiqarish" }));

    expect(post).toHaveBeenCalledWith("/debts/32/writeoff", { amount: 10_000, reason: "Mato nuqsonli chiqdi" });
    expect(await screen.findByText(/10 000 so'm hisobdan chiqarildi/)).toBeInTheDocument();
  });

  it("tahrirlash: band telefon egasi aytiladi; qarzi bor mijozda faolsizlantirish yo'q", async () => {
    patch.mockRejectedValue(
      new ApiError(409, "customer_phone_taken", "", undefined, undefined, { customer_id: 8, name: "Tikuv sexi" }),
    );
    renderCard();
    await userEvent.click(await screen.findByRole("button", { name: "Tahrirlash" }));

    expect(screen.getByLabelText("Telefon raqami")).toHaveValue("90 123 45 67");
    expect(screen.queryByRole("button", { name: "Faolsizlantirish" })).toBeNull();
    await userEvent.clear(screen.getByLabelText("Ism"));
    await userEvent.type(screen.getByLabelText("Ism"), "Sardor aka");
    await userEvent.click(screen.getByRole("button", { name: "Saqlash" }));

    expect(patch).toHaveBeenCalledWith("/customers/7", {
      name: "Sardor aka", phone: "+998901234567", note: "tikuv sexi",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Bu raqam «Tikuv sexi»ga tegishli.");
  });

  it("qarzsiz mijozda to'lov tugmasi yo'q, faolsizlantirsa bo'ladi", async () => {
    post.mockResolvedValue(undefined);
    renderCard({ ...customer, debt: 0, overdue: 0, oldest_days: null, debts: [], payments: [] });
    expect(await screen.findByText("Bu mijozda nasiya sotuv yo'q.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "To'lov qabul qilish" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Tahrirlash" }));
    await userEvent.click(screen.getByRole("button", { name: "Faolsizlantirish" }));
    // Avval tasdiq so'raladi; "Yo'q, qolsin" — hech narsa o'zgarmaydi
    await userEvent.click(screen.getByRole("button", { name: "Yo'q, qolsin" }));
    expect(post).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Faolsizlantirish" }));
    await userEvent.click(screen.getByRole("button", { name: "Ha, faolsizlantirish" }));
    expect(post).toHaveBeenCalledWith("/customers/7/active", { is_active: false });
  });
});

describe("Mijozlar ro'yxati", () => {
  const list: CustomerList = {
    total: 2,
    debt_total: 390_000,
    overdue_total: 300_000,
    items: [
      { ...customer },
      {
        id: 8, name: "Tikuv sexi", phone: "+998935550011", note: null, is_active: true,
        debt: 0, overdue: 0, oldest_days: null, last_payment_at: null,
      },
    ],
  };

  it("har mijozning qarzi va muddati o'tgan qismi ko'rinadi; filtr serverga boradi", async () => {
    api.mockReset();
    api.mockResolvedValue(list);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <CustomersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const sardor = (await screen.findByText("Sardor Usta")).closest("li") as HTMLElement;
    expect(within(sardor).getByText("390 000 so'm")).toBeInTheDocument();
    expect(within(sardor).getByText("muddati o'tgan 300 000 so'm")).toBeInTheDocument();
    expect(within(sardor).getByText(/eng eski qarz — 45 kun · oxirgi to'lov 20.09.2026/)).toBeInTheDocument();
    expect(within(sardor).getByRole("link")).toHaveAttribute("href", "/customers/7");
    expect(within(screen.getByText("Tikuv sexi").closest("li") as HTMLElement).getByText("Qarzi yo'q")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Muddati o'tganlar" }));
    expect(api).toHaveBeenLastCalledWith(expect.stringContaining("only=overdue"));
  });
});
