import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/client";
import { StaffPage } from "./StaffPage";

const { api, post, patch, me } = vi.hoisted(() => ({
  api: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  me: { is_primary_owner: true },
}));
vi.mock("@/shared/api/client", async (original) => ({
  ...(await original<typeof import("@/shared/api/client")>()),
  api,
  post,
  patch,
}));
vi.mock("@/modules/auth/AuthProvider", () => ({ useCurrentUser: () => ({ user: me }) }));

const staff = [
  { id: 1, full_name: "Akmal Karimov", role: "owner", phone: "+998901112233", is_primary_owner: true, is_active: true, all_locations: true, location_ids: [], has_pin: false },
  { id: 2, full_name: "Nodira Yusupova", role: "seller", phone: null, is_primary_owner: false, is_active: true, all_locations: false, location_ids: [10], has_pin: true },
  { id: 3, full_name: "Bahrom Sodiqov", role: "owner", phone: "+998901112255", is_primary_owner: false, is_active: true, all_locations: true, location_ids: [], has_pin: false },
  { id: 4, full_name: "Eski Sotuvchi", role: "seller", phone: null, is_primary_owner: false, is_active: false, all_locations: true, location_ids: [], has_pin: true },
];
const locations = [
  { id: 10, type: "store", name: "Chorsu do'koni", address: null, phone: null, is_active: true, devices_count: 0, staff: [] },
  { id: 20, type: "warehouse", name: "Asosiy sklad", address: null, phone: null, is_active: true, devices_count: 0, staff: [] },
];

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <StaffPage />
    </QueryClientProvider>,
  );
}

/** Ro'yxatdagi xodim qatori */
const row = async (name: string) => (await screen.findByText(name)).closest("li") as HTMLElement;

describe("Xodimlar sahifasi", () => {
  beforeEach(() => {
    me.is_primary_owner = true;
    post.mockReset();
    patch.mockReset();
    api.mockReset();
    api.mockImplementation((path: string) => Promise.resolve(path.startsWith("/users") ? staff : locations));
  });

  it("asosiy egani o'zgartirib bo'lmaydi, faolsizlar esa so'ralgandagina ko'rinadi", async () => {
    renderPage();

    expect(within(await row("Akmal Karimov")).queryByRole("button")).toBeNull();
    expect(within(await row("Nodira Yusupova")).getByText("PIN o'rnatilgan")).toBeInTheDocument();
    expect(within(await row("Nodira Yusupova")).getByText("Chorsu do'koni")).toBeInTheDocument();
    expect(within(await row("Bahrom Sodiqov")).getByRole("button", { name: "Parolni yangilash" })).toBeInTheDocument();

    expect(screen.queryByText("Eski Sotuvchi")).toBeNull();
    await userEvent.click(screen.getByRole("checkbox", { name: "Faolsizlarni ham ko'rsatish" }));
    expect(within(await row("Eski Sotuvchi")).getByRole("button", { name: "Qayta faollashtirish" })).toBeInTheDocument();
  });

  it("sherik-ega boshqa egalarni boshqara olmaydi va ega qo'sha olmaydi", async () => {
    me.is_primary_owner = false;
    renderPage();

    expect(within(await row("Bahrom Sodiqov")).queryByRole("button")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Xodim qo'shish" }));
    expect(screen.queryByRole("radio", { name: "Sherik-ega" })).toBeNull();
  });

  it("ega xodimning PIN'i va parolini ko'radi; saqlanmagan bo'lsa — tushuntirish chiqadi", async () => {
    post.mockImplementation((path: string) =>
      Promise.resolve(path === "/users/2/reveal" ? { password: null, pin: "4321" } : { password: null, pin: null }),
    );
    renderPage();

    // Asosiy eganing o'zida "ko'rish" tugmasi yo'q
    expect(within(await row("Akmal Karimov")).queryByRole("button")).toBeNull();

    const seller = await row("Nodira Yusupova");
    await userEvent.click(within(seller).getByRole("button", { name: "PIN'ni ko'rish" }));
    expect(post).toHaveBeenCalledWith("/users/2/reveal");
    expect(await within(seller).findByText("4321")).toBeInTheDocument();
    expect(within(seller).getByText("Ko'rganingiz harakatlar jurnaliga yozildi.")).toBeInTheDocument();

    // Qayta bosilsa — yashiriladi
    await userEvent.click(within(seller).getByRole("button", { name: "Yashirish" }));
    expect(within(seller).queryByText("4321")).toBeNull();

    // Parol hali saqlanmagan sherik-ega
    const coOwner = await row("Bahrom Sodiqov");
    await userEvent.click(within(coOwner).getByRole("button", { name: "Parolni ko'rish" }));
    expect(await within(coOwner).findByText(/Hali saqlanmagan/)).toBeInTheDocument();
  });

  it("sotuvchi PIN bilan qo'shiladi; band PIN xatosi PIN maydonida chiqadi", async () => {
    post.mockRejectedValue(new ApiError(409, "pin_taken", "pin_taken"));
    renderPage();
    await row("Akmal Karimov");

    await userEvent.click(screen.getByRole("button", { name: "Xodim qo'shish" }));
    await userEvent.type(screen.getByLabelText("Ism-familiya"), "Sardor Aliyev");
    await userEvent.type(screen.getByLabelText("PIN"), "12a34"); // faqat raqamlar qoladi
    await userEvent.click(screen.getByRole("button", { name: "Saqlash" }));

    expect(post).toHaveBeenCalledWith("/users", {
      full_name: "Sardor Aliyev",
      role: "seller",
      phone: null,
      password: null,
      pin: "1234",
      all_locations: true,
      location_ids: [],
    });
    expect(await screen.findByText("Bu PIN band — boshqasini tanlang")).toBeInTheDocument();
    expect(screen.getByLabelText("PIN")).toHaveAttribute("aria-invalid", "true");
  });

  it("omborchi uchun telefon, parol va joy to'ldirilmaguncha so'rov yuborilmaydi", async () => {
    renderPage();
    await row("Akmal Karimov");

    await userEvent.click(screen.getByRole("button", { name: "Xodim qo'shish" }));
    // formadagi lavozim tanlovi (pastdagi filtrda ham "Omborchi" bor)
    await userEvent.click(screen.getAllByRole("radio", { name: "Omborchi" })[0]);
    await userEvent.type(screen.getByLabelText("Ism-familiya"), "Dilshod Rahimov");
    await userEvent.click(screen.getByRole("switch", { name: "Barcha skladlar" }));
    await userEvent.click(screen.getByRole("button", { name: "Saqlash" }));

    expect(screen.getByText("Kamida bitta joyni tanlang yoki «barchasi»ni yoqing")).toBeInTheDocument();
    expect(screen.getByText("Telefon raqamini to'liq kiriting — 9 ta raqam")).toBeInTheDocument();
    expect(screen.getByText("Kamida 6 ta belgi kiriting")).toBeInTheDocument();
    // faqat skladlar taklif qilinadi — do'kon emas
    expect(screen.getByRole("checkbox", { name: "Asosiy sklad" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Chorsu do'koni" })).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});
