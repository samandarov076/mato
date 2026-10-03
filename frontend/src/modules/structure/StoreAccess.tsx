import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Eye, KeyRound, Pencil, X } from "lucide-react";
import { ApiError, del, post, put } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { Button } from "@/shared/ui/Button";
import { Alert, ConfirmBar } from "@/shared/ui/feedback";
import { PasswordField, TextField } from "@/shared/ui/fields";
import { actionClass, RowAction } from "@/shared/ui/list";
import { SecretBox } from "@/shared/ui/SecretBox";

// Server bilan bir xil qoida (structure/schemas.py, StoreLogin)
const LOGIN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{2,31}$/;

type Errors = { login?: string; password?: string; form?: string };

/**
 * Do'kon logini: shu login va parol bilan do'kon planshetida "Do'kon" varag'idan kiriladi — qurilma
 * ochiladi va PIN ekrani chiqadi. Biznes egasi planshetga o'z paroli bilan kirmaydi.
 */
export function StoreAccess({
  storeId,
  login,
  onChanged,
}: {
  storeId: number;
  login: string | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [mode, setMode] = useState<"idle" | "edit" | "clear">("idle");
  const [value, setValue] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null | undefined>(undefined); // undefined — ko'rsatilmagan
  const clearTrigger = useRef<HTMLButtonElement>(null);

  function startEdit() {
    setMode("edit");
    setValue(login ?? "");
    setPassword("");
    setErrors({});
    setSecret(undefined);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const found: Errors = {};
    if (!LOGIN_PATTERN.test(value.trim())) found.login = t("store_access.login_rule");
    // Login birinchi marta berilayotganda parol majburiy; o'zgartirishda bo'sh qolsa — eskisi qoladi
    if ((!login || password) && password.length < 6) found.password = t("password.too_short");
    setErrors(found);
    if (found.login || found.password) {
      feedback("error");
      return;
    }
    setBusy(true);
    try {
      await put(`/locations/${storeId}/access`, { login: value.trim(), password: password || null });
      feedback("success");
      setMode("idle");
      onChanged();
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "login_taken") {
        setErrors({ login: errorText(failure) });
      } else {
        setErrors({ form: errorText(failure) });
      }
    } finally {
      setBusy(false);
    }
  }

  async function reveal() {
    setErrors({});
    try {
      const result = await post<{ password: string | null }>(`/locations/${storeId}/access/reveal`, {});
      setSecret(result.password);
    } catch (failure) {
      setErrors({ form: errorText(failure) });
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await del(`/locations/${storeId}/access`);
      setMode("idle");
      setSecret(undefined);
      onChanged();
    } catch (failure) {
      setErrors({ form: errorText(failure) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-control border border-line bg-page/60 p-3">
      <p className="flex items-center gap-2.5 text-sm">
        <KeyRound className="size-4 shrink-0 text-muted" aria-hidden="true" />
        <span className="min-w-0">
          <span className="text-muted">{t("store_access.title")}:</span>{" "}
          {login ? <span className="font-mono font-medium">{login}</span> : t("store_access.none")}
        </span>
      </p>
      {!login && mode === "idle" && <p className="mt-1.5 text-sm text-muted">{t("store_access.hint")}</p>}

      {errors.form && (
        <div className="mt-3">
          <Alert>{errors.form}</Alert>
        </div>
      )}

      {secret !== undefined && mode === "idle" && (
        <div className="mt-3">
          {secret ? <SecretBox value={secret} /> : <p className="text-sm text-muted">{t("store_access.not_saved")}</p>}
        </div>
      )}

      {mode === "edit" ? (
        <form onSubmit={save} noValidate className="mt-3 space-y-4">
          <TextField
            label={t("store_login.login")}
            value={value}
            onChange={setValue}
            error={errors.login}
            hint={t("store_access.login_rule")}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="chorsu"
            autoFocus
          />
          <PasswordField
            label={t(login ? "store_access.new_password" : "login.password")}
            value={password}
            onChange={setPassword}
            error={errors.password}
            hint={login ? t("store_access.keep_password") : t("password.new_hint")}
            autoComplete="new-password"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={busy}>
              {t("common.save")}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setMode("idle")}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <RowAction icon={Pencil} onClick={startEdit}>
            {t(login ? "store_access.change" : "store_access.set")}
          </RowAction>
          {login && (
            <>
              <RowAction
                icon={Eye}
                onClick={() => (secret === undefined ? void reveal() : setSecret(undefined))}
                aria-expanded={secret !== undefined}
              >
                {t(secret === undefined ? "store_access.show_password" : "store_access.hide_password")}
              </RowAction>
              {/* RowAction ref bermaydi; tasdiq yopilganda fokus shu tugmaga qaytishi uchun oddiy tugma */}
              <button
                ref={clearTrigger}
                type="button"
                className={actionClass("danger")}
                disabled={mode === "clear"}
                aria-expanded={mode === "clear"}
                onClick={(event) => {
                  feedback("warning", event);
                  setMode("clear");
                }}
              >
                <X className="size-3.5 shrink-0" aria-hidden="true" />
                {t("store_access.clear")}
              </button>
            </>
          )}
        </div>
      )}

      {mode === "clear" && (
        <div className="mt-3">
          <ConfirmBar
            text={t("store_access.clear_confirm")}
            confirmLabel={t("store_access.clear_yes")}
            busy={busy}
            onConfirm={() => void clear()}
            onCancel={() => setMode("idle")}
            returnFocusTo={clearTrigger}
          />
        </div>
      )}
    </div>
  );
}
