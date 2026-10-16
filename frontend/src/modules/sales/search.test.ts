import { describe, expect, it } from "vitest";
import { searchItems } from "./search";
import { skuImage, type SellableSku } from "./types";

type Part = { id: number; code: string; name: string };
let nextId = 100;
function item(
  fabric: Part,
  color: Part,
  pattern: Part | null,
  batches: [string, string][],
  images: { fabric?: string; color?: string; pattern?: string } = {},
): SellableSku {
  const id = nextId++;
  return {
    sku: {
      id,
      code: [fabric.code, color.code, pattern?.code].filter(Boolean).join("-"),
      price: null,
      price_unit: "m",
      low_stock_threshold: null,
      is_active: true,
      fabric: { ...fabric, image_url: images.fabric ?? null, default_m_per_kg: null, is_active: true },
      color: { ...color, hex: null, image_url: images.color ?? null, is_active: true },
      pattern: pattern
        ? { ...pattern, image_url: images.pattern ?? null, is_plain: false, is_active: true }
        : { id: 1, code: "0", name: "Gulsiz", image_url: images.pattern ?? null, is_plain: true, is_active: true },
    },
    batches: batches.map(([number, qty], index) => ({
      id: id * 10 + index,
      number,
      receipt_date: "2026-10-01",
      qty_m: qty,
      m_per_kg: null,
      recommended_price_per_m: null,
    })),
  };
}

const shifon = { id: 1, code: "SH", name: "Shifon" };
const atlas = { id: 2, code: "M101", name: "Xon atlas" };
const oq = { id: 11, code: "01", name: "Oq" };
const qizil = { id: 12, code: "03", name: "Qizil" };
const kok = { id: 13, code: "04", name: "Ko'k" };
const lola = { id: 21, code: "G1", name: "Lola" };

const shifonOqLola = item(shifon, oq, lola, [["P-000012", "40.00"]]);
const shifonQizil = item(shifon, qizil, null, [["P-000013", "0.00"]]);
const atlasQizil = item(atlas, qizil, null, [["P-000020", "100.00"]]);
const atlasKok = item(atlas, kok, null, [["P-000112", "55.00"]]);
const items = [shifonOqLola, shifonQizil, atlasQizil, atlasKok];
const codes = (query: string) => searchItems(items, query).map((found) => found.sku.code);

describe("sotuv qidiruvi", () => {
  it("kirill yozuvi lotinchadek tushuniladi", () => {
    expect(codes("шифон оқ")).toEqual(["SH-01-G1"]);
    expect(codes("қизил атлас")).toEqual(["M101-03"]);
    expect(codes("кўк")).toEqual(["M101-04"]);
    expect(codes("лола")).toEqual(["SH-01-G1"]);
  });

  it("kodda chiziqcha shart emas; partiya raqamida oldingi nollar tashlab yozilsa ham topiladi", () => {
    expect(codes("m10103")).toEqual(["M101-03"]);
    expect(codes("sh01g1")).toEqual(["SH-01-G1"]);
    expect(codes("p20")).toEqual(["M101-03"]);
    expect(codes("p-12")[0]).toBe("SH-01-G1"); // aniq P-000012 — P-000112 dan oldin
  });

  it("bitta harf xatosi kechiriladi (4+ harfli so'zda); x/h va q/k almashsa ham", () => {
    expect(codes("shifan oq")).toEqual(["SH-01-G1"]);
    expect(codes("qzil atlas")).toEqual(["M101-03"]);
    expect(codes("kizil atlas")).toEqual(["M101-03"]);
    expect(codes("hon atlas qizil")).toEqual(["M101-03"]);
    // Qisqa so'zda xato kechirilmaydi — aks holda hamma narsa "mos" bo'lib qoladi
    expect(codes("oa")).toEqual([]);
    expect(codes("shoyi")).toEqual([]);
  });

  it("tartib: aniq kod → boshlanishi → ichida; tengida qoldig'i bori oldin", () => {
    // "qizil": ikkalasida ham bor — qoldig'i bor atlas tugagan shifondan oldin
    expect(codes("qizil")).toEqual(["M101-03", "SH-03"]);
    // Aniq SKU kodi har doim birinchi
    expect(codes("sh-03")[0]).toBe("SH-03");
    // So'z bilan boshlanadigan nom ("Shifon") ichida uchraydiganidan oldin
    expect(codes("sh").slice(0, 2).sort()).toEqual(["SH-01-G1", "SH-03"]);
  });

  it("bo'sh so'rov — hech narsa", () => {
    expect(codes("  ")).toEqual([]);
  });
});

describe("tovar rasmi: SKU → gul → rang (mato rasmi tovarga o'tmaydi)", () => {
  const images = { fabric: "/api/media/1/f.webp", color: "/api/media/1/c.webp", pattern: "/api/media/1/p.webp" };

  it("SKU'ning o'z rasmi bo'lsa — hammasidan oldin", () => {
    const own = item(shifon, oq, lola, [], images).sku;
    expect(skuImage({ ...own, image_url: "/api/media/1/s.webp" })).toBe("/api/media/1/s.webp");
  });

  it("gulli tovarda gul rasmi birinchi", () => {
    expect(skuImage(item(shifon, oq, lola, [], images).sku)).toBe(images.pattern);
  });

  it("gul rasmi bo'lmasa — rang; mato rasmi tovarga o'tmaydi", () => {
    expect(skuImage(item(shifon, oq, lola, [], { fabric: images.fabric, color: images.color }).sku)).toBe(images.color);
    expect(skuImage(item(shifon, oq, lola, [], { fabric: images.fabric }).sku)).toBeNull();
    expect(skuImage(item(shifon, oq, lola, []).sku)).toBeNull();
  });

  it("gulsiz tovarda 'gulsiz' rasmi ishlatilmaydi — rang rasmi yoki hech narsa", () => {
    expect(skuImage(item(shifon, oq, null, [], images).sku)).toBe(images.color);
    expect(skuImage(item(shifon, oq, null, [], { fabric: images.fabric, pattern: images.pattern }).sku)).toBeNull();
  });
});
