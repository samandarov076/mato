import { describe, expect, it } from "vitest";
import { code128 } from "./barcode";

describe("Code 128 shtrix-kodi", () => {
  it("ma'lum matnni standart bo'yicha kodlaydi", () => {
    // Etalon — jsbarcode kutubxonasining natijasi (boshlanish + P + - + 1 + nazorat + tugash)
    expect(code128("P-1")).toBe(
      "11010010000" + "11101110110" + "10011011100" + "10011100110" + "11101101110" + "1100011101011",
    );
  });

  it("uzunligi: har belgiga 11 modul, boshlanish, nazorat va tugash belgilari", () => {
    const modules = code128("P-000123");
    expect(modules).toHaveLength(11 + 8 * 11 + 11 + 13);
    expect(modules).toMatch(/^[01]+$/);
    expect(modules.startsWith("11010010000")).toBe(true); // B to'plami
    expect(modules.endsWith("1100011101011")).toBe(true);
  });

  it("nazorat belgisi matnga bog'liq — bitta raqam o'zgarsa, kod ham o'zgaradi", () => {
    const a = code128("P-000123");
    const b = code128("P-000124");
    expect(a).not.toBe(b);
    expect(a.slice(-24, -13)).not.toBe(b.slice(-24, -13)); // nazorat belgilari ham farq qiladi
  });

  it("kodga sig'maydigan belgi yoki bo'sh matnni rad etadi", () => {
    expect(() => code128("")).toThrow();
    expect(() => code128("Қ-1")).toThrow(); // kirill harfi B to'plamida yo'q
  });
});
