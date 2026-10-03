import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { ImageIcon } from "lucide-react";
import { uploadImage } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { Button } from "./Button";

const MAX_BYTES = 8 * 1024 * 1024; // serverdagi chegara bilan bir xil

/**
 * Rasm maydoni: fayl tanlanishi bilan serverga yuklanadi, forma esa faqat manzilini saqlaydi.
 * Ixtiyoriy maydon — rasm bo'lmasa ham forma saqlanadi.
 */
export function ImageField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // shu faylni qayta tanlasa ham ishlasin
    if (!file) return;
    if (file.size > MAX_BYTES) return setError(t("errors.image_too_large"));
    setError(null);
    setUploading(true);
    try {
      onChange(await uploadImage(file));
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium">{label}</p>
      <div className="flex items-center gap-4">
        {value ? (
          <img src={value} alt="" className="size-20 shrink-0 rounded-xl border border-line object-cover" />
        ) : (
          <span className="grid size-20 shrink-0 place-items-center rounded-xl border border-dashed border-line bg-page text-muted">
            <ImageIcon className="size-6" aria-hidden="true" />
          </span>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" loading={uploading} onClick={() => input.current?.click()}>
            {t(value ? "image.replace" : "image.choose")}
          </Button>
          {value && !uploading && (
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
              {t("image.remove")}
            </Button>
          )}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          aria-label={label}
          onChange={pick}
        />
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-madder">
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-muted">{t("image.hint")}</p>
      )}
    </div>
  );
}
