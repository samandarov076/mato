/**
 * API mijoz.
 *
 * Ikki token: qisqa muddatli (access) — faqat shu fayl xotirasida, har so'rovga qo'shiladi;
 * uzoq muddatli (refresh) — httpOnly cookie'da, JavaScript uni ko'rmaydi.
 * Access token eskirsa (401), mijoz o'zi yangilab, so'rovni bir marta qaytaradi.
 */

export type Role = "platform_owner" | "owner" | "warehouse" | "seller";
export type Language = "uz" | "en" | "ru";

export type User = {
  id: number;
  full_name: string;
  phone: string | null;
  role: Role;
  is_primary_owner: boolean;
  language: Language;
  must_change_password: boolean;
};

export type Business = {
  id: number;
  name: string;
  /** Do'kon qurilmasi shuncha daqiqa harakatsiz tursa qulflanadi */
  autolock_minutes: number;
};

export type Store = { id: number; name: string };

export type Session = {
  access_token: string;
  expires_in: number;
  user: User;
  business: Business | null;
  /** Do'kon qurilmasidan (PIN bilan) kirilgan bo'lsa — qaysi do'kon */
  store: Store | null;
};

/** Platforma egasi parolni to'g'ri kiritdi — sessiya o'rniga ikkinchi bosqichga yo'llanma */
export type TwoFactorChallenge = {
  /** required — ilovadagi kod so'raladi; setup — tasdiqlash ilovasi hali ulanmagan */
  two_factor: "required" | "setup";
  challenge_token: string;
};

/** Bu brauzer do'kon qurilmasimi (PIN ekranini ko'rsatish kerakmi) */
export type DeviceStatus = {
  bound: boolean;
  device_name: string | null;
  store: Store | null;
  business: Business | null;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    /** Xato kodi — interfeys uni `errors.<code>` bo'yicha tarjima qiladi */
    public code: string,
    message: string,
    /** Maydon xatolari: { new_password: "string_too_short" } */
    public fields?: Record<string, string>,
    /** Blok tugashiga qolgan soniya (juda ko'p xato urinishdan keyin) */
    public retryAfter?: number,
    /** Xatoga qo'shib yuborilgan tafsilotlar — xabar matniga qo'yiladi (masalan: { available: "120.00" }) */
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

let accessToken: string | null = null;
let onSessionChange: (session: Session | null) => void = () => {};

/** Sessiya o'zgarganda (yangilandi yoki tugadi) chaqiriladigan funksiya — AuthProvider ulaydi. */
export function bindSession(listener: (session: Session | null) => void) {
  onSessionChange = listener;
}

export function setSession(session: Session | null) {
  accessToken = session?.access_token ?? null;
}

// Osilib qolgan ulanish (yarim ochiq Wi-Fi) ilovani abadiy kutdirmasin: 15 s, yozuvchi so'rovlarga 40 s
const TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 40_000;

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  const controller = new AbortController();
  const isWrite = init.method && init.method !== "GET";
  const timer = window.setTimeout(() => controller.abort(), isWrite ? WRITE_TIMEOUT_MS : TIMEOUT_MS);
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      signal: init.signal ?? controller.signal,
      credentials: "same-origin",
      headers: {
        // Fayl (FormData) yuborilganda sarlavhani brauzerning o'zi qo'yadi
        ...(init.body && !(init.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, "network_error", "network_error");
  } finally {
    window.clearTimeout(timer);
  }
  if (!res.ok) {
    let code = res.status >= 500 ? "server_error" : "error";
    let message = res.statusText;
    let fields: Record<string, string> | undefined;
    let retryAfter: number | undefined;
    let details: Record<string, unknown> = {};
    try {
      const body = await res.json();
      code = body.code ?? code;
      message = body.message ?? message;
      fields = body.fields;
      retryAfter = body.retry_after;
      details = body;
    } catch {
      /* javob JSON emas */
    }
    throw new ApiError(res.status, code, message, fields, retryAfter, details);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

let refreshing: Promise<Session | null> | null = null;

/** Cookie'dagi uzoq muddatli token bilan sessiyani yangilaydi. Bir vaqtda faqat bitta so'rov ketadi. */
export function refreshSession(): Promise<Session | null> {
  refreshing ??= request<Session>("/auth/refresh", { method: "POST" })
    .catch((error) => {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    })
    .then((session) => {
      setSession(session);
      onSessionChange(session);
      return session;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const NO_RETRY = new Set(["/auth/login", "/auth/refresh", "/auth/logout"]);

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await request<T>(path, init);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || NO_RETRY.has(path)) throw error;
    const session = await refreshSession().catch(() => null);
    if (!session) throw error;
    return request<T>(path, init);
  }
}

const withBody = (method: string) =>
  <T>(path: string, body?: unknown) =>
    api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const post = withBody("POST");
export const patch = withBody("PATCH");
export const put = withBody("PUT");
export const del = withBody("DELETE");

/**
 * Server-Sent Events oqimini ochadi (real vaqt signallari). Brauzerning EventSource'i sarlavhada
 * token yubora olmaydi, shuning uchun oddiy fetch: javob tanasi oqim sifatida o'qiladi.
 */
export async function openStream(path: string, signal: AbortSignal): Promise<Response> {
  const open = () =>
    fetch(`/api${path}`, {
      signal,
      credentials: "same-origin",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  let res = await open();
  if (res.status === 401 && (await refreshSession().catch(() => null))) res = await open();
  if (!res.ok || !res.body) throw new ApiError(res.status, "stream_failed", "stream_failed");
  return res;
}

/**
 * Server yasagan faylni (Excel hisobot) yuklab oladi. Oddiy havola token yubora olmaydi, shuning uchun
 * fayl fetch bilan olinib, brauzerga "saqlash" uchun beriladi. Nomi — serverning Content-Disposition idan.
 */
export async function downloadFile(path: string): Promise<void> {
  const open = () =>
    fetch(`/api${path}`, {
      credentials: "same-origin",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  let res: Response;
  try {
    res = await open();
    if (res.status === 401 && (await refreshSession().catch(() => null))) res = await open();
  } catch {
    throw new ApiError(0, "network_error", "network_error");
  }
  if (!res.ok) throw new ApiError(res.status, res.status >= 500 ? "server_error" : "error", res.statusText);
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "hisobot.xlsx";
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Rasmni yuklaydi va manzilini qaytaradi (mato, rang, gul rasmlari). */
export async function uploadImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  return (await api<{ url: string }>("/uploads/image", { method: "POST", body })).url;
}
