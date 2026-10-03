import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/shared/api/client";
import { TwoFactorStep } from "./TwoFactorStep";

const { acceptSession, post } = vi.hoisted(() => ({ acceptSession: vi.fn(), post: vi.fn() }));
vi.mock("@/modules/auth/AuthProvider", () => ({ useAuth: () => ({ acceptSession }) }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  post,
}));

const session = { access_token: "t", expires_in: 1800, user: { id: 1 }, business: null, store: null };

describe("ikkinchi bosqich (platforma egasi)", () => {
  beforeEach(() => {
    acceptSession.mockReset();
    post.mockReset();
  });

  it("ilovadagi kod bilan kiradi", async () => {
    post.mockResolvedValue(session);
    render(
      <TwoFactorStep
        challenge={{ two_factor: "required", challenge_token: "yo'llanma" }}
        onBack={() => {}}
      />,
    );

    await userEvent.type(screen.getByLabelText("Kod"), "12a3456"); // harf tashlab yuboriladi
    await userEvent.click(screen.getByRole("button", { name: "Kirish" }));

    expect(post).toHaveBeenCalledWith("/auth/2fa/verify", {
      challenge_token: "yo'llanma",
      code: "123456",
    });
    await waitFor(() => expect(acceptSession).toHaveBeenCalledWith(session));
  });

  it("xato kodda sababni ko'rsatadi, vaqt tugaganda parol bosqichiga qaytaradi", async () => {
    const onBack = vi.fn();
    post.mockRejectedValueOnce(new ApiError(401, "invalid_code", "invalid_code"));
    render(
      <TwoFactorStep challenge={{ two_factor: "required", challenge_token: "x" }} onBack={onBack} />,
    );

    await userEvent.type(screen.getByLabelText("Kod"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Kirish" }));
    expect(await screen.findByText("Kod noto'g'ri")).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();

    post.mockRejectedValueOnce(new ApiError(401, "challenge_expired", "challenge_expired"));
    await userEvent.type(screen.getByLabelText("Kod"), "000000");
    await userEvent.click(screen.getByRole("button", { name: "Kirish" }));
    await waitFor(() =>
      expect(onBack).toHaveBeenCalledWith("Vaqt tugadi. Parolni qaytadan kiriting."),
    );
  });

  it("birinchi kirishda ilovani ulaydi va zaxira kodlar saqlanmaguncha panelga o'tkazmaydi", async () => {
    post.mockImplementation(async (path: string) =>
      path === "/auth/2fa/setup"
        ? { secret: "ABCDEFGHIJKLMNOP", otpauth_uri: "otpauth://totp/mato-savdo:x?secret=ABCDEFGHIJKLMNOP" }
        : { ...session, recovery_codes: ["abcd-efgh", "jkmn-pqrs"] },
    );
    render(
      <TwoFactorStep challenge={{ two_factor: "setup", challenge_token: "x" }} onBack={() => {}} />,
    );

    expect(await screen.findByText("ABCD EFGH IJKL MNOP")).toBeInTheDocument(); // qo'lda kiritish kaliti
    await userEvent.type(screen.getByLabelText("Kod"), "123456");
    // Ulash oqimida tugma "Ulash" deb nomlanadi (oddiy kirishda — "Kirish")
    await userEvent.click(screen.getByRole("button", { name: "Ulash" }));

    expect(await screen.findByText("abcd-efgh")).toBeInTheDocument();
    expect(acceptSession).not.toHaveBeenCalled();
    const proceed = screen.getByRole("button", { name: "Panelga o'tish" });
    expect(proceed).toBeDisabled();

    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(proceed);
    expect(acceptSession).toHaveBeenCalledTimes(1);
  });
});
