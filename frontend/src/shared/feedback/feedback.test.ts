import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feedback, getFeedbackPrefs, HAPTICS, setFeedbackPrefs, supportsHaptics } from "./index";

/** Tovush va tebranish: sozlamaga bo'ysunadi, qurilma qo'llamasa jim o'tadi, qurilmada saqlanadi. */
describe("Sezgi javobi", () => {
  const vibrate = vi.fn(() => true);

  beforeEach(() => {
    localStorage.clear();
    setFeedbackPrefs({ sound: true, haptics: true });
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true, writable: true });
    vibrate.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true, writable: true });
  });

  it("tugma bosilganda qisqa, xatoda uzun takrorlanuvchi naqsh yuboriladi", () => {
    feedback("tap", { clientX: 10 });
    expect(vibrate).toHaveBeenLastCalledWith([...HAPTICS.tap]);
    feedback("error");
    expect(vibrate).toHaveBeenLastCalledWith([...HAPTICS.error]);
    expect(HAPTICS.error.length).toBeGreaterThan(HAPTICS.tap.length);
  });

  it("sahifa almashganda planshet titramaydi (faqat tovush)", () => {
    feedback("swish");
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("tebranish o'chirilgan bo'lsa — jim; sozlama qurilmada saqlanadi", () => {
    setFeedbackPrefs({ haptics: false });
    feedback("success");
    expect(vibrate).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("mato.feedback") ?? "{}")).toEqual({ sound: true, haptics: false });
    expect(getFeedbackPrefs()).toEqual({ sound: true, haptics: false });
  });

  it("qurilma tebranishni qo'llamasa (iPhone) — xatosiz o'tadi", () => {
    Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true, writable: true });
    expect(supportsHaptics()).toBe(false);
    expect(() => feedback("tap")).not.toThrow();
  });

  it("brauzerda Web Audio bo'lmasa (testlardagidek) tovush xatosiz o'tadi", () => {
    expect(() => feedback("celebrate")).not.toThrow();
  });
});
