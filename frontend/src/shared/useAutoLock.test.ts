import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAutoLock } from "./useAutoLock";

describe("avto-qulflash", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("harakatsizlik muddati o'tgach bir marta qulflaydi — so'rov kutilayotganda qayta chaqirmaydi", () => {
    const lock = vi.fn();
    renderHook(() => useAutoLock(1, lock));

    vi.advanceTimersByTime(50_000);
    expect(lock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20_000); // 70 s harakatsiz
    expect(lock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000); // qulf so'rovi hali javob bermagan
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("ekranga tegilsa hisob qaytadan boshlanadi", () => {
    const lock = vi.fn();
    renderHook(() => useAutoLock(1, lock));

    vi.advanceTimersByTime(50_000);
    window.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(50_000);
    expect(lock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20_000);
    expect(lock).toHaveBeenCalledTimes(1);
  });

  it("o'chirilgan bo'lsa (ega o'z planshetida emas) hech qachon qulflamaydi", () => {
    const lock = vi.fn();
    renderHook(() => useAutoLock(1, lock, false));

    vi.advanceTimersByTime(10 * 60_000);
    expect(lock).not.toHaveBeenCalled();
  });
});
