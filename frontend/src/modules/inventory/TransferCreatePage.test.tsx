import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ApiError } from "@/shared/api/client";
import { TransferCreatePage } from "./TransferCreatePage";

const { api, post } = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn() }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
  post,
}));
vi.mock("@/modules/auth/AuthProvider", () => ({
  useCurrentUser: () => ({ user: { id: 5, full_name: "Dilshod Omborchi", role: "warehouse" } }),
}));

const batch = {
  batch_id: 12, number: "P-000012", qty_m: "500.00", rolls: 10, roll_m: "50.00",
  sku: { id: 101, code: "M101-01", fabric: "Atlas", color: "Qizil", pattern: null, hex: null, image_url: null },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/transfers/new"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route path="/transfers/new" element={<TransferCreatePage />} />
          <Route path="/transfers/:id" element={<p>ko'chirish kartochkasi</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const send = () => userEvent.click(screen.getByRole("button", { name: "Jo'natish" }));

describe("Ko'chirish yaratish", () => {
  beforeEach(() => {
    localStorage.clear();
    post.mockReset();
    api.mockReset();
    api.mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith("/transfers/options")
          ? { sources: [{ id: 1, name: "Asosiy sklad", type: "warehouse" }], targets: [{ id: 2, name: "Chorsu do'koni", type: "store" }] }
          : [],
      ),
    );
    // Yakunlanmagan forma: skladdan do'konga, P-000012 dan 2 rulon / 100 m
    localStorage.setItem(
      "mato.transfer.5",
      JSON.stringify({ picked: "1", to: "2", note: "", lines: [{ batch, rolls: "2", meters: "100" }] }),
    );
  });

  it("javob kelmasa qayta bosish o'sha identifikator bilan ketadi — ko'chirish ikki marta yozilmaydi", async () => {
    post.mockRejectedValueOnce(new ApiError(504, "server_error", "Gateway Timeout"));
    post.mockResolvedValueOnce({ id: 9 });
    const first = renderPage();
    await screen.findByText("P-000012");

    await send();
    expect(await screen.findByRole("alert")).toHaveTextContent("Serverda xatolik yuz berdi");
    const sent = post.mock.calls[0][1];
    expect(sent).toEqual({
      client_uuid: expect.stringMatching(/^[0-9a-f-]{36}$/),
      from_location_id: 1,
      to_location_id: 2,
      note: null,
      lines: [{ batch_id: 12, rolls: 2, meters: "100" }],
    });

    // Sahifa yangilansa ham identifikator o'sha
    first.unmount();
    renderPage();
    await screen.findByText("P-000012");
    await send();

    expect(await screen.findByText("ko'chirish kartochkasi")).toBeInTheDocument();
    expect(post.mock.calls[1][1].client_uuid).toBe(sent.client_uuid);
  });

  it("server aniq rad etsa (4xx) — keyingi urinish yangi identifikator bilan", async () => {
    post.mockRejectedValueOnce(
      new ApiError(409, "not_enough_stock", "", undefined, undefined, { batch: "P-000012", available: "80.00" }),
    );
    post.mockResolvedValueOnce({ id: 9 });
    renderPage();
    await screen.findByText("P-000012");

    await send();
    expect(await screen.findByRole("alert")).toHaveTextContent("P-000012: bu joyda 80.00 m bor xolos");
    await send();

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][1].client_uuid).not.toBe(post.mock.calls[0][1].client_uuid);
  });
});
