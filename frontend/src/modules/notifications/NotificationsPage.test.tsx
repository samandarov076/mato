import { beforeEach, describe as suite, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import i18n from "@/shared/i18n";
import { describe, type Notification } from "./messages";
import { NotificationsPage } from "./NotificationsPage";

const { api, post } = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn() }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
  post,
}));

const item = (id: number, event_code: string, data: Record<string, unknown>, read = false): Notification => ({
  id,
  event_code,
  data,
  created_at: "2026-10-02T06:00:00Z",
  read,
});

const diff = item(3, "transfer.diff", {
  transfer_id: 7, number: "K-00007", target: "Chorsu do'koni", diff: "12.00", by: "Nodira Sotuvchi",
});
const low = item(
  2,
  "stock.low",
  { sku_id: 5, code: "M101-03", location_id: 2, location: "Chorsu do'koni", qty: "45.50", threshold: "50.00" },
  true,
);

function renderPage(items: Notification[] = [diff, low]) {
  api.mockResolvedValue({ items, next_cursor: null, unread: items.filter((row) => !row.read).length });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/notifications"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/transfers/:id" element={<p>ko'chirish kartochkasi</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

suite("Xabarlar sahifasi", () => {
  beforeEach(() => {
    api.mockReset();
    post.mockReset();
    post.mockResolvedValue(undefined);
  });

  it("hodisani foydalanuvchi tilidagi matnga aylantiradi", async () => {
    renderPage();

    expect(
      await screen.findByText("K-00007: «Chorsu do'koni»ga 12 m kam keldi (Nodira Sotuvchi qabul qildi)"),
    ).toBeInTheDocument();
    expect(screen.getByText("M101-03: «Chorsu do'koni»da 45.5 m qoldi (chegara 50 m)")).toBeInTheDocument();
    // O'qilmagan xabar ekran o'quvchiga ham aytiladi
    const unread = screen.getByText(/K-00007/).closest("button") as HTMLElement;
    expect(within(unread).getByText(/O'qilmagan/)).toBeInTheDocument();
  });

  it("bosilganda o'qilgan qiladi va tegishli sahifani ochadi", async () => {
    renderPage();

    await userEvent.click(await screen.findByText(/K-00007/));

    expect(post).toHaveBeenCalledWith("/notifications/3/read");
    expect(await screen.findByText("ko'chirish kartochkasi")).toBeInTheDocument();
  });

  it("«hammasini o'qilgan qilish» faqat o'qilmagan xabar bo'lsa ko'rinadi", async () => {
    renderPage([low]);
    await screen.findByText(/M101-03/);
    expect(screen.queryByRole("button", { name: "Hammasini o'qilgan deb belgilash" })).toBeNull();
  });

  it("hodisa turi bo'yicha filtr serverga yuboriladi", async () => {
    renderPage();
    await screen.findByText(/K-00007/);

    expect(screen.getAllByRole("radio").map((chip) => chip.textContent)).toEqual([
      "Barchasi", "Kam qoldiq", "Ko'chirish", "Nasiya", "Boshqa",
    ]);
    await userEvent.click(screen.getByRole("radio", { name: "Kam qoldiq" }));

    expect(String(api.mock.calls.at(-1)?.[0])).toContain("kind=low_stock");
  });
});

suite("xabar matni va havolasi", () => {
  const t = i18n.t.bind(i18n);

  it("har hodisa o'z sahifasiga olib boradi", () => {
    expect(describe(diff, t).link).toBe("/transfers/7");
    expect(describe(low, t).link).toBe("/stock?location_id=2&only=low");
    expect(describe(item(1, "batch.big_diff", { batch_id: 9, diff: "-10", percent: 12 }), t).link).toBe("/batches/9");
  });

  it("ortiq kelgan va ortiq chiqqan — alohida matn", () => {
    const over = item(4, "transfer.diff", { ...diff.data, diff: "-4.00" });
    expect(describe(over, t).text).toContain("4 m ortiq keldi");
    const closed = item(5, "batch.big_diff", {
      batch_id: 9, number: "P-000009", location: "Asosiy sklad", diff: "-30.00", percent: 15, by: "Dilshod",
    });
    expect(describe(closed, t).text).toBe("P-000009 yopildi: «Asosiy sklad»da 30 m (15%) ortiq chiqdi — Dilshod");
  });

  it("notanish hodisa sahifani buzmaydi", () => {
    expect(describe(item(6, "future.event", {}), t)).toEqual({ text: "future.event", link: null });
  });
});
