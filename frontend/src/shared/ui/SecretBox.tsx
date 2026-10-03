import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy } from "lucide-react";
import { feedback } from "@/shared/feedback";

/** Maxfiy qiymat (parol, PIN, vaqtinchalik parol): katta, aniq shriftda, nusxa olish tugmasi bilan. */
export function SecretBox({ value }: { value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy(event: MouseEvent) {
    try {
      await navigator.clipboard.writeText(value);
      feedback("select", event);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* brauzer ruxsat bermadi — qiymat ekranda turibdi, qo'lda ko'chirish mumkin */
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-control border border-edge bg-page px-4 py-3">
      <code className="min-w-0 flex-1 break-all font-mono text-xl font-semibold tracking-wider">
        {value}
      </code>
      <button
        type="button"
        onClick={(event) => void copy(event)}
        className="pressable inline-flex h-9 shrink-0 items-center gap-1.5 rounded-control border border-line bg-panel px-3 text-sm font-medium hover:bg-indigo-soft [@media(pointer:coarse)]:h-11"
      >
        {copied ? (
          <Check className="size-4 text-leaf" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
        {t(copied ? "twofactor.copied" : "twofactor.copy")}
      </button>
      {/* Ekran o'quvchi uchun: "nusxa olindi" aytiladi */}
      <span role="status" className="sr-only">
        {copied ? t("twofactor.copied") : ""}
      </span>
    </div>
  );
}
