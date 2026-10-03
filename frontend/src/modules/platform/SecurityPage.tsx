import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, Smartphone } from "lucide-react";
import { api, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Alert, Loading } from "@/shared/ui/feedback";
import { TextField } from "@/shared/ui/fields";
import { Chip } from "@/shared/ui/list";
import { PageTitle } from "@/shared/ui/PageTitle";
import { RecoveryCodes } from "./TwoFactorStep";

type Status = { enabled: boolean; recovery_left: number; required: boolean };
type Setup = { secret: string; otpauth_uri: string };

/**
 * Platforma egasining xavfsizligi: ikki bosqichli kirishni o'zi yoqadi yoki o'chiradi.
 * Yoqish: QR → ilovadagi birinchi kod → zaxira kodlar (bir marta). O'chirish: hozirgi kod yoki zaxira kod
 * bilan — ochiq qolgan sessiyani topib olgan odam himoyani o'chira olmasin.
 */
export function SecurityPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const status = useQuery({ queryKey: ["platform", "2fa"], queryFn: () => api<Status>("/platform/2fa") });

  const [mode, setMode] = useState<"idle" | "enable" | "disable">("idle");
  const [setup, setSetup] = useState<Setup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  const reload = () => queryClient.invalidateQueries({ queryKey: ["platform", "2fa"] });

  function close() {
    setMode("idle");
    setSetup(null);
    setCode("");
    setError(null);
    // Fokus formani ochgan tugmaga qaytadi
    requestAnimationFrame(() => triggerRef.current?.querySelector("button")?.focus());
  }

  async function startEnable() {
    setNotice(null);
    setError(null);
    setMode("enable");
    try {
      setSetup(await post<Setup>("/platform/2fa/setup", {}));
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = code.trim();
    if (value.length < 6) {
      setError(t("twofactor.code_required"));
      feedback("error");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "enable") {
        const result = await post<{ recovery_codes: string[] }>("/platform/2fa/enable", { code: value });
        setCodes(result.recovery_codes); // avval zaxira kodlar ko'rsatiladi, holat keyin yangilanadi
        setMode("idle");
        setSetup(null);
        setCode("");
      } else {
        await post("/platform/2fa/disable", { code: value });
        setNotice(t("security.disabled_done"));
        close();
        await reload();
      }
    } catch (failure) {
      setCode("");
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  const data = status.data;
  const enabling = mode === "enable";

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle icon={ShieldCheck} tone="indigo">
        {t("security.title")}
      </PageTitle>

      <div className="mt-5 space-y-4">
        {notice && <Alert tone="success">{notice}</Alert>}

        <Card title={t("security.twofactor_title")} icon={Smartphone} tone="indigo">
          {status.isLoading && <Loading />}
          {status.error && <Alert>{errorText(status.error)}</Alert>}

          {codes ? (
            // ---------- Yoqildi: zaxira kodlar (faqat bir marta) ----------
            <div>
              <p className="font-medium">{t("twofactor.codes_title")}</p>
              <p className="mt-1 text-muted">{t("twofactor.codes_text")}</p>
              <RecoveryCodes
                codes={codes}
                doneLabel={t("security.done")}
                onDone={() => {
                  setCodes(null);
                  setNotice(t("security.enabled_done"));
                  void reload();
                }}
              />
            </div>
          ) : (
            data && (
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <Chip tone={data.enabled ? "leaf" : "neutral"} dot>
                    {t(data.enabled ? "security.on" : "security.off")}
                  </Chip>
                  {data.enabled && (
                    <span className="text-sm text-muted">
                      {t("security.recovery_left", { count: data.recovery_left })}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-muted">{t(data.enabled ? "security.on_text" : "security.off_text")}</p>
                {data.required && <p className="mt-2 text-sm text-muted">{t("security.required_text")}</p>}

                {mode === "idle" && !(data.enabled && data.required) && (
                  <div ref={triggerRef} className="mt-5">
                    {data.enabled ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setNotice(null);
                          setMode("disable");
                        }}
                      >
                        {t("security.disable")}
                      </Button>
                    ) : (
                      <Button onClick={() => void startEnable()}>{t("security.enable")}</Button>
                    )}
                  </div>
                )}

                {mode !== "idle" && (
                  <form
                    onSubmit={submit}
                    noValidate
                    className={`mt-5 space-y-5 rounded-control p-4 ${
                      enabling ? "border border-line bg-page" : "bg-madder-soft"
                    }`}
                  >
                    {error && <Alert focus>{error}</Alert>}

                    {enabling ? (
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
                              <code className="max-w-[200px] break-all rounded-control border border-line bg-panel px-3 py-2 font-mono text-sm tracking-wider">
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
                    ) : (
                      <p className="text-[15px]">{t("security.disable_text")}</p>
                    )}

                    <TextField
                      label={t(enabling ? "twofactor.code" : "security.code_or_recovery")}
                      value={code}
                      // Yoqishda faqat ilovadagi 6 raqam; o'chirishda zaxira kod ("abcd-efgh") ham bo'ladi
                      onChange={(value) => setCode(enabling ? value.replace(/\D/g, "").slice(0, 6) : value)}
                      inputMode={enabling ? "numeric" : "text"}
                      autoComplete="one-time-code"
                      placeholder={enabling ? "000000" : "000000 / abcd-efgh"}
                      autoFocus
                    />
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="submit"
                        loading={busy}
                        disabled={enabling && !setup}
                        variant={enabling ? "primary" : "danger"}
                      >
                        {t(enabling ? "twofactor.submit_setup" : "security.disable_yes")}
                      </Button>
                      <Button type="button" variant="ghost" disabled={busy} onClick={close}>
                        {t(enabling ? "common.cancel" : "common.keep")}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )
          )}
        </Card>
      </div>
    </div>
  );
}
