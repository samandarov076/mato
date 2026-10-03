import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api, bindSession, isLocked, markLocked, clearLocked, setSession, type Session } from "./client";

const session = (token: string): Session => ({
  access_token: token,
  expires_in: 1800,
  user: {
    id: 9, full_name: "Nodira Sotuvchi", phone: null, role: "seller", is_primary_owner: false,
    language: "uz", must_change_password: false,
  },
  business: { id: 1, name: "Atlas savdo", autolock_minutes: 30 },
  store: { id: 2, name: "Chorsu do'koni" },
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const expired = () => json({ code: "not_authenticated", message: "not_authenticated" }, 401);

const fetchMock = vi.fn();
const paths = () => fetchMock.mock.calls.map((call) => call[0] as string);
const bearer = (index: number) => (fetchMock.mock.calls[index][1].headers as Record<string, string>).Authorization;

describe("API mijoz: eskirgan token", () => {
  const onSession = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockReset();
    onSession.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    bindSession(onSession);
    setSession(session("eski"));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    clearLocked();
  });

  it("401 → sessiya yangilanadi → so'rov yangi token bilan bir marta qaytariladi", async () => {
    fetchMock
      .mockResolvedValueOnce(expired())
      .mockResolvedValueOnce(json(session("yangi")))
      .mockResolvedValueOnce(json({ ok: true }));

    await expect(api("/stock")).resolves.toEqual({ ok: true });

    expect(paths()).toEqual(["/api/stock", "/api/auth/refresh", "/api/stock"]);
    expect([bearer(0), bearer(2)]).toEqual(["Bearer eski", "Bearer yangi"]);
    expect(onSession).toHaveBeenCalledWith(session("yangi"));
  });

  it("yangilash ham 401 bersa — sessiya tugagan: xato qaytadi va ilovaga xabar beriladi", async () => {
    fetchMock.mockResolvedValueOnce(expired()).mockResolvedValueOnce(expired());

    await expect(api("/stock")).rejects.toMatchObject({ status: 401, code: "not_authenticated" });

    expect(paths()).toEqual(["/api/stock", "/api/auth/refresh"]);
    expect(onSession).toHaveBeenCalledWith(null);
  });

  it("bir vaqtda bir nechta so'rov 401 olsa — yangilash bitta so'rov bilan", async () => {
    fetchMock.mockImplementation((path: string, init: RequestInit) => {
      if (path === "/api/auth/refresh") return Promise.resolve(json(session("yangi")));
      const fresh = (init.headers as Record<string, string>).Authorization === "Bearer yangi";
      return Promise.resolve(fresh ? json({ path }) : expired());
    });

    await expect(Promise.all([api("/a"), api("/b"), api("/c")])).resolves.toHaveLength(3);

    expect(paths().filter((path) => path === "/api/auth/refresh")).toHaveLength(1);
  });

  it("kirish, yangilash va chiqish so'rovlari 401 da qayta urinilmaydi", async () => {
    fetchMock.mockResolvedValue(expired());
    await expect(api("/auth/login", { method: "POST" })).rejects.toBeInstanceOf(ApiError);
    expect(paths()).toEqual(["/api/auth/login"]);
  });

  it("qurilma qulflangan bo'lsa — tirik cookie bilan ham sessiya tiklanmaydi", async () => {
    markLocked();
    expect(isLocked()).toBe(true);
    fetchMock.mockResolvedValueOnce(expired());

    await expect(api("/stock")).rejects.toMatchObject({ status: 401 });

    expect(paths()).toEqual(["/api/stock"]); // /auth/refresh chaqirilmadi
    expect(onSession).not.toHaveBeenCalledWith(expect.objectContaining({ access_token: expect.any(String) }));
  });

  it("tarmoq xatosi — network_error, 5xx — server_error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api("/stock")).rejects.toMatchObject({ status: 0, code: "network_error" });
    fetchMock.mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }));
    await expect(api("/stock")).rejects.toMatchObject({ status: 502, code: "server_error" });
  });
});
