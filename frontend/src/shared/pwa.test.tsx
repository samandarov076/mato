import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { installPwaListeners, resetInstallStateForTests } from "./pwa";
import { InstallIconButton } from "./ui/InstallApp";

/** Brauzerning "o'rnatish" taklifi (beforeinstallprompt) — test uchun soxta hodisa */
function fakePrompt(outcome: "accepted" | "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

const installButton = () => screen.queryByRole("button", { name: "Ilovani o'rnatish" });

describe("ilovani o'rnatish", () => {
  beforeAll(() => installPwaListeners());
  beforeEach(() => resetInstallStateForTests());

  it("brauzer taklif bersa — o'z oynasi ochiladi, o'rnatilgach tugma yashirinadi", async () => {
    render(<InstallIconButton />);
    const event = fakePrompt("accepted");
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true); // brauzerning kichik banneri o'rniga bizning tugma

    await userEvent.click(installButton()!);

    expect(event.prompt).toHaveBeenCalled();
    await vi.waitFor(() => expect(installButton()).toBeNull());
  });

  it("taklifdan voz kechilsa — tugma qoladi (keyin qo'lda o'rnatish yo'riqnomasi)", async () => {
    render(<InstallIconButton />);
    window.dispatchEvent(fakePrompt("dismissed"));

    await userEvent.click(installButton()!);

    await vi.waitFor(() => expect(installButton()).toBeInTheDocument());
  });

  it("taklif bo'lmasa — tugma baribir bor va yo'riqnoma ko'rsatadi", async () => {
    render(<InstallIconButton />);

    await userEvent.click(installButton()!);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ilova o'rnatilgani haqida xabar kelsa — tugma yo'qoladi", async () => {
    render(<InstallIconButton />);
    expect(installButton()).toBeInTheDocument();

    window.dispatchEvent(new Event("appinstalled"));

    await vi.waitFor(() => expect(installButton()).toBeNull());
  });
});
