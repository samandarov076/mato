import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import i18n, { loadLanguage } from "@/shared/i18n";
import {
  api,
  bindSession,
  post,
  refreshSession,
  setSession,
  type Business,
  type DeviceStatus,
  type Session,
  type Store,
  type TwoFactorChallenge,
  type User,
} from "@/shared/api/client";

type AuthState = {
  /** loading — sahifa ochilganda sessiya va qurilma holati tekshirilmoqda */
  status: "loading" | "guest" | "authed";
  user: User | null;
  business: Business | null;
  /** Do'kon qurilmasidan (PIN bilan) kirilgan bo'lsa — qaysi do'kon */
  store: Store | null;
};

type AuthContextValue = AuthState & {
  /** Bu brauzer do'konga bog'langanmi. Bog'langan bo'lsa kirish sahifasi o'rniga PIN ekrani chiqadi. */
  device: DeviceStatus | null;
  /** Kirdi — null; platforma egasi bo'lsa — ikkinchi bosqich uchun yo'llanma qaytadi */
  login: (phone: string, password: string) => Promise<TwoFactorChallenge | null>;
  /** Ikkinchi bosqichdan o'tgach olingan sessiyani qabul qiladi */
  acceptSession: (session: Session) => void;
  pinLogin: (pin: string) => Promise<void>;
  /** Chiqish; do'kon qurilmasida — qulflash (PIN ekraniga qaytadi) */
  logout: () => Promise<void>;
  /** Profil o'zgarganda (til, parol) — serverga qayta so'rov yubormasdan holatni yangilaydi */
  updateUser: (patch: Partial<User>) => void;
  reloadDevice: () => Promise<void>;
  /** Qurilma bog'langach: egasining sessiyasi tugagan — PIN ekraniga o'tiladi */
  deviceBound: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const GUEST: AuthState = { status: "guest", user: null, business: null, store: null };
const LOADING: AuthState = { ...GUEST, status: "loading" };

const fetchDevice = () => api<DeviceStatus>("/auth/device").catch(() => null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(LOADING);
  const [device, setDevice] = useState<DeviceStatus | null>(null);
  const [ready, setReady] = useState(false);
  const queryClient = useQueryClient();

  const apply = useCallback((session: Session | null) => {
    setSession(session);
    // Profil tili sahifa chizilishidan OLDIN o'rnatiladi: keyin almashtirilsa, endigina ochilgan sahifa
    // eski tilda qolib ketishi mumkin (til boshqa qurilmada o'zgartirilgan bo'lsa).
    const language = session?.user.language;
    if (language && i18n.language !== language) void loadLanguage(language).then(() => i18n.changeLanguage(language));
    setState(
      session
        ? {
            status: "authed",
            user: session.user,
            business: session.business,
            store: session.store ?? null,
          }
        : GUEST,
    );
  }, []);

  // Sahifa ochilganda: sessiya tirikmi (cookie) va bu brauzer do'kon qurilmasimi
  useEffect(() => {
    let cancelled = false;
    bindSession(apply);
    void Promise.all([refreshSession().catch(() => null), fetchDevice()]).then(
      ([session, deviceStatus]) => {
        if (cancelled) return;
        apply(session);
        setDevice(deviceStatus);
        setReady(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [apply]);

  // Interfeys tili — foydalanuvchi profilidagi til
  const language = state.user?.language;
  useEffect(() => {
    if (language && i18n.language !== language) void loadLanguage(language).then(() => i18n.changeLanguage(language));
  }, [language]);

  const login = useCallback(
    async (phone: string, password: string) => {
      const result = await post<Session | TwoFactorChallenge>("/auth/login", { phone, password });
      if ("challenge_token" in result) return result; // platforma egasi: ikkinchi bosqich kerak
      apply(result);
      return null;
    },
    [apply],
  );

  const pinLogin = useCallback(
    async (pin: string) => {
      apply(await post<Session>("/auth/pin", { pin }));
    },
    [apply],
  );

  const logout = useCallback(async () => {
    await post("/auth/logout").catch(() => {});
    queryClient.clear(); // boshqa foydalanuvchi kirsa, eski ma'lumot ko'rinmasin
    apply(null);
  }, [apply, queryClient]);

  const updateUser = useCallback((patch: Partial<User>) => {
    setState((s) => (s.user ? { ...s, user: { ...s.user, ...patch } } : s));
  }, []);

  const reloadDevice = useCallback(async () => {
    setDevice(await fetchDevice());
  }, []);

  const deviceBound = useCallback(async () => {
    setDevice(await fetchDevice());
    queryClient.clear();
    apply(null);
  }, [apply, queryClient]);

  const value = useMemo(
    () => ({
      ...state,
      status: ready ? state.status : "loading",
      device,
      login,
      acceptSession: apply,
      pinLogin,
      logout,
      updateUser,
      reloadDevice,
      deviceBound,
    }),
    [state, ready, device, login, apply, pinLogin, logout, updateUser, reloadDevice, deviceBound],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth AuthProvider ichida ishlatilishi kerak");
  return value;
}

/** Kirgan foydalanuvchi — faqat himoyalangan sahifalar ichida (u yerda user doim bor). */
export function useCurrentUser(): { user: User; business: Business | null; store: Store | null } {
  const { user, business, store } = useAuth();
  if (!user) throw new Error("useCurrentUser faqat kirgandan keyingi sahifalarda ishlatiladi");
  return { user, business, store };
}
