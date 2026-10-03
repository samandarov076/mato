import { describe, expect, it } from "vitest";
import en from "./en/common.json";
import ru from "./ru/common.json";
import uz from "./uz/common.json";

type Tree = { [key: string]: string | Tree };

/** Barcha kalitlar "a.b.c" ko'rinishida; ko'plik qo'shimchalari (_one, _few ...) til bo'yicha farq qiladi — olib tashlanadi */
function keys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [`${prefix}${key.replace(/_(zero|one|two|few|many|other)$/, "")}`]
      : keys(value, `${prefix}${key}.`),
  );
}

const locales: Record<string, Tree> = { uz, en, ru };

describe("tarjimalar", () => {
  it("server qaytaradigan umumiy xato kodlari uch tilda ham tarjima qilingan", () => {
    const codes = [
      "validation_error", "not_found", "invalid_cursor", // umumiy
      "sale_basket_changed", "request_changed", // takrorlanishdan himoya
      "network_error", "server_error", "unknown",
    ];
    for (const [language, tree] of Object.entries(locales)) {
      const errors = tree.errors as Tree;
      for (const code of codes) {
        expect(errors[code], `${language}: errors.${code}`).toEqual(expect.any(String));
        expect(String(errors[code]).length, `${language}: errors.${code}`).toBeGreaterThan(5);
      }
    }
  });

  it("uch tilda bir xil kalitlar to'plami (hech bir matn bitta tilda qolib ketmagan)", () => {
    const base = new Set(keys(uz));
    for (const language of ["en", "ru"]) {
      const other = new Set(keys(locales[language]));
      expect([...base].filter((key) => !other.has(key)), `${language} da yo'q`).toEqual([]);
      expect([...other].filter((key) => !base.has(key)), `faqat ${language} da bor`).toEqual([]);
    }
  });
});
