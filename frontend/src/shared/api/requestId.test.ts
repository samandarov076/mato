import { beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { ApiError } from "./client";
import { isRejected, useRequestId } from "./requestId";

const timeout = new ApiError(0, "network_error", "network_error");
const gateway = new ApiError(504, "server_error", "Gateway Timeout");
const refused = new ApiError(409, "not_enough_stock", "");

describe("so'rov identifikatori (takrorlanishdan himoya)", () => {
  beforeEach(() => localStorage.clear());

  it("faqat 4xx — aniq rad; javob kelmasa, 5xx yoki kutilmagan xato — noaniq", () => {
    expect(isRejected(refused)).toBe(true);
    expect(isRejected(new ApiError(422, "validation_error", ""))).toBe(true);
    expect(isRejected(timeout)).toBe(false);
    expect(isRejected(gateway)).toBe(false);
    expect(isRejected(new TypeError("boom"))).toBe(false);
  });

  it("natija noaniq bo'lsa identifikator o'zgarmaydi; rad etilsa yoki tasdiqlansa — yangilanadi", () => {
    const { result } = renderHook(() => useRequestId());
    const first = result.current.current();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.current.current()).toBe(first);

    result.current.settle(timeout);
    result.current.settle(gateway);
    expect(result.current.current()).toBe(first);

    result.current.settle(refused);
    const second = result.current.current();
    expect(second).not.toBe(first);

    result.current.settle(); // tasdiqlandi
    expect(result.current.current()).not.toBe(second);
  });

  it("kalit berilsa qurilmada saqlanadi: sahifa yangilansa ham o'sha identifikator", () => {
    const first = renderHook(() => useRequestId("mato.receipt.5.request"));
    const id = first.result.current.current();
    first.unmount();

    const again = renderHook(() => useRequestId("mato.receipt.5.request"));
    expect(again.result.current.current()).toBe(id);

    again.result.current.settle();
    expect(localStorage.getItem("mato.receipt.5.request")).toBeNull();
  });
});
