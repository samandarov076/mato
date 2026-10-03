import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { ApiError, post, type Session, type TwoFactorChallenge } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { Button } from "@/shared/ui/Button";
import { Alert, Loading } from "@/shared/ui/feedback";
import { TextField } from "@/shared/ui/fields";
import { focusRing } from "@/shared/ui/tones";

type Setup = { secret: string; otpauth_uri: string };
type Confirmed = Session & { recovery_codes: string[] };

// Kirish ekranlari bilan bir xil sarlavha (28px)
const heading = "text-[28px] font-semibold leading-tight tracking-tight";
// Matnli havola-tugmalar: BackLink bilan bir xil ko'rinish (bu yerda `to` yo'q — onClick ishlaydi)
const textLink = `inline-flex min-h-9 items-center gap-1.5 rounded text-sm text-indigo hover:underline ${focusRing}`;

/**
 * Platforma egasi kirishining ikkinchi bosqichi.
 * - Ilova ulangan: 6 xonali kod (yoki telefon yo'qolgan bo'lsa — zaxira kod).
 * - Ilova hali ulanmagan: QR kod → birinchi kod → zaxira kodlar ko'rsatiladi → panel.
 */
export function TwoFactorStep({
  challenge,
  onBack,
}: {
  challenge: TwoFactorChallenge;
  /** Parol bosqichiga qaytish; xabar berilsa u yerda ko'rsatiladi (masalan, vaqt tugadi) */
  onBack: (message?: string) => void;
}) {
  const { t } = useTranslation();
  const { acceptSession } = useAuth();
  const errorText = useErrorText();
  const settingUp = challenge.two_factor === "setup";

  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState<Confirmed | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  // Vaqt tugagan yoki yo'llanma yaroqsiz — parolni qaytadan kiritish kerak
  const fail = (failure: unknown) => {
    if (failure instanceof ApiError && failure.code === "challenge_expired") {
      onBack(errorText(failure));
    } else {
      setError(errorText(failure));
    }
  };

  useEffect(() => {
    if (!settingUp) return;
    let cancelled = false;
    post<Setup>("/auth/2fa/setup", { challenge_token: challenge.challenge_token })
      .then((data) => !cancelled && setSetup(data))
      .catch((failure) => !cancelled && fail(failure));
    return () => {
      cancelled = true;
    };
    // faqat bir marta: kalit qayta so'ralsa, skanerlangan QR eskirib qoladi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingUp, challenge.challenge_token]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = code.trim();
    if (value.length < 6) {
      setError(t("twofactor.code_required"));
      return;
    }
    setLoading(true);
    setError(null);
    const body = { challenge_token: challenge.challenge_token, code: value };
    try {
      if (settingUp) {
        setConfirmed(await post<Confirmed>("/auth/2fa/confirm", body)); // avval zaxira kodlar ko'rsatiladi
      } else {
        acceptSession(await post<Session>("/auth/2fa/verify", body));
      }
    } catch (failure) {
      setCode("");
      fail(failure);
    } finally {
      setLoading(false);
    }
  }

  async function copyCodes() {
    if (!confirmed) return;
    try {
      await navigator.clipboard.writeText(confirmed.recovery_codes.join("\n"));
      setCopied(true);
      feedback("success");
    } catch {
      /* nusxa olinmadi — kodlar ekranda, qo'lda yozib olish mumkin */
    }
  }

  // ---------- 3-qadam: zaxira kodlar ----------
  if (confirmed) {
    return (
      <div>
        <h1 className={heading}>{t("twofactor.codes_title")}</h1>
        <p className="mt-2 text-muted">{t("twofactor.codes_text")}</p>
        <ul className="mt-5 grid grid-cols-2 gap-2 rounded-control border border-line bg-page p-4 font-mono text-[15px]">
          {confirmed.recovery_codes.map((item) => (
            <li key={item} className="tracking-wider">
              {item}
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="sm" className="mt-3" silent onClick={() => void copyCodes()}>
          {t(copied ? "twofactor.copied" : "twofactor.copy")}
        </Button>
        {/* Ekran o'quvchi ham "nusxa olindi"ni eshitadi — tugma matni o'zgargani e'lon qilinmaydi */}
        <span role="status" className="sr-only">
          {copied ? t("twofactor.copied") : ""}
        </span>
        <label className="mt-6 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="mt-1 size-4 accent-[rgb(var(--indigo))]"
          />
          <span>{t("twofactor.codes_saved")}</span>
        </label>
        <Button block className="mt-5" disabled={!saved} onClick={() => acceptSession(confirmed)}>
          {t("twofactor.continue")}
        </Button>
      </div>
    );
  }

  const codeField = (
    <TextField
      label={t(useRecovery ? "twofactor.recovery_code" : "twofactor.code")}
      value={code}
      onChange={(value) => setCode(useRecovery ? value : value.replace(/\D/g, "").slice(0, 6))}
      inputMode={useRecovery ? "text" : "numeric"}
      autoComplete="one-time-code"
      placeholder={useRecovery ? "abcd-efgh" : "000000"}
      autoFocus
    />
  );

  return (
    <div>
      <h1 className={heading}>
        {t(settingUp ? "twofactor.setup_title" : useRecovery ? "twofactor.recovery_title" : "twofactor.title")}
      </h1>
      <p className="mt-2 text-muted">
        {t(settingUp ? "twofactor.setup_text" : useRecovery ? "twofactor.recovery_text" : "twofactor.text")}
      </p>

      <form onSubmit={submit} noValidate className="mt-6 space-y-5">
        {error && <Alert>{error}</Alert>}

        {settingUp && (
          <ol className="space-y-4 text-[15px]">
            <li>
              <span className="font-medium">1.</span> {t("twofactor.step_app")}
            </li>
            <li>
              <span className="font-medium">2.</span> {t("twofactor.step_scan")}
              {setup ? (
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  {/* QR doim oq fonda — tungi rejimda ham kamera o'qiy olishi uchun */}
                  <div className="rounded-control bg-white p-3">
                    <QRCodeSVG value={setup.otpauth_uri} size={148} />
                  </div>
                  <code className="max-w-[200px] break-all rounded-control border border-line bg-page px-3 py-2 font-mono text-sm tracking-wider">
                    {setup.secret.match(/.{1,4}/g)?.join(" ")}
                  </code>
                </div>
              ) : (
                !error && <Loading className="mt-3" />
              )}
            </li>
            <li>
              <span className="font-medium">3.</span> {t("twofactor.step_code")}
            </li>
          </ol>
        )}

        {codeField}
        {/* Tugma oqimga qarab amalni aytadi: ulashda — "Ulash", oddiy kirishda — "Kirish" */}
        <Button type="submit" block loading={loading} disabled={settingUp && !setup}>
          {t(settingUp ? "twofactor.submit_setup" : "twofactor.submit")}
        </Button>
      </form>

      <div className="mt-6 flex flex-col items-start gap-3 text-sm">
        {!settingUp && (
          <button
            type="button"
            onClick={(event) => {
              feedback("tap", event);
              setUseRecovery((value) => !value);
              setCode("");
              setError(null);
            }}
            className={textLink}
          >
            {t(useRecovery ? "twofactor.use_app" : "twofactor.use_recovery")}
          </button>
        )}
        <button
          type="button"
          onClick={(event) => {
            feedback("tap", event);
            onBack();
          }}
          className={textLink}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("twofactor.back")}
        </button>
      </div>
    </div>
  );
}
