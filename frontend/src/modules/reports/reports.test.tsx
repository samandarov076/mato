import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { ReportsLayout } from "./ReportsLayout";
import { SalesReportPage } from "./SalesReportPage";
import { TopReportPage } from "./TopReportPage";
import { change, presetRange, shift, type Dashboard as Board, type Money, type SalesReport } from "./types";

const { api, post, downloadFile } = vi.hoisted(() => ({ api: vi.fn(), post: vi.fn(), downloadFile: vi.fn() }));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
  post,
  downloadFile,
}));

const today: Money = {
  sales: 702_000, returns: 88_000, profit: 242_000, cash: 392_000, card: 250_000, count: 3, meters: "17.00",
};
const yesterday: Money = {
  sales: 600_000, returns: 0, profit: 275_000, cash: 600_000, card: 0, count: 2, meters: "14.00",
};
const board: Board = {
  date_from: "2026-10-02",
  date_to: "2026-10-02",
  current: today,
  previous: yesterday,
  debt_total: 500_000,
  debt_overdue: 120_000,
  low_stock: 2,
  diff_amount: 1_900_000,
  diff_m: "95.00",
  chart: Array.from({ length: 30 }, (_, index) => ({
    day: shift("2026-10-02", index - 29),
    sales: index === 29 ? 702_000 : index === 28 ? 600_000 : 0,
  })),
};
const notice = {
  id: 4,
  event_code: "sale.returned",
  data: { sale_id: 2, number: "S-000002", amount: 80_000, store: "Chorsu do'koni", by: "Nodira Yusupova" },
  created_at: "2026-10-02T09:44:00Z",
  read: false,
};
const report: SalesReport = {
  group: "day",
  rows: [
    { period: "2026-10-01", ...yesterday },
    { period: "2026-10-02", ...today },
  ],
  total: {
    sales: 1_302_000, returns: 88_000, profit: 517_000, cash: 992_000, card: 250_000, count: 5, meters: "31.00",
  },
  previous: { ...yesterday, sales: 1_000_000, profit: 600_000 },
};

