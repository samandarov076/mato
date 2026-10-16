import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/shared/api/client";
import i18n from "@/shared/i18n";
import { setScreenWidth } from "@/test-utils";
import { ReceiptCreatePage } from "./ReceiptCreatePage";
import { lineAmount, lineCoefficient, type LineDraft } from "./types";

const { api, post } = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn() }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
  post,
}));
// Qoralama kaliti foydalanuvchi id'si bilan — sahifa kirgan xodimni biladi
vi.mock("@/modules/auth/AuthProvider", () => ({
  useCurrentUser: () => ({ user: { id: 5, full_name: "Dilshod Omborchi", role: "warehouse" } }),
}));

const fabric = {
  id: 1, code: "M101", name: "Atlas", width_cm: null, composition: null, image_url: null,
  default_m_per_kg: "4.0000", is_active: true, sku_count: 1,
};
const colors = [
  { id: 11, code: "01", name: "Qizil", hex: "#c0392b", image_url: null, is_plain: false, is_active: true, sku_count: 1 },
  { id: 12, code: "02", name: "Ko'k", hex: null, image_url: null, is_plain: false, is_active: true, sku_count: 0 },
];
const patterns = [
  { id: 21, code: "0", name: "Gulsiz", hex: null, image_url: null, is_plain: true, is_active: true, sku_count: 1 },
];
// Katalogda faqat M101-01 bor (narxi 40 000 so'm / m); M101-02 — yangi SKU
const existingSku = {
  id: 101, code: "M101-01", price: 40000, price_unit: "m", low_stock_threshold: null, is_active: true,
  fabric: { id: 1, code: "M101", name: "Atlas", image_url: null, default_m_per_kg: "4.0000", is_active: true },
  color: { id: 11, code: "01", name: "Qizil", hex: "#c0392b", image_url: null, is_active: true },
  pattern: { id: 21, code: "0", name: "Gulsiz", image_url: null, is_plain: true, is_active: true },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={["/receiving/new"]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <Routes>
          <Route path="/receiving/new" element={<ReceiptCreatePage />} />
          <Route path="/receiving/:id" element={<p>kirim kartochkasi</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** n-partiya kartochkasi */
const batch = (n: number) =>
  screen.getByRole("heading", { name: `${n}-partiya` }).closest("section") as HTMLElement;

async function fill(card: HTMLElement, color: string, rolls: string, meters: string, cost: string) {
  await userEvent.selectOptions(within(card).getByLabelText("Mato"), "1");
  await userEvent.selectOptions(within(card).getByLabelText("Rang"), color);
  await userEvent.type(within(card).getByLabelText("Rulonlar soni"), rolls);
  await userEvent.type(within(card).getByLabelText("Metr (rulonlar jami)"), meters);
  await userEvent.type(within(card).getByLabelText("Tannarx, 1 metr uchun"), cost);
}

describe("Kirim yaratish", () => {
  beforeEach(() => {
    localStorage.clear(); // oldingi testning qoralamasi tiklanmasin
    post.mockReset();
    api.mockReset();
    api.mockImplementation((path: string) => {
      if (path.startsWith("/receipts/options")) {
        return Promise.resolve({ warehouses: [{ id: 5, name: "Asosiy sklad" }], creators: [] });
      }
      if (path.startsWith("/catalog/fabrics")) return Promise.resolve([fabric]);
      if (path.startsWith("/catalog/colors")) return Promise.resolve(colors);
      if (path.startsWith("/catalog/patterns")) return Promise.resolve(patterns);
      const found = path.includes("color_id=11") ? [existingSku] : [];
      return Promise.resolve({ items: found, total: found.length });
    });
  });

  it("to'ldirilmagan qatorni saqlamaydi va nima yetishmasligini ko'rsatadi", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "1-partiya" });

    await userEvent.click(screen.getByRole("button", { name: "Kirimni saqlash" }));

    expect(screen.getByText("Matoni tanlang")).toBeInTheDocument();
    expect(screen.getByText("Rangni tanlang")).toBeInTheDocument();
    expect(screen.getByText("Butun son kiriting, kamida 1")).toBeInTheDocument();
    expect(screen.getByText("Tannarxni kiriting")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it("partiyalarni saqlaydi: jami ko'rinadi, narx faqat yozilgan qatorda yuboriladi", async () => {
    post.mockResolvedValue({ id: 77 });
    renderPage();
    await screen.findByRole("heading", { name: "1-partiya" });

    await fill(batch(1), "11", "10", "500", "30000");
    expect(await within(batch(1)).findByText(/Hozir: 40 000 so'm \/ m/)).toBeInTheDocument();
    expect(within(batch(1)).getByText("Jami: 15 000 000 so'm")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Qator qo'shish" }));
    await fill(batch(2), "12", "4", "200,5", "10000");
    expect(await within(batch(2)).findByText(/Bunday SKU hali yo'q/)).toBeInTheDocument();
    await userEvent.type(within(batch(2)).getByLabelText("Narx"), "25000");

    // Jami: 2 partiya, 700.5 m, 15 000 000 + 2 005 000
    expect(screen.getByText("700.5 m")).toBeInTheDocument();
    expect(screen.getByText("17 005 000 so'm")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Kirimni saqlash" }));

    expect(post).toHaveBeenCalledTimes(1);
    const [path, body] = post.mock.calls[0];
    expect(path).toBe("/receipts");
    expect(body.warehouse_id).toBe(5); // yagona sklad o'zi tanlangan
    expect(body.lines).toEqual([
      {
        fabric_id: 1, color_id: 11, pattern_id: null,
        rolls_count: 10, meters: "500", kg: null, m_per_kg: null, cost_per_m: 30000,
      },
      {
        fabric_id: 1, color_id: 12, pattern_id: null,
        rolls_count: 4, meters: "200.5", kg: null, m_per_kg: null, cost_per_m: 10000,
        price: 25000, price_unit: "m",
      },
    ]);
    expect(await screen.findByText("kirim kartochkasi")).toBeInTheDocument();
  });

  it("javob kelmasa qayta saqlash o'sha identifikator bilan ketadi — kirim ikki marta yozilmaydi", async () => {
    post.mockRejectedValueOnce(new ApiError(504, "server_error", "Gateway Timeout"));
    post.mockResolvedValueOnce({ id: 77 });
    renderPage();
    await screen.findByRole("heading", { name: "1-partiya" });
    await fill(batch(1), "11", "10", "500", "30000");
    const save = () => userEvent.click(screen.getByRole("button", { name: "Kirimni saqlash" }));

    await save();
    expect(await screen.findByText(/Serverda xatolik yuz berdi/)).toBeInTheDocument();
    const sent = post.mock.calls[0][1].client_uuid;
    expect(sent).toMatch(/^[0-9a-f-]{36}$/);

    cleanup(); // sahifa yangilandi — qoralama va identifikator qurilmada
    renderPage();
    await screen.findByRole("heading", { name: "1-partiya" });
    await save();

    expect(await screen.findByText("kirim kartochkasi")).toBeInTheDocument();
    expect(post.mock.calls[1][1].client_uuid).toBe(sent);
  });

  it("metr va kg matoning standartidan ancha farq qilsa — ogohlantiradi", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "1-partiya" });
    await fill(batch(1), "11", "10", "5000", "30000"); // aslida 500 bo'lishi kerak edi
    await userEvent.type(within(batch(1)).getByLabelText("Jami kg"), "125");

    expect(within(batch(1)).getByText(/1 kg = 40 m chiqdi, matoning standarti esa 4 m/)).toBeInTheDocument();
    expect(within(batch(1)).getByLabelText("1 kg necha metr")).toHaveValue("40");
  });

  it("tannarx tavsiya narxdan yuqori bo'lsa — ogohlantiradi", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "1-partiya" });
    await fill(batch(1), "11", "10", "500", "45000"); // tavsiya narx 40 000

    expect(await within(batch(1)).findByText("Tannarx sotuv narxidan yuqori.")).toBeInTheDocument();
  });

  it("bir xil tovar ikki qatorda bo'lsa — birlashtirishni taklif qiladi", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "1-partiya" });
    await fill(batch(1), "11", "10", "500", "30000");
    await userEvent.click(screen.getByRole("button", { name: "Qator qo'shish" }));
    await fill(batch(2), "11", "2", "100.5", "30000");

    expect(within(batch(2)).getByText("Bu tovar 1-partiyada ham bor.")).toBeInTheDocument();
    await userEvent.click(within(batch(2)).getByRole("button", { name: "Birlashtirish" }));

    expect(screen.queryByRole("heading", { name: "2-partiya" })).toBeNull();
    expect(within(batch(1)).getByLabelText("Rulonlar soni")).toHaveValue("12");
    expect(within(batch(1)).getByLabelText("Metr (rulonlar jami)")).toHaveValue("600.5");
  });

  it("yozilganlar qoralamada qoladi: sahifa qayta ochilsa tiklanadi, 'Tozalash' bo'sh formaga qaytaradi", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "1-partiya" });
    await fill(batch(1), "11", "10", "500", "30000");
    cleanup(); // sahifa yopildi (yangilandi) — qoralama qurilmada qoldi

    renderPage();
    await screen.findByRole("heading", { name: "1-partiya" });
    expect(within(batch(1)).getByLabelText("Rulonlar soni")).toHaveValue("10");
    expect(within(batch(1)).getByLabelText("Metr (rulonlar jami)")).toHaveValue("500");
    expect(screen.getByRole("status")).toHaveTextContent(i18n.t("common.draft_restored"));

    await userEvent.click(screen.getByRole("button", { name: i18n.t("common.clear_draft") }));
    expect(within(batch(1)).getByLabelText("Rulonlar soni")).toHaveValue("");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("to'ldirilgan qatorni olib tashlashdan oldin so'raydi, bo'sh qatorni darhol olib tashlaydi", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "1-partiya" });
    await fill(batch(1), "11", "10", "500", "30000");
    await userEvent.click(screen.getByRole("button", { name: "Qator qo'shish" }));

    // Bo'sh 2-partiya — so'ralmaydi
    await userEvent.click(screen.getByRole("button", { name: "2-partiyani olib tashlash" }));
    expect(screen.queryByRole("heading", { name: "2-partiya" })).toBeNull();

    // To'ldirilgan 1-partiya — avval tasdiq, "Yo'q, qolsin" uni saqlab qoladi
    await userEvent.click(screen.getByRole("button", { name: "Qator qo'shish" }));
    await userEvent.click(screen.getByRole("button", { name: "1-partiyani olib tashlash" }));
    expect(screen.getByRole("heading", { name: "1-partiya" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Yo'q, qolsin" }));
    expect(within(batch(1)).getByLabelText("Rulonlar soni")).toHaveValue("10");

    await userEvent.click(screen.getByRole("button", { name: "1-partiyani olib tashlash" }));
    await userEvent.click(screen.getByRole("button", { name: i18n.t("receiving.remove_yes") }));
    expect(screen.queryByRole("heading", { name: "2-partiya" })).toBeNull();
    expect(within(batch(1)).getByLabelText("Rulonlar soni")).toHaveValue("");
  });
});

