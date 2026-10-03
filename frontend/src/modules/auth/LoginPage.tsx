import { lazy, Suspense, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import type { TwoFactorChallenge } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { Button } from "@/shared/ui/Button";
import { IkatPanel, Logo, Selvedge } from "@/shared/ui/brand";
import { Hero3D } from "@/shared/ui/hero3d/Hero3D";
import { Spinner } from "@/shared/ui/feedback";

// Tasdiqlash ilovasi bosqichi (QR kod kutubxonasi bilan) faqat platforma egasiga kerak — alohida bo'lak
const TwoFactorStep = lazy(() => import("@/modules/platform/TwoFactorStep").then((m) => ({ default: m.TwoFactorStep })));
import { Alert } from "@/shared/ui/feedback";
import { PasswordField, PhoneField } from "@/shared/ui/fields";
import { LanguageSelect } from "@/shared/ui/LanguageSelect";
import { useAuth } from "./AuthProvider";

type Errors = { phone?: string; password?: string; form?: string };

export function LoginPage({
  onBackToPin,
}: {
  /** Do'kon qurilmasida: PIN ekraniga qaytish (berilmasa havola ko'rinmaydi) */
  onBackToPin?: () => void;
}) {
  const { t } = useTranslation();
  const { login } = useAuth();
  const errorText = useErrorText();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Errors = {};
    if (phone.length !== 9) found.phone = t("login.phone_incomplete");
    if (!password) found.password = t("login.password_required");
    setErrors(found);
    if (found.phone || found.password) return;

    setLoading(true);
    try {
      // Muvaffaqiyatli bo'lsa router o'zi ichkariga o'tkazadi; platforma egasiga ikkinchi bosqich ochiladi
      const next = await login(`+998${phone}`, password);
      if (next) {
        setChallenge(next);
        setPassword("");
        setLoading(false);
      }
    } catch (error) {
      setErrors({ form: errorText(error) });
      setLoading(false);
    }
  }

  function backToPassword(message?: string) {
    setChallenge(null);
    setErrors(message ? { form: message } : {});
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(440px,5fr)_7fr]">
      <div className="flex flex-col bg-panel">
        <Selvedge />
        <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
          <Logo />
          <LanguageSelect />
        </header>

        <main className="flex flex-1 items-center px-6 pb-20 pt-6 sm:px-10">
          {challenge ? (
            <div className="mx-auto w-full max-w-[420px]">
              <Suspense fallback={<Spinner className="size-5 text-muted" />}>
                <TwoFactorStep challenge={challenge} onBack={backToPassword} />
              </Suspense>
            </div>
          ) : (
          <div className="mx-auto w-full max-w-[380px] animate-rise">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight">
              {t("login.title")}
            </h1>
            <p className="mt-2 text-muted">{t("login.subtitle")}</p>

            <form onSubmit={submit} noValidate className="mt-8 space-y-5">
              {errors.form && <Alert>{errors.form}</Alert>}
              <PhoneField
                label={t("login.phone")}
                value={phone}
                onChange={setPhone}
                error={errors.phone}
                autoComplete="username"
                autoFocus
              />
              <PasswordField
                label={t("login.password")}
                value={password}
                onChange={setPassword}
                error={errors.password}
                autoComplete="current-password"
              />
              <Button type="submit" block loading={loading}>
                {t(loading ? "login.submitting" : "login.submit")}
              </Button>
            </form>

            <details className="group mt-6 text-sm">
              <summary className="inline cursor-pointer list-none rounded text-indigo hover:underline [&::-webkit-details-marker]:hidden">
                {t("login.forgot")}
              </summary>
              <p className="mt-2 text-muted">{t("login.forgot_text")}</p>
            </details>

            {onBackToPin && (
              <button
                type="button"
                onClick={onBackToPin}
                className="mt-4 inline-flex items-center gap-1.5 rounded text-sm text-indigo hover:underline"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                {t("pin.back")}
              </button>
            )}
          </div>
          )}
        </main>
      </div>

      <IkatPanel className="hidden lg:block">
        <Hero3D size={250} />
        {/* Shisha kartochka: orqadagi naqsh va 3D sahna xira ko'rinib turadi */}
        <div className="animate-rise relative max-w-lg overflow-hidden rounded-2xl border border-white/20 bg-white/10 p-7 shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_24px_48px_-24px_rgb(0_0_0/0.6)] backdrop-blur-xl">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 right-0 size-48 rounded-full bg-white/10 blur-2xl"
          />
          <p className="text-[40px] font-semibold leading-[1.08] tracking-tight text-white">{t("tagline.title")}</p>
          <p className="mt-3 text-lg text-[#D6DCF5]">{t("tagline.text")}</p>
        </div>
      </IkatPanel>
    </div>
  );
}
