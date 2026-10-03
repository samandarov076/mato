import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { TransferPage } from "./TransferPage";
import { metersForRolls, type TransferCard } from "./types";

const { api, post } = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn() }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
  post,
}));

const transfer: TransferCard = {
  id: 7,
  number: "K-00007",
  status: "in_transit",
  source: { id: 1, name: "Asosiy sklad", type: "warehouse" },
  target: { id: 2, name: "Chorsu do'koni", type: "store" },
  lines_count: 1,
  sent_m: "200.00",
  received_m: null,
  has_diff: false,
  sent_by: { id: 5, name: "Dilshod Omborchi" },
  sent_at: "2026-10-02T06:00:00Z",
  received_by: null,
  received_at: null,
  note: null,
  receive_note: null,
  cancelled_by: null,
  cancelled_at: null,
  can_receive: true,
  can_cancel: false,
  lines: [
    {
      id: 31,
      batch_id: 12,
      batch_number: "P-000012",
      sku: { id: 3, code: "M101-03", fabric_name: "Xon atlas", color_name: "Qizil", pattern_name: null, hex: "#b8322a", image_url: null },
      sent_rolls: 4,
      sent_m: "200.00",
      received_rolls: null,
      received_m: null,
      roll_m: "50.00",
    },
  ],
};

function renderPage(card: TransferCard = transfer) {
  api.mockResolvedValue(card);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/transfers/7"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route path="/transfers/:id" element={<TransferPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const rollsInput = () => screen.getByLabelText("P-000012: kelgan rulon");
const metersInput = () => screen.getByLabelText("P-000012: kelgan metr");

describe("Ko'chirishni qabul qilish", () => {
  beforeEach(() => {
    api.mockReset();
    post.mockReset();
    post.mockResolvedValue(undefined);
  });

  it("kelgan miqdor jo'natilgani bilan to'ldirilgan; farq bo'lmasa bir bosishda qabul qilinadi", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Ko'chirish K-00007" })).toBeInTheDocument();
    expect(rollsInput()).toHaveValue("4");
    expect(metersInput()).toHaveValue("200");

    await userEvent.click(screen.getByRole("button", { name: "Hammasi to'g'ri — qabul qilish" }));

    expect(post).toHaveBeenCalledWith("/transfers/7/receive", {
      note: null,
      lines: [{ line_id: 31, rolls: 4, meters: "200" }],
    });
  });

  it("rulon kam kelsa metr qayta hisoblanadi va izohsiz qabul qilinmaydi", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Ko'chirish K-00007" });

    await userEvent.clear(rollsInput());
    await userEvent.type(rollsInput(), "3");
    expect(metersInput()).toHaveValue("150"); // 3 rulon × 50 m
    expect(screen.getByText("50 m kam")).toBeInTheDocument();
    // Farq paydo bo'ldi — "hammasi to'g'ri" tugmasi yo'qoladi
    expect(screen.queryByRole("button", { name: "Hammasi to'g'ri — qabul qilish" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Farq bilan qabul qilish" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Farq bor — izoh yozing");
    expect(post).not.toHaveBeenCalled();

    // Metrni qo'lda ham tuzatsa bo'ladi
    await userEvent.clear(metersInput());
    await userEvent.type(metersInput(), "187,5");
    expect(screen.getByText("12.5 m kam")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Qabul qiluvchining izohi"), "Bitta rulon kalta");
    await userEvent.click(screen.getByRole("button", { name: "Farq bilan qabul qilish" }));

    expect(post).toHaveBeenCalledWith("/transfers/7/receive", {
      note: "Bitta rulon kalta",
      lines: [{ line_id: 31, rolls: 3, meters: "187.5" }],
    });
  });

  it("ortiq kelgani ham farq — alohida ko'rinadi", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "Ko'chirish K-00007" });
    await userEvent.clear(metersInput());
    await userEvent.type(metersInput(), "204");

    expect(screen.getByText("4 m ortiq")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Farq bilan qabul qilish" })).toBeEnabled();
  });

  it("qabul qilingan ko'chirish — faqat o'qish: kelgan miqdor, farq va izoh", async () => {
    renderPage({
      ...transfer,
      status: "received",
      has_diff: true,
      received_m: "188.00",
      received_by: { id: 9, name: "Nodira Sotuvchi" },
      received_at: "2026-10-02T08:00:00Z",
      receive_note: "12 m kam keldi",
      can_receive: false,
      lines: [{ ...transfer.lines[0], received_rolls: 4, received_m: "188.00" }],
    });

    expect(await screen.findByText("Farq bilan qabul qilingan")).toBeInTheDocument();
    expect(screen.getByText("12 m kam")).toBeInTheDocument();
    expect(screen.getByText("12 m kam keldi")).toBeInTheDocument();
    expect(screen.getByText("Nodira Sotuvchi")).toBeInTheDocument();
    expect(screen.queryByLabelText("P-000012: kelgan metr")).toBeNull();
    expect(screen.queryByRole("button", { name: /qabul qilish/ })).toBeNull();
  });
});

describe("rulondan metr", () => {
  it("rulon soni × o'rtacha rulon uzunligi", () => {
    expect(metersForRolls("3", "50.00")).toBe("150");
    expect(metersForRolls("2", "33.33")).toBe("66.66");
    expect(metersForRolls("", "50.00")).toBe("");
  });
});
