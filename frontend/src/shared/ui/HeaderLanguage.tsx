import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";
import { useAuth } from "@/modules/auth/AuthProvider";
import { patch, type Language } from "@/shared/api/client";
import { feedback } from "@/shared/feedback";
import { loadLanguage } from "@/shared/i18n";
import { LANGUAGES } from "./LanguageSelect";
import { focusWithinRing } from "./tones";

/**
 * Yuqori paneldagi ixcham til tanlovi (kirgandan keyin ham doim qo'l ostida). Til darhol almashadi va
 * xodimning hisobiga saqlanadi — boshqa qurilmada ham shu tilda ochiladi.
 */
export function HeaderLanguage() {
  const { t, i18n } = useTranslation();
  const { user, updateUser } = useAuth();
  const current = ((i18n.resolvedLanguage ?? "uz") as Language) || "uz";

  async function change(language: Language) {
    feedback("tick");
    await loadLanguage(language);
    void i18n.changeLanguage(language);
    if (!user) return;
    updateUser({ language });
    try {
      await patch("/auth/me", { language });
    } catch {
      /* saqlanmadi — til shu qurilmada baribir almashdi */
    }
  }

  return (
    <label
      className={`relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-[13px] font-semibold text-muted transition-colors hover:bg-indigo-soft hover:text-ink ${focusWithinRing}`}
    >
      <Globe className="size-[18px]" aria-hidden="true" />
      <span aria-hidden="true" className="uppercase">
        {current}
      </span>
      <select
        aria-label={t("language")}
        value={current}
        onChange={(event) => void change(event.target.value as Language)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {LANGUAGES.map((language) => (
          <option key={language.value} value={language.value} lang={language.value}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  );
}
