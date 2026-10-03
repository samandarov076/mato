import { useTranslation } from "react-i18next";
import { ChevronDown, Globe } from "lucide-react";
import type { Language } from "@/shared/api/client";
import { loadLanguage } from "@/shared/i18n";
import { focusRing } from "./tones";

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: "uz", label: "O'zbekcha" },
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
];

type Props = {
  /** Berilmasa — joriy interfeys tili */
  value?: Language;
  /** Berilmasa — til faqat shu qurilmada almashadi (kirish sahifasi) */
  onChange?: (language: Language) => void;
  disabled?: boolean;
  className?: string;
};

export function LanguageSelect({ value, onChange, disabled, className = "" }: Props) {
  const { t, i18n } = useTranslation();
  const current = value ?? (i18n.resolvedLanguage as Language) ?? "uz";
  return (
    <label className={`relative inline-flex items-center ${className}`}>
      <Globe className="pointer-events-none absolute left-3 size-4 text-muted" aria-hidden="true" />
      <select
        aria-label={t("language")}
        value={current}
        disabled={disabled}
        onChange={(e) => {
          const language = e.target.value as Language;
          void loadLanguage(language).then(() => {
            if (onChange) onChange(language);
            else void i18n.changeLanguage(language);
          });
        }}
        className={`h-10 w-full cursor-pointer appearance-none rounded-control border border-edge bg-panel pl-9 pr-9 text-sm text-ink transition-colors hover:border-muted disabled:cursor-wait disabled:opacity-60 ${focusRing}`}
      >
        {LANGUAGES.map((l) => (
          <option key={l.value} value={l.value} lang={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 size-4 text-muted" aria-hidden="true" />
    </label>
  );
}