describe("Kirim yaratish — kompyuterda (≥1024px) qatorli jadval", () => {
  beforeEach(() => {
    localStorage.clear();
    post.mockReset();
    api.mockReset();
    api.mockImplementation((path: string) => {
      if (path.startsWith("/receipts/options")) {
        return Promise.resolve({ warehouses: [{ id: 5, name: "Asosiy sklad" }], creators: [] });
      }
      if (path.startsWith("/catalog/fabrics")) return Promise.resolve([fabric]);
      if (path.startsWith("/catalog/colors")) return Promise.resolve(colors);
      if (path.startsWith("/catalog/patterns")) return Promise.resolve(patterns);
      const found = path.includes("color_id=11") ? [existingSku] : [];
      return Promise.resolve({ items: found, total: found.length });
    });
    setScreenWidth(1280);
  });
  afterEach(() => setScreenWidth(null));

  /** n-partiya qatori (jadvalda) */
  const row = (n: number) => screen.getByRole("row", { name: `${n}-partiya` });

  it("har partiya — bitta jadval qatori; Tab bilan chapdan o'ngga yuriladi; saqlash o'sha so'rovni yuboradi", async () => {
    post.mockResolvedValue({ id: 77 });
    renderPage();
    const table = await screen.findByRole("table", { name: "Partiyalar" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "№", "Mato", "Rang", "Gul", "Rulon", "Metr", "Kg", "1 kg = m", "Tannarx", "Narx", "",
    ]);
    expect(screen.queryByRole("heading", { name: "1-partiya" })).toBeNull(); // kartochka ko'rinishi chizilmaydi

    await fill(row(1), "11", "10", "500", "30000");
    expect(await within(table).findByText(/Hozir: 40 000 so'm \/ m/)).toBeInTheDocument();

    // Tab tartibi — ustunlar tartibida
    within(row(1)).getByLabelText("Mato").focus();
    const order = ["Rang", "Gul", "Rulonlar soni", "Metr (rulonlar jami)", "Jami kg", "1 kg necha metr", "Tannarx, 1 metr uchun", "Narx"];
    for (const label of order) {
      await userEvent.tab();
      expect(within(row(1)).getByLabelText(label)).toHaveFocus();
    }

    await userEvent.click(screen.getByRole("button", { name: "Qator qo'shish" }));
    await fill(row(2), "12", "4", "200,5", "10000");
    await userEvent.type(within(row(2)).getByLabelText("Narx"), "25000");
    expect(screen.getByText("700.5 m")).toBeInTheDocument();
    expect(screen.getByText("17 005 000 so'm")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Kirimni saqlash" }));

    expect(post.mock.calls[0][1].lines).toEqual([
      {
        fabric_id: 1, color_id: 11, pattern_id: null,
        rolls_count: 10, meters: "500", kg: null, m_per_kg: null, cost_per_m: 30000,
      },
      {
        fabric_id: 1, color_id: 12, pattern_id: null,
        rolls_count: 4, meters: "200.5", kg: null, m_per_kg: null, cost_per_m: 10000,
        price: 25000, price_unit: "m",
      },
    ]);
    expect(await screen.findByText("kirim kartochkasi")).toBeInTheDocument();
  });

  it("xatolar qator ostida; qatorni olib tashlash ishlaydi", async () => {
    renderPage();
    await screen.findByRole("table", { name: "Partiyalar" });
    await userEvent.click(screen.getByRole("button", { name: "Kirimni saqlash" }));
    expect(screen.getByText("Matoni tanlang")).toBeInTheDocument();
    expect(screen.getByText("Tannarxni kiriting")).toBeInTheDocument();
    expect(within(row(1)).getByLabelText("Mato")).toHaveAttribute("aria-invalid", "true");
    expect(post).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Qator qo'shish" }));
    expect(screen.getAllByRole("row", { name: /-partiya$/ })).toHaveLength(2);
    await userEvent.click(screen.getByRole("button", { name: "2-partiyani olib tashlash" })); // bo'sh qator — darhol
    expect(screen.getAllByRole("row", { name: /-partiya$/ })).toHaveLength(1);
  });
});

describe("koeffitsient (1 kg = X metr)", () => {
  const line = (changes: Partial<LineDraft>): LineDraft => ({
    key: 1, fabricId: "1", colorId: "11", patternId: "", rolls: "1", meters: "", kg: "",
    coefficient: "", cost: "", price: null, priceUnit: null, ...changes,
  });

  it("metr va kg bor — metr ÷ kg; aks holda qo'lda yozilgani; u ham bo'lmasa — matoning standarti", () => {
    expect(lineCoefficient(line({ meters: "500", kg: "100", coefficient: "9" }), fabric)).toBe(5);
    expect(lineCoefficient(line({ meters: "500", coefficient: "4,5" }), fabric)).toBe(4.5);
    expect(lineCoefficient(line({ meters: "500" }), fabric)).toBe(4);
    expect(lineCoefficient(line({ meters: "100", kg: "3" }), fabric)).toBe(33.3333);
    // Yarim holat serverdagi ROUND_HALF_UP bilan bir xil (float bilan 47.3437 chiqardi)
    expect(lineCoefficient(line({ meters: "99.99", kg: "2.112" }), fabric)).toBe(47.3438);
    expect(lineAmount(line({ meters: "269.59", cost: "49550" }))).toBe(13_358_185); // 13 358 184.5
    expect(lineCoefficient(line({ meters: "500" }), { ...fabric, default_m_per_kg: null })).toBeNull();
  });
});
