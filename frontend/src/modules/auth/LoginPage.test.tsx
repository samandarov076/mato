import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/shared/api/client";
import { LoginPage } from "./LoginPage";

const { login, reloadDevice, post } = vi.hoisted(() => ({
  login: vi.fn(),
  reloadDevice: vi.fn(),
  post: vi.fn(),
}));
vi.mock("./AuthProvider", () => ({ useAuth: () => ({ login, reloadDevice }) }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  post,
}));

describe("Kirish sahifasi — do'kon logini", () => {
  beforeEach(() => {
    login.mockReset();
    reloadDevice.mockReset();
    post.mockReset();
  });

  it("do'kon varag'ida login va parol bilan qurilmani ochadi, keyin PIN ekraniga o'tadi", async () => {
    post.mockResolvedValue({ bound: true });
    reloadDevice.mockResolvedValue(undefined);
    const opened = vi.fn();
    render(<LoginPage onStoreOpened={opened} />);

    await userEvent.click(screen.getByRole("radio", { name: "Do'kon" }));
    await userEvent.type(screen.getByLabelText("Do'kon logini"), "  chorsu ");
    await userEvent.type(screen.getByLabelText("Parol"), "dokon1234");
    await userEvent.click(screen.getByRole("button", { name: "Do'konni ochish" }));

    expect(post).toHaveBeenCalledWith("/auth/store-login", { login: "chorsu", password: "dokon1234" });
    expect(reloadDevice).toHaveBeenCalled();
    expect(opened).toHaveBeenCalled();
    expect(login).not.toHaveBeenCalled();
  });

  it("bo'sh maydonlarni yubormaydi, xato login-parolni tushunarli aytadi", async () => {
    post.mockRejectedValue(new ApiError(401, "invalid_store_credentials", "x"));
    render(<LoginPage />);
    await userEvent.click(screen.getByRole("radio", { name: "Do'kon" }));

    await userEvent.click(screen.getByRole("button", { name: "Do'konni ochish" }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText("Do'kon loginini kiriting")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Do'kon logini"), "chorsu");
    await userEvent.type(screen.getByLabelText("Parol"), "xato");
    await userEvent.click(screen.getByRole("button", { name: "Do'konni ochish" }));
    expect(await screen.findByText("Do'kon logini yoki paroli noto'g'ri")).toBeInTheDocument();
    expect(reloadDevice).not.toHaveBeenCalled();
  });
});
