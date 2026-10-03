import { describe, expect, it } from "vitest";
import { createDeduper, setAutoScan } from "./AutoScanner";

describe("doimiy skaner", () => {
  it("kamera oldida turib qolgan etiketka qayta qo'shilmaydi, boshqasi darhol o'tadi", () => {
    const fresh = createDeduper(2500);

    expect(fresh("P-000001", 0)).toBe(true);
    expect(fresh("P-000001", 300)).toBe(false); // keyingi kadrlar — o'sha etiketka
    expect(fresh("P-000001", 2600)).toBe(false); // hali ko'rinib turibdi (har kadr vaqtni yangilaydi)
    expect(fresh("P-000002", 2700)).toBe(true); // boshqa etiketka — darhol
    expect(fresh("P-000001", 2800)).toBe(true); // qaytib kelgan etiketka — yangi skanerlash
  });

  it("etiketka olib qo'yilib, qaytadan ko'rsatilsa — yana qabul qilinadi", () => {
    const fresh = createDeduper(2500);
    expect(fresh("P-000001", 0)).toBe(true);
    expect(fresh("P-000001", 3000)).toBe(true);
  });

  it("sozlama qurilmada saqlanadi", () => {
    setAutoScan({ on: true, facing: "user" });
    expect(JSON.parse(localStorage.getItem("mato.autoscan")!)).toEqual({ on: true, facing: "user" });
    setAutoScan({ on: false });
    expect(JSON.parse(localStorage.getItem("mato.autoscan")!)).toEqual({ on: false, facing: "user" });
  });
});
