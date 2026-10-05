import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatDecimal, formatLongDate, formatNumber } from "./format";

describe("sana formatlari (Toshkent vaqti)", () => {
  it("uzun sana o'zbekcha: hafta kuni va oy nomi bilan", () => {
    expect(formatLongDate(new Date("2026-10-02T06:00:00Z"), "uz")).toBe("Juma, 2-oktabr");
  });

  it("kun chegarasi Toshkent vaqti bo'yicha — UTC kechki payt ertangi kun hisoblanadi", () => {
    // UTC 20:30 = Toshkentda ertasi kuni 01:30
    expect(formatLongDate(new Date("2026-10-02T20:30:00Z"), "uz")).toBe("Shanba, 3-oktabr");
  });

  it("ruscha va inglizcha — brauzerning o'z formati, bosh harf bilan", () => {
    expect(formatLongDate(new Date("2026-10-02T06:00:00Z"), "ru")).toMatch(/^Пятница, 2 октября/);
    expect(formatLongDate(new Date("2026-10-02T06:00:00Z"), "en")).toMatch(/^Friday,? 2 October/);
  });

  it("sana va vaqt raqamli ko'rinishda", () => {
    expect(formatDateTime("2026-10-02T06:08:27Z")).toBe("02.10.2026, 11:08");
    expect(formatDate("2026-10-02T20:30:00Z")).toBe("03.10.2026");
  });
});

describe("manfiy sonlar — minus yo'qolmaydi", () => {
  it("−1 va 0 orasidagi qiymat ham manfiy ko'rinadi (butun qismi −0 bo'lsa ham)", () => {
    expect(formatDecimal("-0.13")).toBe("-0.13");
    expect(formatDecimal("-0.50")).toBe("-0.5");
    expect(formatDecimal("-3.00")).toBe("-3");
    expect(formatDecimal("-1250.75").replace(/\s/g, " ")).toBe("-1 250.75");
    expect(formatDecimal("-0.00")).toBe("0"); // nol — belgisiz
    expect(formatDecimal("0.13")).toBe("0.13");
  });

  it("butun sonlar: manfiy summa minus bilan, −0 esa oddiy nol", () => {
    expect(formatNumber(-300000).replace(/\s/g, " ")).toBe("-300 000");
    expect(formatNumber(-0.4)).toBe("0");
    expect(formatNumber(-0)).toBe("0");
  });
});
