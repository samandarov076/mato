import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TelegramCard } from "./TelegramCard";

const { api, post, patch, del } = vi.hoisted(() => ({
  api: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
  post,
  patch,
  del,
}));

const off = { configured: true, linked: false, username: null, daily_summary: true, instant_alerts: true };
const linked = { ...off, linked: true, username: "akmal_ega" };

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TelegramCard />
    </QueryClientProvider>,
  );
}

describe("Profil: Telegram", () => {
  beforeEach(() => {
    api.mockReset();
    post.mockReset();
    patch.mockReset();
    del.mockReset();
    patch.mockResolvedValue(undefined);
    del.mockResolvedValue(undefined);
  });

  it("bot sozlanmagan bo'lsa — ulash tugmasi yo'q", async () => {
    api.mockResolvedValue({ ...off, configured: false });
    renderCard();
    expect(await screen.findByText(/Telegram boti hali sozlanmagan/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Telegram'ni ulash" })).toBeNull();
  });

  it("ulash: bir martalik havola ochiladi va sahifa ulanishni kutadi", async () => {
    api.mockResolvedValue(off);
    post.mockResolvedValue({ url: "https://t.me/mato_test_bot?start=abc", expires_in: 900 });
    renderCard();

    await userEvent.click(await screen.findByRole("button", { name: "Telegram'ni ulash" }));

    expect(post).toHaveBeenCalledWith("/telegram/link");
    const bot = await screen.findByRole("link", { name: "Botni ochish" });
    expect(bot).toHaveAttribute("href", "https://t.me/mato_test_bot?start=abc");
    expect(bot).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("status")).toHaveTextContent("Ulanish kutilmoqda");
  });

  it("ulangan: nimalar kelishi tanlanadi", async () => {
    api.mockResolvedValue(linked);
    renderCard();

    expect(await screen.findByText("@akmal_ega ulangan")).toBeInTheDocument();
    const summary = screen.getByRole("switch", { name: "Kunlik xulosa" });
    expect(summary).toBeChecked();

    await userEvent.click(summary);
    expect(patch).toHaveBeenCalledWith("/telegram", { daily_summary: false, instant_alerts: true });
  });

  it("uzish", async () => {
    api.mockResolvedValue(linked);
    renderCard();
    await userEvent.click(await screen.findByRole("button", { name: "Uzish" }));
    expect(del).toHaveBeenCalledWith("/telegram");
  });
});
