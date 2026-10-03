import { describe, expect, it } from "vitest";
import { divRound, fromUnits, minDecimal, parseDecimal, sumDecimals, toUnits } from "./decimal";

describe("aniq o'nli hisob (float'siz)", () => {
  it("satr ↔ butun birliklar: 12.5 m = 1250 yuzdan bir", () => {
    expect(toUnits("12.5", 2)).toBe(1250);
    expect(toUnits("12,50", 2)).toBe(1250);
    expect(toUnits(" 0.07 ", 2)).toBe(7);
    expect(toUnits("-5.00", 2)).toBe(-500); // manfiy qoldiq
    expect(toUnits("2.8011", 4)).toBe(28011);
    expect(toUnits("1.005", 2)).toBeNull(); // kasr qismi uzun
    expect(toUnits("abc", 2)).toBeNull();
    expect(toUnits("", 2)).toBeNull();

    expect(fromUnits(1250, 2)).toBe("12.5");
    expect(fromUnits(7, 2)).toBe("0.07");
    expect(fromUnits(-500, 2)).toBe("-5");
    expect(fromUnits(15000, 2)).toBe("150");
    expect(fromUnits(990, 2, true)).toBe("9.90"); // serverdagidek doim ikki xona
  });

  it("ayirish float xatosiz: 10.03 − 0.13 = 9.9 (9.899999999999999 emas)", () => {
    expect(String(10.03 - 0.13)).toBe("9.899999999999999"); // float bilan shunday chiqadi
    expect(fromUnits(toUnits("10.03", 2)! - toUnits("0.13", 2)!, 2)).toBe("9.9");
  });

  it("bo'lish serverdagi ROUND_HALF_UP kabi: yarim — noldan uzoqqa", () => {
    expect(divRound(5, 2)).toBe(3);
    expect(divRound(-5, 2)).toBe(-3);
    expect(divRound(7, 2)).toBe(4);
    expect(divRound(4, 3)).toBe(1);
    expect(divRound(5, 3)).toBe(2);
    expect(divRound(26959 * 49550, 100)).toBe(13_358_185); // float: 13 358 184
  });

  it("yig'indi va kichigi", () => {
    expect(sumDecimals(["0.1", "0.2"], 2)).toBe("0.3");
    expect(sumDecimals(["500", "200,5", "", "xato"], 2)).toBe("700.5");
    expect(sumDecimals([], 2)).toBe("0");
    expect(minDecimal("150", "120.50", 2)).toBe("120.5");
    expect(minDecimal("50.00", "500.00", 2)).toBe("50");
  });

  it("kiritilgan son: vergul ham nuqta ham; musbat; kasr uzunligi cheklangan", () => {
    expect(parseDecimal("3,25", 2)).toBe("3.25");
    expect(parseDecimal("0", 2)).toBeNull();
    expect(parseDecimal("1.234", 2)).toBeNull();
    expect(parseDecimal("1234567", 2)).toBeNull(); // 6 xonadan uzun
    // Ko'chirish qabulida 0 ham to'g'ri javob (hech narsa kelmadi), butun qismi 7 xonagacha
    expect(parseDecimal("0", 2, { zero: true, digits: 7 })).toBe("0");
    expect(parseDecimal("1234567,5", 2, { zero: true, digits: 7 })).toBe("1234567.5");
  });
});
