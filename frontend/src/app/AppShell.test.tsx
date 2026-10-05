import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { Business, DeviceStatus, User } from "@/shared/api/client";
import { AppShell } from "./AppShell";

const auth = vi.hoisted(() => ({
  device: null as unknown,
  logout: vi.fn(),
}));
const owner = {
  id: 1,
  full_name: "Akmal Ega",
  phone: "+998901112233",
  role: "owner",
  is_primary_owner: true,
  language: "uz",
  must_change_password: false,
} as User;
const business: Business = { id: 1, name: "Atlas savdo", autolock_minutes: 1 };

vi.mock("@/modules/auth/AuthProvider", () => ({
  useAuth: () => ({ device: auth.device, logout: auth.logout }),
  useCurrentUser: () => ({ user: owner, business, store: null }),
}));
vi.mock("@/modules/notifications/Bell", () => ({ Bell: () => null }));
vi.mock("@/shared/ui/HeaderControls", () => ({ HeaderControls: () => null }));
vi.mock("@/shared/feedback", () => ({ feedback: vi.fn() }));

const bound = (businessId: number): DeviceStatus => ({
  bound: true,
  device_name: "Kassa",
  store: { id: 2, name: "Chorsu do'koni" },
  business: { id: businessId, name: "Biznes", autolock_minutes: 30 },
});

function renderShell(device: DeviceStatus | null) {
  auth.device = device;
  return render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AppShell />
    </MemoryRouter>,
  );
}

// Eslatma (sariq banner) olib tashlangan — hech bir holatda chiqmasligi kerak (docs/03-details/02-tuzilma.md)
const banner = () => screen.queryByText(/do'koniga bog'langan/);

describe("ega do'kon qurilmasida", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    auth.logout.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("o'z biznesining qurilmasida — eslatma chiqmaydi, harakatsizlikdan keyin avto-qulflanadi", () => {
    renderShell(bound(1));

    expect(banner()).not.toBeInTheDocument();
    expect(screen.queryByText("Qurilmani uzish")).not.toBeInTheDocument();
    vi.advanceTimersByTime(50_000);
    expect(auth.logout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20_000); // 70 s harakatsiz, sozlama — 1 daqiqa
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it("begona biznes qurilmasida — eslatma yo'q, avto-qulf yo'q (oddiy brauzer)", () => {
    renderShell(bound(77));

    expect(banner()).not.toBeInTheDocument();
    vi.advanceTimersByTime(10 * 60_000);
    expect(auth.logout).not.toHaveBeenCalled();
  });

  it("qurilma bo'lmasa — eslatma yo'q, avto-qulf yo'q", () => {
    renderShell({ bound: false, device_name: null, store: null, business: null });

    expect(banner()).not.toBeInTheDocument();
    vi.advanceTimersByTime(10 * 60_000);
    expect(auth.logout).not.toHaveBeenCalled();
  });
});
