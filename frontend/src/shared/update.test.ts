import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyUpdateWhenIdle, hasUnsavedWork, installDirtyTracking } from "./update";

const cart = (changes: object = {}) =>
  JSON.stringify({ uuid: "u", lines: [], payment: "cash", customer: null, initial: "", initialMethod: "cash", pending: false, ...changes });

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("ilova yangilanishi — faqat ish yo'qolmaydigan paytda", () => {
  beforeEach(() => {
    localStorage.clear();
    history.pushState(null, "", "/");
    installDirtyTracking();
  });
  afterEach(() => {
    document.body.innerHTML = "";
    setVisibility("visible");
  });

  it("bo'sh savat va toza sahifa — band emas", () => {
    localStorage.setItem("mato.cart.9.2", cart());
    localStorage.setItem("mato.autoscan", JSON.stringify({ on: true }));
    localStorage.setItem("mato.receipt.5.request", "11111111-1111-4111-8111-111111111111");
    expect(hasUnsavedWork()).toBe(false);
  });

  it("to'lmagan savat yoki tasdiqlanmagan sotuv — band", () => {
    localStorage.setItem("mato.cart.9.2", cart({ lines: [{ id: "l1" }] }));
    expect(hasUnsavedWork()).toBe(true);
    localStorage.setItem("mato.cart.9.2", cart({ lines: [{ id: "l1" }], pending: true }));
    expect(hasUnsavedWork()).toBe(true);
  });

  it("kirim yoki ko'chirish qoralamasi — band", () => {
    localStorage.setItem("mato.receipt.5", JSON.stringify({ note: "yarim yozilgan" }));
    expect(hasUnsavedWork()).toBe(true);
    localStorage.clear();
    localStorage.setItem("mato.transfer.5", JSON.stringify({ picked: "1" }));
    expect(hasUnsavedWork()).toBe(true);
  });

  it("ochiq formaga yozilgan bo'lsa — band; maydon bo'shatilsa yoki forma yopilsa — yo'q", () => {
    const type = (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const meters = document.createElement("input");
    const price = document.createElement("input");
    price.value = "45 000"; // o'zi to'ldirilgan (tavsiya narx) — foydalanuvchi yozmagan
    document.body.append(meters, price);
    expect(hasUnsavedWork()).toBe(false);

    type(meters, "2,35");
    expect(hasUnsavedWork()).toBe(true);

    // Sotuvchi kun bo'yi shu sahifada: sotuv yakunlangach maydon bo'shaydi — sahifa yana "bo'sh"
    type(meters, "");
    expect(hasUnsavedWork()).toBe(false);

    type(meters, "10");
    expect(hasUnsavedWork()).toBe(true);
    meters.remove(); // forma yopildi yoki boshqa sahifaga o'tildi
    expect(hasUnsavedWork()).toBe(false);
  });

  it("yangilanish: oyna yashirin va ish yo'q bo'lsagina qo'llanadi — bir marta", () => {
    const update = vi.fn();
    applyUpdateWhenIdle(update);
    expect(update).not.toHaveBeenCalled(); // oyna ko'rinib turibdi — so'ramasdan yangilanmaydi

    localStorage.setItem("mato.cart.9.2", cart({ lines: [{ id: "l1" }] }));
    setVisibility("hidden");
    expect(update).not.toHaveBeenCalled(); // savat to'lmagan

    setVisibility("visible");
    localStorage.setItem("mato.cart.9.2", cart());
    setVisibility("hidden");
    expect(update).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    setVisibility("hidden");
    expect(update).toHaveBeenCalledTimes(1);
  });
});
