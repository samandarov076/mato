import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { CloseBatchPage } from "./CloseBatchPage";
import type { StockPage } from "./types";

const { api, who } = vi.hoisted(() => ({ api: vi.fn(), who: { store: null as { id: number; name: string } | null } }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
}));
vi.mock("@/modules/auth/AuthProvider", () => ({
  useCurrentUser: () => ({ user: { id: 4, full_name: "Dilshod Omborchi", role: "warehouse" }, store: who.store }),
}));

// Bitta partiya ikki joyda: skladda 650 m, do'konda 260.75 m
const stock: StockPage = {
  total: 1,
  locations: [
    { id: 1, name: "Asosiy sklad", type: "warehouse" },
    { id: 2, name: "Chorsu do'koni", type: "store" },
  ],
  items: [
    {
      sku: { id: 101, code: "M101-03", fabric_name: "Xon atlas", color_name: "Qizil", pattern_name: null, hex: null, image_url: null },
      total_m: "910.75", in_transit_m: "0.00", threshold: null,
      totals: [],
      batches: [
        {
          id: 1, number: "P-000001", receipt_date: "2026-09-20", in_transit_m: "0.00",
          stocks: [
            { location_id: 1, qty_m: "650.00", rolls: 13 },
            { location_id: 2, qty_m: "260.75", rolls: 5 },
          ],
        },
      ],
    },
  ],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <CloseBatchPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Partiyani yopish", () => {
  beforeEach(() => {
    localStorage.clear();
    api.mockReset();
    api.mockResolvedValue(stock);
    who.store = null;
  });

  it("bir nechta joy ko'radigan xodimda (omborchi, ega) har qatorda joy nomi turadi", async () => {
    renderPage();
    const rows = await screen.findAllByRole("link", { name: /P-000001/ });
    expect(rows).toHaveLength(2);
    // Qoldig'i ozi tepada: do'kon (260.75), keyin sklad (650)
    expect(within(rows[0]).getByText("Chorsu do'koni")).toBeInTheDocument();
    expect(rows[0]).toHaveTextContent("260.75 m");
    expect(within(rows[1]).getByText("Asosiy sklad")).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent("650 m");
  });

  it("do'kon qurilmasida (bitta joy) joy nomi sarlavhada — qatorlarda takrorlanmaydi", async () => {
    who.store = { id: 2, name: "Chorsu do'koni" };
    renderPage();
    const rows = await screen.findAllByRole("link", { name: /P-000001/ });
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).queryByText("Chorsu do'koni")).toBeNull();
    expect(screen.getByRole("heading", { name: /Chorsu do'koni/ })).toBeInTheDocument();
  });
});
