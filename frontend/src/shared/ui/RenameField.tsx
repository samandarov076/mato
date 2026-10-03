import { useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { Button } from "./Button";
import { Alert } from "./feedback";
import { TextField } from "./fields";
import { RowAction } from "./list";

/**
 * Nomni joyida o'zgartirish: matn + "O'zgartirish" → maydon + Saqlash / Bekor qilish.
 * Biznes nomi (sozlamalar, platforma paneli) va o'z ismi (profil) uchun — 2–100 belgi.
 */
export function RenameField({
  label,
  value,
  onSave,
  hint,
}: {
  label: string;
  value: string;
  /** Saqlash; xato bo'lsa — tashlaydi (matni maydon ustida ko'rsatiladi) */
  onSave: (name: string) => Promise<void>;
  hint?: string;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const trigger = useRef<HTMLDivElement>(null);

  function close() {
    setEditing(false);
    setError(null);
    setFormError(null);
    requestAnimationFrame(() => trigger.current?.querySelector("button")?.focus());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError(t("common.too_short"));
      feedback("error");
      return;
    }
    if (trimmed === value) return close();
    setSaving(true);
    setFormError(null);
    try {
      await onSave(trimmed);
      feedback("success");
      close();
    } catch (failure) {
      setFormError(errorText(failure));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div ref={trigger} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-sm text-muted">{label}</p>
          <p className="break-words text-[17px] font-semibold">{value}</p>
        </div>
        <RowAction
          icon={Pencil}
          onClick={() => {
            setName(value);
            setEditing(true);
          }}
        >
          {t("common.rename")}
        </RowAction>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      {formError && <Alert>{formError}</Alert>}
      <TextField
        label={label}
        value={name}
        onChange={(next) => (setName(next), setError(null))}
        error={error ?? undefined}
        hint={hint}
        maxLength={100}
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={saving}>
          {t("common.save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={close}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