/** So'rov manzili bo'yicha javob: ro'yxatlar bo'sh, qolgani — `answers` dan */
function serve(answers: Record<string, unknown>) {
  api.mockImplementation((path: string) => {
    const hit = Object.keys(answers).find((prefix) => path.startsWith(prefix));
    return Promise.resolve(hit ? answers[hit] : []);
  });
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/reports" element={<ReportsLayout />}>
            <Route index element={<SalesReportPage />} />
            <Route path="top" element={<TopReportPage />} />
          </Route>
          <Route path="/sales/:id" element={<p>sotuv kartochkasi</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const lastCall = (prefix: string) =>
  [...api.mock.calls].reverse().find(([path]) => (path as string).startsWith(prefix))?.[0] as string;

beforeEach(() => {
  api.mockReset();
  post.mockReset();
  downloadFile.mockReset();
  post.mockResolvedValue(undefined);
  downloadFile.mockResolvedValue(undefined);
});

describe("Bosh sahifa (dashboard)", () => {
  beforeEach(() => {
    serve({
      "/reports/dashboard": board,
      "/notifications": { items: [notice], next_cursor: null, unread: 1 },
      "/locations": [
        { id: 2, name: "Chorsu do'koni" },
        { id: 3, name: "Bozor do'koni" },
      ],
    });
  });

  it("savdo, tushum va foyda o'tgan davr bilan taqqoslanadi", async () => {
    renderAt("/");
    const money = await screen.findByRole("region", { name: "Asosiy raqamlar" });

    expect(within(money).getByText("702 000")).toBeInTheDocument();
    expect(within(money).getByText("+17%")).toBeInTheDocument(); // 702 000 va 600 000
    expect(within(money).getByText("642 000")).toBeInTheDocument(); // tushum: naqd + karta
    expect(within(money).getByText(/Naqd 392 000/)).toBeInTheDocument();
    expect(within(money).getByText(/karta 250 000/)).toBeInTheDocument();
    expect(within(money).getByText("−12%")).toBeInTheDocument(); // foyda 242 000 va 275 000

    // Foyda nimani o'z ichiga olmasligi — bosilganda tushuntiriladi
    await userEvent.click(within(money).getByRole("button", { name: "Foyda qanday hisoblanadi" }));
    expect(within(money).getByRole("note")).toHaveTextContent("Metr farqi");
  });

  it("nazorat kartochkalari tegishli sahifaga olib boradi", async () => {
    renderAt("/");
    const watch = await screen.findByRole("region", { name: "Nazorat" });
    const [credit, low, diff] = within(watch).getAllByRole("link");

    // Muddati o'tgan qarz bor — to'g'ri shu mijozlar ro'yxatiga (eng eskisidan boshlab)
    expect(credit).toHaveAttribute("href", "/customers?only=overdue&sort=oldest");
    expect(credit).toHaveTextContent("Muddati o'tgan: 120 000 so'm");
    expect(low).toHaveAttribute("href", "/stock?only=low");
    expect(low).toHaveTextContent("2 ta tovar");
    expect(diff).toHaveAttribute("href", "/differences");
    expect(diff).toHaveTextContent("Metr farqi, bugun");
    expect(diff).toHaveTextContent("95 m kam chiqdi");
  });

  it("davr va do'kon tanlansa, raqamlar shu bo'yicha so'raladi", async () => {
    renderAt("/");
    await screen.findByRole("region", { name: "Asosiy raqamlar" });

    await userEvent.click(screen.getByRole("radio", { name: "Shu hafta" }));
    await userEvent.selectOptions(screen.getByLabelText("Do'kon"), "3");

    await waitFor(() => expect(lastCall("/reports/dashboard")).toContain("store_id=3"));
    expect(lastCall("/reports/dashboard")).toContain("period=week");
  });

  it("e'tibor talab qiladigan xabar bosilsa — o'qilgan bo'ladi va sahifasi ochiladi", async () => {
    renderAt("/");
    await userEvent.click(
      await screen.findByRole("button", { name: /S-000002: «Chorsu do'koni»da 80\s000\sso'm qaytarildi/ }),
    );

    expect(post).toHaveBeenCalledWith("/notifications/4/read");
    expect(await screen.findByText("sotuv kartochkasi")).toBeInTheDocument();
  });
});

describe("Hisobotlar", () => {
  it("savdo hisoboti: jadval, jami va oldingi davr bilan taqqoslash", async () => {
    serve({ "/reports/sales": report });
    renderAt("/reports");

    const total = (await screen.findByRole("cell", { name: "Jami" })).closest("tr") as HTMLElement;
    expect(within(total).getByText("1 302 000")).toBeInTheDocument();
    expect(within(total).getByText("517 000")).toBeInTheDocument();
    expect(screen.getByText("+30%")).toBeInTheDocument(); // savdo 1 302 000 va 1 000 000
    expect(screen.getByText("−14%")).toBeInTheDocument(); // foyda 517 000 va 600 000
    // Eng yangi kun tepada
    const days = screen.getAllByRole("row").map((row) => row.firstElementChild?.textContent);
    expect(days.slice(1, 3)).toEqual(["02.10.2026", "01.10.2026"]);
  });

  it("filtr va kesim so'rovga qo'shiladi; Excel shu filtr bilan yuklanadi", async () => {
    serve({ "/reports/sales": report, "/locations": [{ id: 2, name: "Chorsu do'koni" }] });
    renderAt("/reports");
    await screen.findByRole("cell", { name: "Jami" });
    // Boshida — shu oy
    expect(lastCall("/reports/sales")).toContain(`date_from=${presetRange("month")[0]}`);

    await userEvent.selectOptions(screen.getByLabelText("Davr"), "yesterday");
    await userEvent.selectOptions(screen.getByLabelText("Do'kon"), "2");
    await userEvent.click(screen.getByRole("radio", { name: "Oylar" }));

    const [from, to] = presetRange("yesterday");
    await waitFor(() => expect(lastCall("/reports/sales")).toContain("group=month"));
    expect(lastCall("/reports/sales")).toContain(`date_from=${from}&date_to=${to}&store_id=2`);

    await userEvent.click(screen.getByRole("button", { name: "Excel" }));
    expect(downloadFile).toHaveBeenCalledWith(
      `/reports/sales/export?date_from=${from}&date_to=${to}&store_id=2&group=month`,
    );
  });

  it("ixtiyoriy oraliqda sanalar qo'lda tanlanadi", async () => {
    serve({ "/reports/sales": report });
    renderAt("/reports");
    await screen.findByRole("cell", { name: "Jami" });
    expect(screen.queryByLabelText("Sanadan")).toBeNull();

    await userEvent.selectOptions(screen.getByLabelText("Davr"), "custom");
    expect(screen.getByLabelText("Sanadan")).toHaveValue(presetRange("month")[0]);
  });

  it("top tovarlar: kesim va ko'rsatkich tanlanadi", async () => {
    serve({
      "/reports/top": [
        { id: 1, label: "M101-01 · Atlas · Qizil", meters: "12.00", amount: 552_000, profit: 192_000 },
        { id: 2, label: "M101-02 · Atlas · Ko'k", meters: "5.00", amount: 150_000, profit: 50_000 },
      ],
    });
    renderAt("/reports/top");

    const first = (await screen.findByText("M101-01 · Atlas · Qizil")).closest("li") as HTMLElement;
    expect(within(first).getByText("552 000")).toBeInTheDocument();
    expect(within(first).getByText(/foyda 192 000/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Rang" }));
    await userEvent.click(screen.getByRole("radio", { name: "Metr" }));
    await waitFor(() => expect(lastCall("/reports/top")).toContain("by=color&metric=meters&limit=10"));
    // Ro'yxat yangi so'rov bilan qayta chiziladi — o'ngda endi metr ko'rinadi
    expect(await screen.findByText("12 m")).toBeInTheDocument();
  });
});

describe("davr yordamchilari", () => {
  it("tayyor davrlar: hafta dushanbadan, oy 1-kundan, o'tgan oy to'liq", () => {
    expect(presetRange("today", "2026-10-02")).toEqual(["2026-10-02", "2026-10-02"]);
    expect(presetRange("yesterday", "2026-10-01")).toEqual(["2026-09-30", "2026-09-30"]);
    expect(presetRange("week", "2026-10-02")).toEqual(["2026-09-28", "2026-10-02"]); // juma → dushanba
    expect(presetRange("week", "2026-10-04")).toEqual(["2026-09-28", "2026-10-04"]); // yakshanba
    expect(presetRange("week", "2026-10-05")).toEqual(["2026-10-05", "2026-10-05"]); // dushanba
    expect(presetRange("month", "2026-10-02")).toEqual(["2026-10-01", "2026-10-02"]);
    expect(presetRange("last_month", "2026-03-15")).toEqual(["2026-02-01", "2026-02-28"]);
    expect(presetRange("last_month", "2026-01-10")).toEqual(["2025-12-01", "2025-12-31"]);
  });

  it("o'zgarish foizi; o'tgan davr nol bo'lsa — solishtirilmaydi", () => {
    expect(change(115, 100)).toBe(15);
    expect(change(80, 100)).toBe(-20);
    expect(change(100, 0)).toBeNull();
    expect(shift("2026-03-01", -1)).toBe("2026-02-28");
  });
});
