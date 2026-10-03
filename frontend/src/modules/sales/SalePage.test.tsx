import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "@/shared/api/client";
import { kgFromMeters, lineAmount, metersFromKg, overdrawn, type CartLine } from "./cart";
import { SalePage } from "./SalePage";
import type { SaleContext } from "./types";

const { api, post } = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn() }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
  post,
}));
vi.mock("@/modules/auth/AuthProvider", () => ({
  useCurrentUser: () => ({
    user: { id: 9, full_name: "Nodira Sotuvchi", role: "seller" },
    business: { id: 1, name: "Atlas savdo", autolock_minutes: 30 },
    store: { id: 2, name: "Chorsu do'koni" },
  }),
}));

const sku = (id: number, color: { id: number; code: string; name: string }) => ({
  id,
  code: `M101-${color.code}`,
  price: null,
  price_unit: "m" as const,
  low_stock_threshold: null,
  is_active: true,
  fabric: { id: 1, code: "M101", name: "Atlas", default_m_per_kg: "4.0000", is_active: true },
  color: { ...color, hex: null, image_url: null, is_active: true },
  pattern: { id: 21, code: "0", name: "Gulsiz", image_url: null, is_plain: true, is_active: true },
});

// Do'konda: Qizil — ikki partiya (eskisi P-000012), 1 kg = 4 m, tavsiya narx 45 000; Ko'k — koeffitsient va narxsiz
const context: SaleContext = {
  store: { id: 2, name: "Chorsu do'koni" },
  sell_by_kg: true,
  credit_enabled: true,
  items: [
    {
      sku: sku(101, { id: 11, code: "01", name: "Qizil" }),
      batches: [
        { id: 12, number: "P-000012", receipt_date: "2026-09-20", qty_m: "200.00", m_per_kg: "4.0000", recommended_price_per_m: 45000 },
        { id: 15, number: "P-000015", receipt_date: "2026-10-01", qty_m: "100.00", m_per_kg: "4.0000", recommended_price_per_m: 45000 },
      ],
    },
    {
      sku: sku(102, { id: 12, code: "02", name: "Ko'k" }),
      batches: [
        { id: 13, number: "P-000013", receipt_date: "2026-09-25", qty_m: "50.00", m_per_kg: null, recommended_price_per_m: null },
      ],
    },
  ],
};
const customers = [{ id: 7, name: "Sardor Usta", phone: "+998901234567", debt: 300_000 }];

// jsdom'da scrollIntoView yo'q; xato/natija xabari (Alert focus) ko'rinadigan joyga suriladi
Element.prototype.scrollIntoView = vi.fn();

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <SalePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const scanner = () => screen.findByLabelText("Partiya raqami yoki tovar (skaner ham shu yerga)");
const finish = () => userEvent.click(screen.getByRole("button", { name: "Yakunlash" }));

/** Skaner bilan P-000012 dan `meters` m, tavsiya narxda savatga qo'shadi */
async function addLine(meters = "10") {
  await userEvent.type(await scanner(), "P-000012{Enter}");
  await userEvent.type(screen.getByLabelText("Metr"), meters);
  await userEvent.click(screen.getByRole("button", { name: /Tavsiya narx/ }));
  await userEvent.click(screen.getByRole("button", { name: "Qo'shish" }));
}

