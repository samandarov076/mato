import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "@/shared/api/client";
import { SkusPage } from "./SkusPage";
import { parseDecimal, similarCodes } from "./types";

const { api, post } = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn() }));
vi.mock("@/modules/auth/AuthProvider", () => ({
  useCurrentUser: () => ({ user: { id: 1, full_name: "Akmal Ega", role: "owner" } }),
}));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
  post,
}));

const fabrics = [
  { id: 1, code: "M101", name: "Atlas", width_cm: null, composition: null, image_url: null, default_m_per_kg: null, is_active: true, sku_count: 2 },
];
const colors = [
  { id: 11, code: "01", name: "Qizil", hex: "#c0392b", image_url: null, is_plain: false, is_active: true, sku_count: 1 },
  { id: 12, code: "02", name: "Ko'k", hex: null, image_url: null, is_plain: false, is_active: true, sku_count: 1 },
];
const patterns = [
  { id: 21, code: "0", name: "Gulsiz", hex: null, image_url: null, is_plain: true, is_active: true, sku_count: 2 },
  { id: 22, code: "G5", name: "Lola", hex: null, image_url: null, is_plain: false, is_active: true, sku_count: 0 },
];
const sku = (id: number, color: (typeof colors)[number], price: number | null) => ({
  id,
  code: `M101-${color.code}`,
  fabric: { id: 1, code: "M101", name: "Atlas", default_m_per_kg: null, is_active: true },
  color: { id: color.id, code: color.code, name: color.name, hex: color.hex, image_url: null, is_active: true },
  pattern: { id: 21, code: "0", name: "Gulsiz", image_url: null, is_plain: true, is_active: true },
  price,
  price_unit: "m",
  low_stock_threshold: null,
  is_active: true,
});
const skus = [sku(101, colors[0], 45000), sku(102, colors[1], null)];

function renderPage(url = "/catalog/skus") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <SkusPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Oxirgi SKU so'rovining parametrlari */
const lastSkuQuery = () =>
  new URLSearchParams(
    api.mock.calls
      .map(([path]) => String(path))
      .filter((path) => path.startsWith("/catalog/skus"))
      .at(-1)
      ?.split("?")[1],
  );

