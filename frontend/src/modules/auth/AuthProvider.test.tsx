import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearLocked, isLocked, pendingLogout, type Session } from "@/shared/api/client";
import { AuthProvider, useAuth } from "./AuthProvider";

const session = (id: number, name: string): Session => ({
  access_token: `token-${id}`,
  expires_in: 1800,
  user: {
    id, full_name: name, phone: null, role: "seller", is_primary_owner: false,
    language: "uz", must_change_password: false,
  },
  business: { id: 1, name: "Atlas savdo", autolock_minutes: 30 },
  store: { id: 2, name: "Chorsu do'koni" },
});
const nodira = session(9, "Nodira");
const aziz = session(5, "Aziz");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const offline = () => Promise.reject(new TypeError("Failed to fetch"));

/** Server: cookie tirikmi (`alive`), chiqish so'rovi yetib boradimi (`online`) */
const server = { alive: true, online: true, hold: false, pin: nodira };
const held: ((response: Response) => void)[] = [];
const fetchMock = vi.fn((path: string) => {
  if (path === "/api/auth/device") return Promise.resolve(json({ bound: true, device_name: "Kassa", store: nodira.store, business: nodira.business }));
  if (path === "/api/auth/refresh") {
    return Promise.resolve(server.alive ? json(nodira) : json({ code: "not_authenticated" }, 401));
  }
  if (path === "/api/auth/logout") {
    if (server.hold) return new Promise<Response>((resolve) => held.push(resolve)); // javob kechikmoqda
    if (!server.online) return offline();
    server.alive = false;
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  if (path === "/api/auth/pin") {
    server.alive = true;
    return Promise.resolve(json(server.pin));
  }
  return Promise.resolve(json({}));
});
const calls = (path: string) => fetchMock.mock.calls.filter((call) => call[0] === `/api${path}`).length;

let queryClient: QueryClient;

function Probe() {
  const { status, user, logout, pinLogin } = useAuth();
  return (
    <div>
      <p data-testid="status">{status === "authed" ? user?.full_name : status}</p>
      <button onClick={() => void logout()}>qulf</button>
      <button onClick={() => void pinLogin("1234")}>pin</button>
    </div>
  );
}

function renderApp() {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const status = () => screen.getByTestId("status").textContent;
const lock = () => userEvent.click(screen.getByRole("button", { name: "qulf" }));

describe("Qulflash va sessiya", () => {
  beforeEach(() => {
    localStorage.clear();
    clearLocked();
    Object.assign(server, { alive: true, online: true, hold: false, pin: nodira });
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    queryClient = new QueryClient();
  });
  afterEach(async () => {
    // Kechiktirilgan chiqish so'rovi yakunlanadi — keyingi testga "yo'ldagi so'rov" o'tib qolmasin
    held.splice(0).forEach((resolve) => resolve(new Response(null, { status: 204 })));
    await pendingLogout();
    vi.unstubAllGlobals();
  });

  it("qulf darhol ishlaydi — chiqish so'rovining javobi kutilmaydi", async () => {
    renderApp();
    await waitFor(() => expect(status()).toBe("Nodira"));
    server.hold = true; // javob kechikmoqda

    await lock();

    expect(status()).toBe("guest");
    expect(calls("/auth/logout")).toBe(1);
  });

  it("internet yo'qligida qulflansa — sahifa qayta ochilganda sessiya tiklanmaydi", async () => {
    const first = renderApp();
    await waitFor(() => expect(status()).toBe("Nodira"));
    server.online = false;

    await lock();
    expect(status()).toBe("guest");
    await waitFor(() => expect(isLocked()).toBe(true));

    first.unmount(); // sahifa qayta yuklandi; cookie serverda hali tirik
    const refreshes = calls("/auth/refresh");
    renderApp();

    await waitFor(() => expect(status()).toBe("guest"));
    expect(calls("/auth/refresh")).toBe(refreshes); // tirik cookie bilan sessiya so'ralmadi
    expect(isLocked()).toBe(true);
  });

  it("ulanish tiklangach chiqish so'rovi qayta yuboriladi va qulf belgisi olinadi", async () => {
    renderApp();
    await waitFor(() => expect(status()).toBe("Nodira"));
    server.online = false;
    await lock();
    await waitFor(() => expect(isLocked()).toBe(true));

    server.online = true;
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(isLocked()).toBe(false));
    expect(calls("/auth/logout")).toBe(2);
    expect(server.alive).toBe(false);
    expect(status()).toBe("guest");
  });

  it("qulfdan keyin yangi PIN bilan kirilsa — qulf belgisi olinadi (keyingi ochilishda sessiya tiklanadi)", async () => {
    renderApp();
    await waitFor(() => expect(status()).toBe("Nodira"));
    server.online = false;
    await lock();
    await waitFor(() => expect(isLocked()).toBe(true));

    server.pin = aziz;
    await userEvent.click(screen.getByRole("button", { name: "pin" }));

    await waitFor(() => expect(status()).toBe("Aziz"));
    expect(isLocked()).toBe(false);
  });

  it("foydalanuvchi almashganda yoki sessiya tugaganda kesh tozalanadi (egadan qolgan tannarx ko'rinmaydi)", async () => {
    renderApp();
    await waitFor(() => expect(status()).toBe("Nodira"));
    queryClient.setQueryData(["reports", "profit"], { profit: 1_000_000 });

    // Sessiya serverda tugadi (aniq chiqishsiz): keyingi so'rov 401, yangilash ham 401
    server.alive = false;
    const { refreshSession } = await import("@/shared/api/client");
    await act(async () => {
      await refreshSession();
    });

    expect(status()).toBe("guest");
    expect(queryClient.getQueryData(["reports", "profit"])).toBeUndefined();

    // Boshqa xodim kirdi — undan oldin keshga tushgan narsa ham qolmaydi
    queryClient.setQueryData(["reports", "profit"], { profit: 2 });
    server.pin = aziz;
    await userEvent.click(screen.getByRole("button", { name: "pin" }));
    await waitFor(() => expect(status()).toBe("Aziz"));
    server.pin = nodira;
    queryClient.setQueryData(["sales", "context"], { items: [] });
    await userEvent.click(screen.getByRole("button", { name: "pin" }));
    await waitFor(() => expect(status()).toBe("Nodira"));
    expect(queryClient.getQueryData(["sales", "context"])).toBeUndefined();
  });
});
