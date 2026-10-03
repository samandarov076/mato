import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError, type DeviceStatus } from "@/shared/api/client";
import { PinPage } from "./PinPage";

const { pinLogin, reloadDevice } = vi.hoisted(() => ({
  pinLogin: vi.fn(),
  reloadDevice: vi.fn(),
}));
vi.mock("./AuthProvider", () => ({ useAuth: () => ({ pinLogin, reloadDevice }) }));

const device: DeviceStatus = {
  bound: true,
  device_name: "Kassa",
  store: { id: 1, name: "Chorsu do'koni" },
  business: { id: 1, name: "Namuna Mato Savdo", autolock_minutes: 30 },
};

const renderPage = () => render(<PinPage device={device} onUsePassword={() => {}} />);
const key = (digit: string) => screen.getByRole("button", { name: digit });

async function enter(pin: string) {
  for (const digit of pin) await userEvent.click(key(digit));
}

describe("PIN ekrani", () => {
  beforeEach(() => {
    pinLogin.mockReset();
    reloadDevice.mockReset();
  });

  it("do'kon nomini ko'rsatadi va to'rtinchi raqamda o'zi tekshiradi", async () => {
    pinLogin.mockReturnValue(new Promise(() => {})); // javob kutilmoqda
    renderPage();
    expect(screen.getByRole("heading", { name: "Chorsu do'koni" })).toBeInTheDocument();

    await enter("123");
    expect(pinLogin).not.toHaveBeenCalled();
    await enter("4");

    expect(pinLogin).toHaveBeenCalledTimes(1);
    expect(pinLogin).toHaveBeenCalledWith("1234");
    expect(key("1")).toBeDisabled(); // tekshiruv paytida qayta bosib bo'lmaydi
  });

  it("klaviaturadan ham terish mumkin", async () => {
    pinLogin.mockReturnValue(new Promise(() => {}));
    renderPage();

    await userEvent.keyboard("12{Backspace}234");

    expect(pinLogin).toHaveBeenCalledWith("1234");
  });

  it("xato PIN'da sababni ko'rsatadi va qayta kiritishga tayyor turadi", async () => {
    pinLogin.mockRejectedValue(new ApiError(401, "invalid_pin", "invalid_pin"));
    renderPage();

    await enter("0000");

    expect(await screen.findByText("PIN noto'g'ri")).toBeInTheDocument();
    await waitFor(() => expect(key("1")).toBeEnabled());
    await enter("0000");
    expect(pinLogin).toHaveBeenCalledTimes(2);
  });

  it("5 ta xatodan keyin qulflanadi va qolgan vaqtni ko'rsatadi", async () => {
    pinLogin.mockRejectedValue(new ApiError(429, "pin_locked", "pin_locked", undefined, 300));
    renderPage();

    await enter("0000");

    expect(await screen.findByText("Qurilma vaqtincha qulflangan")).toBeInTheDocument();
    expect(screen.getByText(/5:00 dan keyin qayta urinib ko'ring/)).toBeInTheDocument();
    expect(key("1")).toBeDisabled();
  });

  it("qurilma uzilgan bo'lsa holatni qayta so'raydi (oddiy kirish sahifasi ochiladi)", async () => {
    pinLogin.mockRejectedValue(new ApiError(401, "device_not_bound", "device_not_bound"));
    renderPage();

    await enter("1234");

    await waitFor(() => expect(reloadDevice).toHaveBeenCalledTimes(1));
  });
});