describe("SKU ro'yxati", () => {
  beforeEach(() => {
    post.mockReset();
    api.mockReset();
    api.mockImplementation((path: string) => {
      if (path.startsWith("/catalog/fabrics")) return Promise.resolve(fabrics);
      if (path.startsWith("/catalog/colors")) return Promise.resolve(colors);
      if (path.startsWith("/catalog/patterns")) return Promise.resolve(patterns);
      return Promise.resolve({ items: skus, total: skus.length });
    });
  });

  it("narxni birligi bilan, narxsiz SKU'ni esa belgi bilan ko'rsatadi", async () => {
    renderPage();

    const priced = (await screen.findByText("M101-01")).closest("li") as HTMLElement;
    expect(within(priced).getByText("45 000 so'm / m")).toBeInTheDocument();
    expect(within(priced).getByText("Atlas · Qizil")).toBeInTheDocument(); // gulsiz — nomda ko'rsatilmaydi
    const unpriced = screen.getByText("M101-02").closest("li") as HTMLElement;
    expect(within(unpriced).getByText("narx yo'q")).toBeInTheDocument();
    expect(screen.getByText("2 tadan 2 tasi ko'rsatilmoqda")).toBeInTheDocument();
  });

  it("chegarasi belgilanmagan SKU'da 'standart' so'zi emas — biznes standartining o'zi (kulrang, izohi bilan)", async () => {
    api.mockImplementation((path: string) => {
      if (path.startsWith("/settings")) return Promise.resolve({ low_stock_default: "700.00" });
      if (path.startsWith("/catalog/fabrics")) return Promise.resolve(fabrics);
      if (path.startsWith("/catalog/colors")) return Promise.resolve(colors);
      if (path.startsWith("/catalog/patterns")) return Promise.resolve(patterns);
      return Promise.resolve({ items: [skus[0], { ...skus[1], low_stock_threshold: "50.00" }], total: 2 });
    });
    renderPage();
    const usual = (await screen.findByText("M101-01")).closest("li") as HTMLElement;
    const standard = await within(usual).findByText("700 m");
    expect(standard).toHaveAttribute("title", "Biznes standarti");
    expect(standard).toHaveClass("text-muted");
    expect(within(usual).queryByText("standart")).toBeNull();
    // O'z chegarasi bor SKU — oddiy matn, izohsiz
    const own = within(screen.getByText("M101-02").closest("li") as HTMLElement).getByText("50 m");
    expect(own).not.toHaveAttribute("title");
  });

  it("qidiruv va mato ko'rinib turadi; rang va gul 'Filtr' tugmasi ortida, faol filtrlar soni bilan", async () => {
    renderPage("/catalog/skus?color_id=11");
    await screen.findByText("M101-01");
    expect(screen.getByRole("searchbox")).toBeVisible();
    expect(screen.getByLabelText("Mato")).toBeVisible();
    expect(screen.getByLabelText("Rang")).not.toBeVisible();
    const toggle = screen.getByRole("button", { name: /^Filtr(?!larni)/ });
    expect(toggle).toHaveTextContent("1"); // manzildan kelgan rang filtri
    await userEvent.click(toggle);
    expect(screen.getByLabelText("Rang")).toBeVisible();
    expect(screen.getByLabelText("Gul")).toBeVisible();
  });

  it("filtrlar serverga yuboriladi va manzildan o'qiladi", async () => {
    renderPage("/catalog/skus?fabric_id=1");
    await screen.findByText("M101-01");
    expect(lastSkuQuery().get("fabric_id")).toBe("1");

    await userEvent.click(screen.getByRole("checkbox", { name: "Faqat narxi belgilanmaganlar" }));
    await waitFor(() => expect(lastSkuQuery().get("no_price")).toBe("true"));
    expect(lastSkuQuery().get("fabric_id")).toBe("1");
  });

  it("tanlangan SKU'larga bir yo'la narx qo'yadi", async () => {
    post.mockResolvedValue({ changed: 2 });
    renderPage();
    await screen.findByText("M101-01");
    expect(screen.queryByRole("button", { name: "Narx qo'yish" })).toBeNull(); // tanlov yo'q — panel yo'q

    await userEvent.click(screen.getByRole("checkbox", { name: "Ko'rsatilganlarning hammasini tanlash" }));
    expect(screen.getByText("2 ta tanlandi")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Narx qo'yish" }));
    expect(screen.getByText("Narxni kiriting")).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText("Yangi narx"), "50000");
    expect(screen.getByLabelText("Yangi narx")).toHaveValue("50 000"); // minglar ajratilgan
    await userEvent.click(screen.getByRole("radio", { name: "kg" }));
    await userEvent.click(screen.getByRole("button", { name: "Narx qo'yish" }));

    expect(post).toHaveBeenCalledWith("/catalog/skus/price", {
      sku_ids: [101, 102],
      price: 50000,
      price_unit: "kg",
    });
    expect(await screen.findByText("2 ta SKU narxi yangilandi")).toBeInTheDocument();
    expect(screen.queryByText("2 ta tanlandi")).toBeNull();
  });

  it("qo'lda SKU qo'shish: gul tanlanmasa «gulsiz» ketadi, natija xabari chiqadi", async () => {
    post.mockResolvedValue({ created: 1, existing: 1 });
    renderPage();
    await screen.findByText("M101-01");

    await userEvent.click(screen.getByRole("button", { name: "SKU qo'shish" }));
    const form = screen.getByRole("heading", { name: "SKU qo'shish" }).closest("section") as HTMLElement;
    await userEvent.click(within(form).getByRole("button", { name: "SKU qo'shish" }));
    expect(within(form).getByText("Matoni tanlang", { selector: "span" })).toBeInTheDocument();

    await userEvent.selectOptions(within(form).getByRole("combobox"), "1");
    await userEvent.click(within(form).getByRole("button", { name: "Hammasini tanlash" }));
    expect(within(form).getByRole("button", { name: /Gulsiz/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(form).getByText("2 ta SKU yaratiladi")).toBeInTheDocument();
    await userEvent.click(within(form).getByRole("button", { name: "SKU qo'shish" }));

    expect(post).toHaveBeenCalledWith("/catalog/skus", { fabric_id: 1, color_ids: [11, 12], pattern_ids: [21] });
    expect(await screen.findByText("1 ta SKU qo'shildi, 1 tasi oldindan bor edi")).toBeInTheDocument();
    await waitFor(() => expect(lastSkuQuery().get("fabric_id")).toBe("1")); // ro'yxat shu matoga o'tdi
  });

  it("server xatosini ommaviy narx panelida ko'rsatadi", async () => {
    post.mockRejectedValue(new ApiError(404, "sku_not_found", "sku_not_found"));
    renderPage();
    await userEvent.click(await screen.findByRole("checkbox", { name: "M101-02 ni tanlash" }));
    await userEvent.type(screen.getByLabelText("Yangi narx"), "1000");
    await userEvent.click(screen.getByRole("button", { name: "Narx qo'yish" }));

    expect(await screen.findByText("SKU topilmadi")).toBeInTheDocument();
    expect(screen.getByText("1 ta tanlandi")).toBeInTheDocument(); // tanlov saqlanadi — qayta urinish mumkin
  });
});

describe("katalog yordamchilari", () => {
  it("o'xshash kodlarni topadi: belgilar va harf kattaligi farq qilmaydi", () => {
    const rows = [
      { id: 1, code: "M101" },
      { id: 2, code: "B-7" },
      { id: 3, code: "m-101/2" },
    ];
    expect(similarCodes("M-101", rows, null).map((r) => r.id)).toEqual([1, 3]);
    expect(similarCodes("M-101", rows, 1).map((r) => r.id)).toEqual([3]); // o'zi hisobga olinmaydi
    expect(similarCodes("M", rows, null)).toEqual([]); // juda qisqa — shovqin bo'lmasin
  });

  it("kasr sonni tekshiradi va vergulni nuqtaga almashtiradi", () => {
    expect(parseDecimal(" 3,25 ", 4)).toBe("3.25");
    expect(parseDecimal("50", 2)).toBe("50");
    expect(parseDecimal("3.123", 2)).toBeNull();
    expect(parseDecimal("0", 2)).toBeNull();
    expect(parseDecimal("abc", 2)).toBeNull();
  });
});
