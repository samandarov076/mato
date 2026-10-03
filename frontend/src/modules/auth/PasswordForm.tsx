import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { Button } from "@/shared/ui/Button";
import { Alert } from "@/shared/ui/feedback";
import { PasswordField } from "@/shared/ui/fields";

const MIN_LENGTH = 6;

type Errors = { current?: string; next?: string; repeat?: string; form?: string };

type Props = {
  /** Birinchi maydon nomi: profilda "Hozirgi parol", birinchi kirishda "Vaqtinchalik parol" */
  currentLabel: string;
  submitLabel: string;
  onChanged: () => void;
};

/** Parolni almashtirish formasi — profilda va birinchi kirishda bir xil ishlaydi. */
export function PasswordForm({ currentLabel, submitLabel, onChanged }: Props) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Errors = {};
    if (!current) found.current = t("password.required");
    if (next.length < MIN_LENGTH) found.next = t("password.too_short");
    else if (next !== repeat) found.repeat = t("password.mismatch");
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // Xato maydon ostida chiqadi (Alert yo'q) — tovush va tebranish bilan sezdiriladi
      feedback("error");
      return;
    }

    setLoading(true);
    try {
      await post("/auth/me/password", { old_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setRepeat("");
      onChanged();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      if (code === "wrong_password") setErrors({ current: errorText(error) });
      else if (code === "same_password") setErrors({ next: errorText(error) });
      else if (code === "validation_error") setErrors({ next: t("password.too_short") });
      else setErrors({ form: errorText(error) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {errors.form && <Alert focus>{errors.form}</Alert>}
      <PasswordField
        label={currentLabel}
        value={current}
        onChange={setCurrent}
        error={errors.current}
        autoComplete="current-password"
      />
      <PasswordField
        label={t("password.new")}
        value={next}
        onChange={setNext}
        error={errors.next}
        hint={t("password.new_hint")}
        autoComplete="new-password"
      />
      <PasswordField
        label={t("password.repeat")}
        value={repeat}
        onChange={setRepeat}
        error={errors.repeat}
        autoComplete="new-password"
      />
      <Button type="submit" loading={loading}>
        {submitLabel}
      </Button>
    </form>
  );
}