describe("Sotuv ekrani", () => {
  beforeEach(() => {
    localStorage.clear();
    api.mockReset();
    post.mockReset();
    api.mockImplementation((path: string) => {
      if (path.startsWith("/sales/context")) return Promise.resolve(context);
      if (path.startsWith("/customers/search")) return Promise.resolve(customers);
      return Promise.reject(new ApiError(404, "batch_not_found", "batch_not_found"));
    });
    post.mockResolvedValue({ id: 5, number: "S-000001", total: 105_750, payment_type: "cash", duplicate: false });
  });

  it("skaner partiyani topadi, kg o'zi hisoblanadi, tavsiya narx bir bosishda qo'yiladi", async () => {
    renderPage();
    await userEvent.type(await scanner(), "p-000012{Enter}");

    expect(screen.getByText("M101-01")).toBeInTheDocument();
    expect(screen.getByLabelText("Partiya")).toHaveValue("12");
    await userEvent.type(screen.getByLabelText("Metr"), "2,35");
    expect(screen.getByLabelText("Kg")).toHaveValue("0.588"); // 2.35 m ÷ 4
    await userEvent.click(screen.getByRole("button", { name: /Tavsiya narx/ }));
    expect(screen.getByLabelText("1 metr narxi")).toHaveValue("45 000");
    await userEvent.click(screen.getByRole("button", { name: "Qo'shish" }));

    expect(screen.getAllByText("105 750")).toHaveLength(2); // qator summasi va jami
    await finish();

    expect(post).toHaveBeenCalledWith("/sales", {
      client_uuid: expect.any(String),
      store_id: null,
      payment_type: "cash",
      customer_id: null,
      initial_payment: 0,
      initial_payment_method: null,
      lines: [{ batch_id: 12, meters: "2.35", kg: "0.588", price_per_m: 45000, negative_stock_note: null }],
    });
    // Ekran yangi sotuvga tayyor
    expect(await screen.findByText(/S-000001 yozildi/)).toBeInTheDocument();
    expect(screen.getByText(/Savat bo'sh/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sotuvni ochish" })).toHaveAttribute("href", "/sales/5");
  });

  it("qo'lda tanlashda eng eski partiya olinadi; kg kiritilsa metr hisoblanadi", async () => {
    renderPage();
    await scanner();
    await userEvent.click(screen.getByRole("button", { name: "M101 · Atlas" }));
    await userEvent.click(screen.getByRole("button", { name: "01 · Qizil" }));

    expect(screen.getByLabelText("Partiya")).toHaveValue("12"); // P-000012 eskiroq
    await userEvent.type(screen.getByLabelText("Kg"), "1,5");
    expect(screen.getByLabelText("Metr")).toHaveValue("6"); // 1.5 kg × 4

    // Narxsiz qo'shilmaydi — sababi qizil matnda
    await userEvent.click(screen.getByRole("button", { name: "Qo'shish" }));
    expect(screen.getByRole("alert")).toHaveTextContent("1 metr narxini kiriting");
    expect(screen.getByText(/Savat bo'sh/)).toBeInTheDocument();
  });

  it("qoldiqdan ko'p sotishda izoh majburiy", async () => {
    renderPage();
    await scanner();
    await userEvent.click(screen.getByRole("button", { name: "M101 · Atlas" }));
    await userEvent.click(screen.getByRole("button", { name: "02 · Ko'k" }));

    // Bu partiyada koeffitsient va tavsiya narx yo'q
    expect(screen.getByLabelText("Kg")).toBeDisabled();
    expect(screen.getByText(/kg ↔ metr belgilanmagan/)).toBeInTheDocument();
    expect(screen.getByText(/Tavsiya narx yo'q/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Metr"), "52"); // do'konda 50 m
    expect(screen.getByText(/Tizimda 50 m qolgan/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("1 metr narxi"), "30000");
    await userEvent.click(screen.getByRole("button", { name: "Qo'shish" }));

    await finish();
    expect(screen.getByRole("alert")).toHaveTextContent("Qoldiqdan ko'p sotilayotgan qatorga izoh yozing");
    expect(post).not.toHaveBeenCalled();
    // Xabar "Yakunlash" yonida paydo bo'lib fokus oladi — keyin izoh yoziladi
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());

    await userEvent.type(screen.getByLabelText("1-qator: izoh"), "Rulon 52 m chiqdi");
    await finish();
    expect(post.mock.calls[0][1].lines).toEqual([
      { batch_id: 13, meters: "52", kg: null, price_per_m: 30000, negative_stock_note: "Rulon 52 m chiqdi" },
    ]);
  });

  it("skaner kodi topilmasa — qo'lda tanlashga yo'naltiradi", async () => {
    renderPage();
    await userEvent.type(await scanner(), "P-999999{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Partiya topilmadi — tovarni qo'lda tanlang");

    // Partiya bor, lekin boshqa joyda
    api.mockImplementation((path: string) =>
      Promise.resolve(path.startsWith("/sales/context") ? context : { id: 77 }),
    );
    await userEvent.clear(await scanner());
    await userEvent.type(await scanner(), "P-000077{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Bu partiya shu do'konda yo'q");
  });

  it("savatdagi qator tahrirlanadi va o'chiriladi; savat sahifa yangilansa ham saqlanadi", async () => {
    const first = renderPage();
    await addLine("10");
    expect(screen.getAllByText("450 000")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "1-qatorni tahrirlash" }));
    await userEvent.clear(screen.getByLabelText("Metr"));
    await userEvent.type(screen.getByLabelText("Metr"), "20");
    await userEvent.click(screen.getByRole("button", { name: "Saqlash" }));
    expect(screen.getAllByText("900 000")).toHaveLength(2);

    first.unmount();
    renderPage();
    expect(await screen.findAllByText("900 000")).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "1-qatorni o'chirish" }));
    expect(screen.getByText(/Savat bo'sh/)).toBeInTheDocument();
  });

  it("internet uzilsa savat saqlanadi va ulanish tiklangach o'sha savat qayta yuboriladi", async () => {
    post.mockRejectedValueOnce(new ApiError(0, "network_error", "network_error"));
    renderPage();
    await addLine();
    await finish();

    expect(await screen.findByText(/Sotuv yuborilmadi — internet yo'q/)).toBeInTheDocument();
    // Javob noma'lum — savatni o'zgartirib bo'lmaydi
    expect(screen.queryByRole("button", { name: "Yakunlash" })).toBeNull();
    expect(screen.queryByRole("button", { name: "1-qatorni o'chirish" })).toBeNull();

    window.dispatchEvent(new Event("online"));

    expect(await screen.findByText(/S-000001 yozildi/)).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
    // Ikkala urinishda bir xil identifikator — server sotuvni bir marta yozadi
    expect(post.mock.calls[1][1].client_uuid).toBe(post.mock.calls[0][1].client_uuid);
  });

  it("server izoh so'rasa (qoldiq o'zgargan) — o'sha qatorda izoh maydoni ochiladi", async () => {
    post.mockRejectedValueOnce(
      new ApiError(409, "negative_stock_note_required", "", undefined, undefined, {
        batch: "P-000012", available: "5.00", line: 0,
      }),
    );
    renderPage();
    await addLine();
    await finish();

    expect(await screen.findByRole("alert")).toHaveTextContent("P-000012: tizimda 5.00 m qolgan");
    expect(screen.getByLabelText("1-qator: izoh")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Yakunlash" })).toBeEnabled();
  });

  it("nasiya: mijoz tanlanadi, boshlang'ich to'lov yoziladi", async () => {
    renderPage();
    await addLine();
    await userEvent.click(screen.getByRole("radio", { name: "Nasiya" }));

    await finish();
    expect(screen.getByRole("alert")).toHaveTextContent("Nasiya uchun mijozni tanlang");

    await userEvent.click(await screen.findByRole("button", { name: /Sardor Usta/ }));
    expect(screen.getByText(/Hozirgi qarzi: 300 000 so'm/)).toBeInTheDocument();
    expect(screen.getByText(/Qarzga yoziladi: 450 000 so'm/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Boshlang'ich to'lov"), "50000");
    expect(screen.getByText(/Qarzga yoziladi: 400 000 so'm/)).toBeInTheDocument();
    const method = screen.getByRole("radiogroup", { name: "Boshlang'ich to'lov turi" });
    await userEvent.click(within(method).getByRole("radio", { name: "Karta" }));
    await finish();

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1]).toMatchObject({
      payment_type: "credit",
      customer_id: 7,
      initial_payment: 50000,
      initial_payment_method: "card",
    });
  });

  it("nasiya sozlamada o'chirilgan bo'lsa — to'lov turlarida ko'rinmaydi", async () => {
    api.mockResolvedValue({ ...context, credit_enabled: false });
    renderPage();
    await scanner();
    expect(screen.getByRole("radio", { name: "Naqd" })).toBeChecked();
    expect(screen.queryByRole("radio", { name: "Nasiya" })).toBeNull();
  });
});

describe("savat hisob-kitobi", () => {
  const line = (id: string, batch_id: number, meters: string): CartLine => ({
    id, batch_id, meters, batch_number: "", sku_code: "", sku_name: "", hex: null, image_url: null,
    kg: null, price: 1000, recommended: null, note: "",
  });

  it("qator summasi butun so'mgacha, yarim so'm — yuqoriga", () => {
    expect(lineAmount("2.35", 44000)).toBe(103_400);
    expect(lineAmount("1.5", 3333)).toBe(5000); // 4 999.5
    expect(lineAmount("0.5", 3333)).toBe(1667); // 1 666.5
  });

  it("metr ↔ kg partiya koeffitsienti bo'yicha", () => {
    expect(kgFromMeters("2.35", "4.0000")).toBe("0.588");
    expect(kgFromMeters("200", "2.8011")).toBe("71.401");
    expect(metersFromKg("1.5", "4.0000")).toBe("6");
    expect(metersFromKg("1.3", "2.8011")).toBe("3.64");
    expect(kgFromMeters("0.001", "4.0000")).toBe("");
  });

  it("bir partiyadan bir necha qator — qoldiq ketma-ket kamayadi", () => {
    const lines = [line("a", 1, "30"), line("b", 1, "30"), line("c", 2, "5"), line("d", 9, "1")];
    // 1-partiyada 50 m: ikkinchi qator uchun 20 m qolgan; 9-partiya ro'yxatda yo'q — tekshirilmaydi
    expect(overdrawn(lines, { 1: "50.00", 2: "5.00" })).toEqual({ b: 20 });
  });
});
