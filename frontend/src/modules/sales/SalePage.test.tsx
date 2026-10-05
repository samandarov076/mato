import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "@/shared/api/client";
import { kgFromMeters, lineAmount, metersFromKg, overdrawn, type CartLine } from "./cart";
import { searchItems } from "./search";
import { SalePage } from "./SalePage";
import type { SaleContext } from "./types";

const { api, post } = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn() }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
  post,
}));
// Kim kirgani va bu brauzer qaysi qurilma ekani — test ichida almashtiriladi (standart: sotuvchi, do'kon plansheti)
const who = vi.hoisted(() => ({ role: "seller", device: null as unknown }));
const business = { id: 1, name: "Atlas savdo", autolock_minutes: 30 };
vi.mock("@/modules/auth/AuthProvider", () => ({
  useCurrentUser: () => ({
    user: { id: 9, full_name: "Nodira Sotuvchi", role: who.role },
    business,
    store: { id: 2, name: "Chorsu do'koni" },
  }),
  useAuth: () => ({ device: who.device, business }),
}));

const sku = (id: number, color: { id: number; code: string; name: string }) => ({
  id,
  code: `M101-${color.code}`,
  price: null,
  price_unit: "m" as const,
  low_stock_threshold: null,
  is_active: true,
  fabric: { id: 1, code: "M101", name: "Atlas", image_url: null, default_m_per_kg: "4.0000", is_active: true },
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

// Savat bo'sh bo'lsa tugma "Yana qo'shish" (tez sotish yonida), savatda qator bo'lsa — "Qo'shish"
const addButton = () => screen.getByRole("button", { name: /^(Yana )?qo'shish$/i });
const cartHeading = () => screen.queryByRole("heading", { name: "Savat" });

/** Skaner bilan P-000012 dan `meters` m, tavsiya narxda savatga qo'shadi */
async function addLine(meters = "10") {
  await userEvent.type(await scanner(), "P-000012{Enter}");
  await userEvent.type(screen.getByLabelText("Metr"), meters);
  await userEvent.click(addButton());
}

const pendingBanner = () => screen.findByText(/Sotuv tasdiqlanmadi — serverdan javob kelmadi/);
const CART_KEY = "mato.cart.9.2"; // sotuvchi 9, do'kon 2
const savedCart = () => JSON.parse(localStorage.getItem(CART_KEY) ?? "null");
const storedLine = {
  id: "l1", batch_id: 12, batch_number: "P-000012", sku_code: "M101-01", sku_name: "Atlas · Qizil",
  hex: null, image_url: null, meters: "10", kg: "2.5", price: 45000, recommended: 45000, note: "",
};
const storedCart = (changes: object = {}) =>
  JSON.stringify({
    uuid: "11111111-1111-4111-8111-111111111111", lines: [storedLine], payment: "cash", customer: null,
    initial: "", initialMethod: "cash", pending: false, ...changes,
  });

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

  it("tez sotish: skaner partiyani topadi, kg o'zi hisoblanadi, savatsiz bir bosishda sotiladi", async () => {
    renderPage();
    await userEvent.type(await scanner(), "p-000012{Enter}");
    expect(cartHeading()).toBeNull(); // savat bo'sh — ko'rinmaydi

    expect(screen.getByText("M101-01")).toBeInTheDocument();
    expect(screen.getByLabelText("Partiya")).toHaveValue("12");
    await userEvent.type(screen.getByLabelText("Metr"), "2,35");
    expect(screen.getByLabelText("Kg")).toHaveValue("0.588"); // 2.35 m ÷ 4
    expect(screen.getByText("Tavsiya narx bo'yicha")).toBeInTheDocument(); // narx o'zi qo'yildi
    expect(screen.getByLabelText("1 metr narxi")).toHaveValue("45 000");
    expect(screen.getByLabelText("Metr")).toHaveValue("2,35");
    await userEvent.click(screen.getByRole("button", { name: "Sotish" }));

    expect(post).toHaveBeenCalledWith("/sales", {
      client_uuid: expect.any(String),
      store_id: null,
      payment_type: "cash",
      customer_id: null,
      initial_payment: 0,
      initial_payment_method: null,
      lines: [{ batch_id: 12, meters: "2.35", kg: "0.588", price_per_m: 45000, negative_stock_note: null }],
    });
    // Ekran yangi sotuvga tayyor: savat yana yashirin, skaner maydoni kutib turibdi
    expect(await screen.findByText(/S-000001 yozildi/)).toBeInTheDocument();
    expect(cartHeading()).toBeNull();
    expect(await scanner()).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sotuvni ochish" })).toHaveAttribute("href", "/sales/5");
  });

  it("sotuvdan keyin qoldiq joyida aniq kamayadi (10.03 − 0.13 = 9.9, float xatosiz)", async () => {
    api.mockImplementation((path: string) =>
      path.startsWith("/sales/context")
        ? Promise.resolve({
            ...context,
            items: [
              {
                ...context.items[0],
                batches: [{ ...context.items[0].batches[0], qty_m: "10.03" }, context.items[0].batches[1]],
              },
            ],
          })
        : Promise.resolve(customers),
    );
    renderPage();
    await userEvent.type(await scanner(), "P-000012{Enter}");
    await userEvent.type(screen.getByLabelText("Metr"), "0,13");
    await userEvent.click(screen.getByRole("button", { name: "Sotish" }));
    expect(await screen.findByText(/S-000001 yozildi/)).toBeInTheDocument();

    // Qidiruvda shu tovar chiqadi: qolgan metr — 9.9 + ikkinchi partiyadagi 100 (float bilan 109.899999… chiqardi)
    await userEvent.type(await scanner(), "atlas qizil");
    expect((await screen.findAllByText("109.9 m")).length).toBeGreaterThan(0);
    // Tovar tanlansa — partiyalar ro'yxatida ham aniq qoldiq
    await userEvent.click(screen.getByRole("button", { name: /M101-01/ }));
    expect(await screen.findByRole("option", { name: /P-000012 .* 9\.9 m$/ })).toBeInTheDocument();
  });

  it("qidiruv ostida tovarlar to'ri: rasm/belgi, kod va qoldiq; bosilsa tovar tanlanadi", async () => {
    renderPage();
    await scanner();
    const grid = screen.getByRole("group", { name: "Tovarlar" });
    const tiles = within(grid).getAllByRole("button");
    expect(tiles.map((tile) => tile.getAttribute("aria-label"))).toEqual([
      "M101-01 · Atlas · Qizil", "M101-02 · Atlas · Ko'k",
    ]);
    expect(tiles[0]).toHaveTextContent("300 m"); // ikki partiya: 200 + 100
    expect(tiles[1]).toHaveTextContent("50 m");

    await userEvent.click(tiles[0]);

    expect(screen.getByLabelText("Partiya")).toHaveValue("12"); // eng eski partiya — hozirgi tanlash oqimi
    expect(screen.getByText("Tavsiya narx bo'yicha")).toBeInTheDocument(); // narx o'zi qo'yildi
    await waitFor(() => expect(screen.getByLabelText("Metr")).toHaveFocus());
    expect(screen.queryByRole("group", { name: "Tovarlar" })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it("yozilishi bilan to'r torayadi (kirillda ham); ↓ va Enter belgilangan tovarni tanlaydi", async () => {
    renderPage();
    const input = await scanner();
    const labels = () =>
      within(screen.getByRole("group", { name: "Tovarlar" }))
        .getAllByRole("button")
        .map((tile) => tile.getAttribute("aria-label"));

    await userEvent.type(input, "атлас");
    expect(labels()).toEqual(["M101-01 · Atlas · Qizil", "M101-02 · Atlas · Ko'k"]);
    expect(screen.getByText("2 ta topildi")).toBeInTheDocument();
    // Qidiruv paytida mato chiplari yo'q — ekranda faqat natija
    expect(screen.queryByRole("group", { name: "Mato" })).toBeNull();

    await userEvent.clear(input);
    await userEvent.type(input, "kok atlas");
    expect(labels()).toEqual(["M101-02 · Atlas · Ko'k"]);

    // Ikki natija: Enter o'zi tanlamaydi, ↓ ↓ ikkinchisini belgilaydi
    await userEvent.clear(input);
    await userEvent.type(input, "atlas{ArrowDown}{ArrowDown}");
    const tiles = within(screen.getByRole("group", { name: "Tovarlar" })).getAllByRole("button");
    expect(tiles[1]).toHaveAttribute("aria-current", "true");
    await userEvent.keyboard("{Enter}");
    expect(screen.getByText("M101-02")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Metr")).toHaveFocus());
    expect(post).not.toHaveBeenCalled();
  });

  it("rasm matoniki bo'lsa, katakchada rang nuqtasi ham ko'rinadi (bir matoning ranglari ajralsin)", async () => {
    const withFabricImage = (item: (typeof context.items)[number], hex: string | null) => ({
      ...item,
      sku: {
        ...item.sku,
        fabric: { ...item.sku.fabric, image_url: "/api/media/1/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp" },
        color: { ...item.sku.color, hex },
      },
    });
    api.mockResolvedValue({
      ...context,
      items: [withFabricImage(context.items[0], "#b8322a"), withFabricImage(context.items[1], null)],
    });
    renderPage();
    await scanner();

    const tiles = within(screen.getByRole("group", { name: "Tovarlar" })).getAllByRole("button");
    expect(tiles[0].querySelector("img")).toHaveAttribute("src", "/api/media/1/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.s.webp");
    expect(tiles[0].querySelector("[data-color-dot]")).toHaveStyle({ backgroundColor: "#b8322a" });
    expect(tiles[1].querySelector("[data-color-dot]")).toBeNull(); // rang namunasi kiritilmagan
  });

  it("to'r katakchasida tavsiya narx; hech narsa topilmasa — xabar", async () => {
    renderPage();
    const input = await scanner();
    const tiles = within(screen.getByRole("group", { name: "Tovarlar" })).getAllByRole("button");
    expect(tiles[0]).toHaveTextContent("45 000 so'm / m");
    expect(tiles[1]).not.toHaveTextContent("so'm"); // narxi belgilanmagan

    await userEvent.type(input, "shoyi");
    expect(screen.getByRole("status")).toHaveTextContent("Hech narsa topilmadi");
    expect(screen.queryByRole("group", { name: "Tovarlar" })).toBeNull();
  });

  it("gulsiz tovar tanlanganda ham tarkibda gul aniq ko'rinadi — 'Gulsiz'", async () => {
    renderPage();
    await scanner();
    // Atlas · Qizilda bitta tovar — rang bosilganda gul so'ralmay, o'zi tanlanadi
    await userEvent.click(screen.getByRole("button", { name: "M101 · Atlas" }));
    await userEvent.click(screen.getByRole("button", { name: "01 · Qizil" }));

    const parts = within(screen.getByRole("list", { name: "Tovar tarkibi" })).getAllByRole("listitem");
    expect(parts).toHaveLength(3);
    expect(parts[2]).toHaveTextContent("Gul");
    expect(parts[2]).toHaveTextContent("Gulsiz");
  });

  it("tanlangan tovar: rasm katalogdan (gul → rang → mato) va tarkibi — mato, rang, gul", async () => {
    const pictured = {
      sku: {
        ...sku(103, { id: 13, code: "05", name: "Oq" }),
        code: "M101-05-G1",
        fabric: { id: 1, code: "M101", name: "Atlas", image_url: "/api/media/1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp", default_m_per_kg: "4.0000", is_active: true },
        pattern: { id: 22, code: "G1", name: "Lola", image_url: null, is_plain: false, is_active: true },
      },
      batches: [
        { id: 16, number: "P-000016", receipt_date: "2026-09-10", qty_m: "80.00", m_per_kg: null, recommended_price_per_m: null },
      ],
    };
    api.mockImplementation((path: string) =>
      path.startsWith("/sales/context")
        ? Promise.resolve({ ...context, items: [...context.items, pictured] })
        : Promise.reject(new ApiError(404, "batch_not_found", "batch_not_found")),
    );
    const { container } = renderPage();

    await userEvent.type(await scanner(), "P-000016{Enter}");

    // Gul va rang rasmi yo'q — mato rasmi (katta, to'liq fayl) ko'rsatiladi
    const hero = container.querySelector("img[width='144']");
    expect(hero).toHaveAttribute("src", "/api/media/1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.webp");
    const parts = screen.getByRole("list", { name: "Tovar tarkibi" });
    // Rasm yo'q qismda kod harflari belgisi turadi (aria-hidden) — matnga shu ham qo'shiladi
    expect(within(parts).getAllByRole("listitem").map((part) => part.textContent)).toEqual([
      "MatoAtlas", "05RangOq", "G1GulLola",
    ]);
    expect(within(parts).getAllByRole("listitem")[0].querySelector("img")).toHaveAttribute(
      "src",
      "/api/media/1/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.s.webp",
    );
  });

  it("mato tanlansa to'r shu matoga torayadi; rang tugmalarida qoldiq, tugagani xira lekin bosiladi", async () => {
    api.mockImplementation((path: string) =>
      path.startsWith("/sales/context")
        ? Promise.resolve({
            ...context,
            items: [
              context.items[0],
              { ...context.items[1], batches: [{ ...context.items[1].batches[0], qty_m: "0.00" }] },
            ],
          })
        : Promise.resolve(customers),
    );
    renderPage();
    await scanner();
    await userEvent.click(screen.getByRole("button", { name: "M101 · Atlas" }));

    const red = screen.getByRole("button", { name: "01 · Qizil" });
    const blue = screen.getByRole("button", { name: "02 · Ko'k" });
    expect(red).toHaveTextContent("300 m");
    expect(blue).toHaveTextContent("0 m");
    expect(red).not.toHaveClass("opacity-60");
    expect(blue).toHaveClass("opacity-60"); // qoldiq yo'q — xira
    expect(blue).toBeEnabled(); // lekin bosiladi: tizimda tugagan, haqiqatda bor bo'lishi mumkin

    await userEvent.click(blue);
    expect(screen.getByText("M101-02")).toBeInTheDocument();
    expect(screen.getByLabelText("Metr")).toBeInTheDocument();
  });

  it("mato → rang → gul ketma-ket: keyingi qadam oldingisi tanlangach chiqadi; × undan keyingilarni ham oladi", async () => {
    const lola = { id: 22, code: "G1", name: "Lola", image_url: null, is_plain: false, is_active: true };
    const patterned = (id: number, fabric: { id: number; code: string; name: string }, color: { id: number; code: string; name: string }, batch: number) => ({
      sku: {
        ...sku(id, color),
        code: `${fabric.code}-${color.code}-G1`,
        fabric: { ...fabric, image_url: null, default_m_per_kg: null, is_active: true },
        pattern: lola,
      },
      batches: [
        { id: batch, number: `P-0000${batch}`, receipt_date: "2026-09-10", qty_m: "80.00", m_per_kg: null, recommended_price_per_m: null },
      ],
    });
    const items = [
      ...context.items, // Atlas · Qizil, Atlas · Ko'k — gulsiz
      patterned(103, { id: 1, code: "M101", name: "Atlas" }, { id: 11, code: "01", name: "Qizil" }, 21),
      patterned(104, { id: 2, code: "SH", name: "Shifon" }, { id: 13, code: "05", name: "Oq" }, 22),
    ];
    api.mockImplementation((path: string) =>
      path.startsWith("/sales/context") ? Promise.resolve({ ...context, items }) : Promise.resolve(customers),
    );
    renderPage();
    await scanner();
    const tiles = () =>
      within(screen.getByRole("group", { name: "Tovarlar" }))
        .getAllByRole("button")
        .map((tile) => tile.getAttribute("aria-label"));
    const names = (group: string) =>
      within(screen.getByRole("group", { name: group }))
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label"));

    // Boshida faqat mato; rang va gul hali yo'q
    expect(names("Mato")).toEqual(["M101 · Atlas", "SH · Shifon"]);
    expect(screen.queryByRole("group", { name: "Rang" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Gul" })).toBeNull();

    // Mato tanlandi → shu matoning ranglari; gul hali yo'q
    await userEvent.click(screen.getByRole("button", { name: "M101 · Atlas" }));
    expect(names("Rang")).toEqual(["01 · Qizil", "02 · Ko'k"]);
    expect(screen.queryByRole("group", { name: "Gul" })).toBeNull();
    expect(tiles()).toHaveLength(3);

    // Rang tanlandi (ikki variant: gulsiz va lola) → shu mato va rangning gullari
    await userEvent.click(screen.getByRole("button", { name: "01 · Qizil" }));
    expect(names("Gul")).toEqual(["Gulsiz", "G1 · Lola"]);
    expect(within(screen.getByRole("group", { name: "Gul" })).getByRole("button", { name: "Gulsiz" })).toHaveTextContent("300 m");
    expect(tiles()).toEqual(["M101-01 · Atlas · Qizil", "M101-01-G1 · Atlas · Qizil · Lola"]);

    // Rang × — gul qadami ham yo'qoladi, ranglar ro'yxati qaytadi
    await userEvent.click(screen.getByRole("button", { name: "Rang: tanlovni olib tashlash" }));
    expect(screen.queryByRole("group", { name: "Gul" })).toBeNull();
    expect(names("Rang")).toEqual(["01 · Qizil", "02 · Ko'k"]);

    // Mato × — hammasi boshiga qaytadi
    await userEvent.click(screen.getByRole("button", { name: "01 · Qizil" }));
    await userEvent.click(screen.getByRole("button", { name: "Mato: tanlovni olib tashlash" }));
    expect(screen.queryByRole("group", { name: "Rang" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Gul" })).toBeNull();
    expect(tiles()).toHaveLength(4);

    // Oxirigacha: mato → rang → gul — tovar tanlanadi
    await userEvent.click(screen.getByRole("button", { name: "M101 · Atlas" }));
    await userEvent.click(screen.getByRole("button", { name: "01 · Qizil" }));
    await userEvent.click(screen.getByRole("button", { name: "G1 · Lola" }));
    expect(screen.getByText("M101-01-G1")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Metr")).toHaveFocus());
  });

  it("qiymatlar 10 tadan ko'p bo'lsa — chiplar o'rniga qidiruvli tanlov (klaviatura bilan)", async () => {
    // Bitta matoda 12 ta rang: 01 … 12
    const many = Array.from({ length: 12 }, (_, index) => {
      const code = String(index + 1).padStart(2, "0");
      return {
        sku: sku(200 + index, { id: 30 + index, code, name: index === 4 ? "Zangori" : `Rang ${code}` }),
        batches: [
          { id: 300 + index, number: `P-0003${code}`, receipt_date: "2026-09-20", qty_m: "50.00", m_per_kg: null, recommended_price_per_m: 45000 },
        ],
      };
    });
    api.mockImplementation((path: string) =>
      path.startsWith("/sales/context") ? Promise.resolve({ ...context, items: many }) : Promise.resolve(customers),
    );
    renderPage();
    await scanner();
    // Mato bitta — chip bo'lib qoladi (10 tagacha hozirgi ko'rinish)
    await userEvent.click(screen.getByRole("button", { name: "M101 · Atlas" }));

    const combo = screen.getByRole("combobox", { name: "Rang" });
    expect(screen.queryByRole("button", { name: "01 · Rang 01" })).toBeNull(); // chiplar yo'q
    await userEvent.click(combo);
    expect(screen.getAllByRole("option")).toHaveLength(12);

    await userEvent.type(combo, "zang");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["05 · Zangori50 m"]);
    await userEvent.keyboard("{ArrowDown}{Enter}");

    expect(screen.getByText("M101-05")).toBeInTheDocument(); // tovar tanlandi — hozirgi oqim
    await waitFor(() => expect(screen.getByLabelText("Metr")).toHaveFocus());
    expect(post).not.toHaveBeenCalled();
  });

  it("Enter sotib yubormaydi — qatorni savatga qo'yadi; savat ochilgach oddiy 'Yakunlash'", async () => {
    renderPage();
    await userEvent.type(await scanner(), "P-000012{Enter}");
    await userEvent.type(screen.getByLabelText("Metr"), "10");
    await userEvent.type(screen.getByLabelText("Metr"), "{Enter}");

    expect(post).not.toHaveBeenCalled();
    expect(cartHeading()).toBeInTheDocument();
    expect(screen.getAllByText("450 000")).toHaveLength(2); // qator va jami
    expect(screen.queryByRole("button", { name: "Sotish" })).toBeNull();
    await finish();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  });

  it("tez sotish nasiyada — qator savatga tushadi va mijoz tanlash ochiladi", async () => {
    renderPage();
    await userEvent.type(await scanner(), "P-000012{Enter}");
    await userEvent.type(screen.getByLabelText("Metr"), "10");
    await userEvent.click(screen.getByRole("radio", { name: "Nasiya" }));
    await userEvent.click(screen.getByRole("button", { name: "Mijozni tanlash" }));

    expect(post).not.toHaveBeenCalled();
    expect(cartHeading()).toBeInTheDocument();
    expect(screen.getByText(/Qarzga yoziladi: 450 000 so'm/)).toBeInTheDocument();
  });

  it("qo'lda tanlashda eng eski partiya olinadi; kg kiritilsa metr hisoblanadi", async () => {
    renderPage();
    await scanner();
    await userEvent.click(screen.getByRole("button", { name: "M101 · Atlas" }));
    await userEvent.click(screen.getByRole("button", { name: "01 · Qizil" }));

    expect(screen.getByLabelText("Partiya")).toHaveValue("12"); // P-000012 eskiroq
    await userEvent.type(screen.getByLabelText("Kg"), "1,5");
    expect(screen.getByLabelText("Metr")).toHaveValue("6"); // 1.5 kg × 4

    // Narx o'zi qo'yilgan; sotuvchi o'zgartirsa — tavsiyaga bir bosishda qaytadi
    const price = screen.getByLabelText("1 metr narxi");
    expect(price).toHaveValue("45 000");
    await userEvent.clear(price);
    await userEvent.type(price, "50000");
    await userEvent.click(screen.getByRole("button", { name: /Tavsiya narxni qaytarish/ }));
    expect(price).toHaveValue("45 000");

    // Narxsiz na qo'shiladi, na sotiladi — sababi qizil matnda
    await userEvent.clear(price);
    await userEvent.click(addButton());
    expect(screen.getByRole("alert")).toHaveTextContent("1 metr narxini kiriting");
    await userEvent.click(screen.getByRole("button", { name: "Sotish" }));
    expect(screen.getByRole("alert")).toHaveTextContent("1 metr narxini kiriting");
    expect(cartHeading()).toBeNull();
    expect(post).not.toHaveBeenCalled();
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
    // Tez sotishda ham izohsiz o'tmaydi: qator savatga tushadi va izoh so'raladi
    await userEvent.click(screen.getByRole("button", { name: "Sotish" }));
    expect(cartHeading()).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Qoldiqdan ko'p sotilayotgan qatorga izoh yozing");
    // Xabar "Yakunlash" yonida paydo bo'lib fokus oladi — keyin izoh yoziladi
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());

    // Izohsiz "Yakunlash" ham o'tmaydi
    await finish();
    expect(screen.getByRole("alert")).toHaveTextContent("Qoldiqdan ko'p sotilayotgan qatorga izoh yozing");
    expect(post).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("1-qator: izoh"), "Rulon 52 m chiqdi");
    await finish();
    expect(post.mock.calls[0][1].lines).toEqual([
      { batch_id: 13, meters: "52", kg: null, price_per_m: 30000, negative_stock_note: "Rulon 52 m chiqdi" },
    ]);
  });

  it("SKU kodi skanerlansa — aynan shu tovar (gulli varianti kodining boshi bo'lsa ham)", async () => {
    // Gulsiz M101-01 va gulli M101-01-G1: "M101-01" ikkalasiga qism bo'yicha mos keladi
    const patterned = {
      sku: {
        ...sku(103, { id: 11, code: "01", name: "Qizil" }),
        code: "M101-01-G1",
        pattern: { id: 22, code: "G1", name: "Gul", image_url: null, is_plain: false, is_active: true },
      },
      batches: [
        { id: 16, number: "P-000016", receipt_date: "2026-09-10", qty_m: "80.00", m_per_kg: null, recommended_price_per_m: null },
      ],
    };
    api.mockImplementation((path: string) =>
      path.startsWith("/sales/context")
        ? Promise.resolve({ ...context, items: [...context.items, patterned] })
        : Promise.reject(new ApiError(404, "batch_not_found", "batch_not_found")),
    );
    renderPage();

    await userEvent.type(await scanner(), "m101-01{Enter}");

    expect(screen.getByText("M101-01")).toBeInTheDocument();
    expect(screen.getByLabelText("Partiya")).toHaveValue("12"); // gulsizning eng eski partiyasi
    expect(screen.getByLabelText("Metr")).toHaveFocus();
  });

  it("skaner kodi topilmasa — qo'lda tanlashga yo'naltiradi", async () => {
    renderPage();
    await userEvent.type(await scanner(), "P-999999{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Partiya yoki tovar topilmadi — tovarni qo'lda tanlang");

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
    expect(cartHeading()).toBeNull(); // savat bo'shadi — yana oddiy (tez sotish) holat
  });

  it("internet uzilsa savat saqlanadi va ulanish tiklangach o'sha savat qayta yuboriladi", async () => {
    post.mockRejectedValueOnce(new ApiError(0, "network_error", "network_error"));
    renderPage();
    await addLine();
    await finish();

    expect(await pendingBanner()).toBeInTheDocument();
    // Javob noma'lum — savatni o'zgartirib bo'lmaydi
    expect(screen.queryByRole("button", { name: "Yakunlash" })).toBeNull();
    expect(screen.queryByRole("button", { name: "1-qatorni o'chirish" })).toBeNull();

    window.dispatchEvent(new Event("online"));

    expect(await screen.findByText(/S-000001 yozildi/)).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
    // Ikkala urinishda bir xil identifikator — server sotuvni bir marta yozadi
    expect(post.mock.calls[1][1].client_uuid).toBe(post.mock.calls[0][1].client_uuid);
  });

  it("server 'bu savat avval yozilgan' desa — muvaffaqiyat xabarida izoh chiqadi", async () => {
    post.mockResolvedValueOnce({ id: 5, number: "S-000001", total: 450_000, payment_type: "cash", duplicate: true });
    renderPage();
    await addLine();
    await finish();
    expect(await screen.findByText(/S-000001 yozildi/)).toBeInTheDocument();
    expect(screen.getByText("Bu sotuv avval yozilgan edi (S-000001) — yangidan yozilmadi.")).toBeInTheDocument();
  });

  it("server 5xx qaytarsa ham savat qulflanadi va o'sha savat o'sha identifikator bilan qayta yuboriladi", async () => {
    post.mockRejectedValueOnce(new ApiError(504, "server_error", "Gateway Timeout"));
    renderPage();
    await addLine();
    await finish();

    expect(await pendingBanner()).toBeInTheDocument();
    // Sotuv yozilgan bo'lishi mumkin — savatga tovar qo'shib ham, o'zgartirib ham bo'lmaydi
    expect(screen.queryByRole("button", { name: "Yakunlash" })).toBeNull();
    expect(screen.queryByRole("button", { name: "1-qatorni o'chirish" })).toBeNull();
    expect(screen.queryByLabelText("Partiya raqami yoki tovar (skaner ham shu yerga)")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Qayta yuborish" }));

    expect(await screen.findByText(/S-000001 yozildi/)).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]).toEqual(post.mock.calls[0][1]);
  });

  it("savat so'rovdan OLDIN qulflanadi: javob kutilayotganda sahifa yangilansa ham qulf turadi", async () => {
    post.mockReturnValueOnce(new Promise(() => {})); // javob hech qachon kelmaydi
    const first = renderPage();
    await addLine();
    await finish();
    await waitFor(() => expect(savedCart().pending).toBe(true));
    const sent = post.mock.calls[0][1].client_uuid;

    first.unmount(); // sahifa yangilandi
    renderPage();

    expect(await pendingBanner()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "1-qatorni o'chirish" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Qayta yuborish" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][1].client_uuid).toBe(sent);
  });

  it("server aniq rad etsa (4xx) — savat ochiladi va keyingi urinish yangi identifikator bilan ketadi", async () => {
    post.mockRejectedValueOnce(
      new ApiError(409, "batch_closed", "", undefined, undefined, { batch: "P-000012" }),
    );
    renderPage();
    await addLine();
    await finish();

    expect(await screen.findByRole("alert")).toHaveTextContent("P-000012: partiya shu do'konda yopilgan");
    expect(screen.getByRole("button", { name: "1-qatorni o'chirish" })).toBeInTheDocument();
    expect(savedCart().pending).toBe(false);
    await finish();

    expect(await screen.findByText(/S-000001 yozildi/)).toBeInTheDocument();
    expect(post.mock.calls[1][1].client_uuid).not.toBe(post.mock.calls[0][1].client_uuid);
  });

  it("o'zgargan savat avval yozilgan sotuv ustiga kelsa — sotuv raqami bilan tushuntiriladi", async () => {
    post.mockRejectedValueOnce(
      new ApiError(409, "sale_basket_changed", "", undefined, undefined, { number: "S-000007" }),
    );
    renderPage();
    await addLine();
    await finish();

    expect(await screen.findByRole("alert")).toHaveTextContent(/S-000007/);
  });

  it("qayta yuborish bir vaqtda ikki marta ketmaydi ('online' hodisasi ustma-ust kelsa)", async () => {
    post.mockRejectedValueOnce(new ApiError(0, "network_error", "network_error"));
    renderPage();
    await addLine();
    await finish();
    await pendingBanner();

    act(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("online"));
    });

    expect(await screen.findByText(/S-000001 yozildi/)).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2); // birinchi urinish + bitta qayta yuborish
  });

  it("boshqa oynada savat o'zgarsa — bu oyna ham o'sha savatni (va qulfni) oladi", async () => {
    renderPage();
    await scanner();
    expect(cartHeading()).toBeNull();

    const newValue = storedCart({ pending: true });
    localStorage.setItem(CART_KEY, newValue); // ikkinchi oyna sotuvni yubordi
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: CART_KEY, newValue }));
    });

    expect(await pendingBanner()).toBeInTheDocument();
    expect(screen.getAllByText("450 000")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "1-qatorni o'chirish" })).toBeNull();
  });

  it("boshqa sotuvchining javobi kelmagan sotuvi shu qurilmada ko'rinib turadi", async () => {
    localStorage.setItem("mato.cart.5.2", storedCart({ pending: true, seller: "Aziz Sotuvchi" }));
    localStorage.setItem("mato.cart.6.2", storedCart({ seller: "Bekzod" })); // oddiy to'lmagan savat — xabar yo'q
    localStorage.setItem("mato.cart.7.3", storedCart({ pending: true, seller: "Boshqa do'kon" }));
    renderPage();
    await scanner();

    expect(screen.getByText(/Aziz Sotuvchi.*450 000/)).toBeInTheDocument();
    expect(screen.queryByText(/Bekzod/)).toBeNull();
    expect(screen.queryByText(/Boshqa do'kon/)).toBeNull();
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
    await userEvent.type(await scanner(), "P-000012{Enter}"); // to'lov turi tovar tanlangach ko'rinadi
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
    expect(lineAmount("269.59", 49550)).toBe(13_358_185); // 13 358 184.5
  });

  it("metr ↔ kg partiya koeffitsienti bo'yicha", () => {
    expect(kgFromMeters("2.35", "4.0000")).toBe("0.588");
    expect(kgFromMeters("200", "2.8011")).toBe("71.401");
    expect(metersFromKg("1.5", "4.0000")).toBe("6");
    expect(metersFromKg("1.3", "2.8011")).toBe("3.64");
    expect(kgFromMeters("0.001", "4.0000")).toBe("");
    // Yarim holatlar serverdagi ROUND_HALF_UP bilan bir xil (float bilan 24.657 va 135.38 chiqardi)
    expect(kgFromMeters("197.26", "8.0000")).toBe("24.658");
    expect(metersFromKg("25.000", "5.4154")).toBe("135.39");
    expect(kgFromMeters("10", "0")).toBe("");
  });

  it("bir partiyadan bir necha qator — qoldiq ketma-ket kamayadi", () => {
    const lines = [line("a", 1, "30"), line("b", 1, "30"), line("c", 2, "5"), line("d", 9, "1")];
    // 1-partiyada 50 m: ikkinchi qator uchun 20 m qolgan; 9-partiya ro'yxatda yo'q — tekshirilmaydi
    expect(overdrawn(lines, { 1: "50.00", 2: "5.00" })).toEqual({ b: 20 });
    // Kasrli metrlar ham aniq: 0.3 m dan 0.1 + 0.2 sotilsa — qoldiqdan oshmagan
    expect(overdrawn([line("a", 1, "0.1"), line("b", 1, "0.2")], { 1: "0.30" })).toEqual({});
  });
});

describe("moslashuvchan qidiruv", () => {
  const ids = (query: string) => searchItems(context.items, query).map((item) => item.sku.id);

  it("so'zlar istalgan tartibda, kod va nomlar aralash", () => {
    expect(ids("qizil atlas")).toEqual([101]);
    expect(ids("ATLAS  m101-01")).toEqual([101]);
    expect(ids("m101 p-000013")).toEqual([102]); // mato kodi + partiya raqami
    expect(ids("atlas")).toEqual([101, 102]);
  });

  it("apostrof turlari bir xil: ko'k = koʻk = kok", () => {
    expect(ids("ko'k")).toEqual([102]);
    expect(ids("koʻk")).toEqual([102]);
    expect(ids("kok")).toEqual([102]);
  });

  it("bo'sh qidiruv hech narsa qaytarmaydi, topilmasa — bo'sh", () => {
    expect(ids("   ")).toEqual([]);
    expect(ids("shoyi qizil")).toEqual([]);
  });
});

describe("Ega sotuvi: do'kon tanlovi", () => {
  const stores = [
    { id: 2, name: "Chorsu do'koni" },
    { id: 3, name: "Oloy do'koni" },
  ];
  const device = (businessId: number) => ({
    bound: true,
    device_name: "Kassa",
    store: { id: 3, name: "Oloy do'koni" },
    business: { id: businessId, name: "Biznes", autolock_minutes: 30 },
  });
  const storeSelect = async () => (await screen.findByLabelText("Do'kon")) as HTMLSelectElement;

  beforeEach(() => {
    localStorage.clear();
    who.role = "owner";
    who.device = null;
    api.mockReset();
    api.mockImplementation((path: string) => {
      if (path.startsWith("/locations")) return Promise.resolve(stores);
      if (path.startsWith("/sales/context")) return Promise.resolve(context);
      return Promise.resolve([]);
    });
  });
  afterEach(() => {
    who.role = "seller";
    who.device = null;
  });

  it("o'z biznesining do'kon planshetida — shu do'kon oldindan tanlangan, o'zgartirsa bo'ladi", async () => {
    localStorage.setItem("mato.sale.store", "2"); // avval boshqa do'kon tanlangan edi
    who.device = device(1);
    renderPage();

    const select = await storeSelect();
    expect(select.value).toBe("3");
    await waitFor(() => expect(api).toHaveBeenCalledWith("/sales/context?store_id=3"));
    await userEvent.selectOptions(select, "2");
    expect(select.value).toBe("2");
  });

  it("begona biznes qurilmasida — do'kon oldindan tanlanmaydi (ega o'zi tanlaydi)", async () => {
    who.device = device(77);
    renderPage();

    expect((await storeSelect()).value).toBe("");
  });

  it("qurilma bo'lmasa — oxirgi tanlangan do'kon", async () => {
    localStorage.setItem("mato.sale.store", "2");
    renderPage();

    expect((await storeSelect()).value).toBe("2");
  });
});
