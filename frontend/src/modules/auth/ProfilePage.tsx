import { useState } from "react";
import { useTranslation } from "react-i18next";
import { TelegramCard } from "@/modules/telegram/TelegramCard";
import { patch, type Language, type User } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { Card } from "@/shared/ui/Card";
import { Alert } from "@/shared/ui/feedback";
import { formatPhone } from "@/shared/ui/fields";
import { LanguageSelect } from "@/shared/ui/LanguageSelect";
import { useAuth, useCurrentUser } from "./AuthProvider";
import { PasswordForm } from "./PasswordForm";
import { BadgeCheck, Building2, Globe, LockKeyhole, type LucideIcon, Phone, UserRound, Vibrate, Volume2 } from "lucide-react";
import { PageTitle } from "@/shared/ui/PageTitle";
import { Avatar } from "@/shared/ui/Avatar";
import { Chip } from "@/shared/ui/list";
import { setFeedbackPrefs, useFeedbackPrefs } from "@/shared/feedback";
import { Toggle } from "@/shared/ui/controls";
import { IconChip } from "@/shared/ui/list";

/** Tovush va tebranish — qurilma sozlamasi (hisobga emas): umumiy planshetda hamma uchun bir xil. */
function FeedbackCard() {
  const { t } = useTranslation();
  const prefs = useFeedbackPrefs();
  const rows: { key: "sound" | "haptics"; icon: LucideIcon; hint: string }[] = [
    { key: "sound", icon: Volume2, hint: t("feedback.sound_hint") },
    { key: "haptics", icon: Vibrate, hint: t("feedback.haptics_hint") },
  ];
  return (
    <Card title={t("feedback.title")} icon={Volume2} tone="plum">
      <div className="divide-y divide-line">
        {rows.map(({ key, icon, hint }) => (
          <div key={key} className="flex items-center gap-3.5 py-3 first:pt-0 last:pb-0">
            <IconChip icon={icon} tone="plum" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t(`feedback.${key}`)}</p>
              <p className="text-sm text-muted">{hint}</p>
            </div>
            <Toggle checked={prefs[key]} onChange={(on) => setFeedbackPrefs({ [key]: on })} label={t(`feedback.${key}`)} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Lavozim nomi uchun tarjima kaliti: asosiy ega va sherik-ega farqlanadi. */
export function roleKey(user: User): string {
  if (user.role === "owner") return user.is_primary_owner ? "roles.owner_primary" : "roles.owner";
  return `roles.${user.role}`;
}

export function ProfilePage() {
  const { t } = useTranslation();
  const { updateUser } = useAuth();
  const { user, business } = useCurrentUser();
  const errorText = useErrorText();
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [languageSaved, setLanguageSaved] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);

  async function changeLanguage(language: Language) {
    setSavingLanguage(true);
    setLanguageSaved(false);
    setLanguageError(null);
    try {
      const saved = await patch<User>("/auth/me", { language });
      updateUser({ language: saved.language }); // interfeys shu zahoti yangi tilga o'tadi
      setLanguageSaved(true);
    } catch (error) {
      setLanguageError(errorText(error));
    } finally {
      setSavingLanguage(false);
    }
  }

  const rows: [LucideIcon, string, string][] = [
    [UserRound, t("profile.name"), user.full_name],
    [Phone, t("profile.phone"), user.phone ? `+998 ${formatPhone(user.phone.slice(4))}` : "—"],
    [BadgeCheck, t("profile.role"), t(roleKey(user))],
    [Building2, t("profile.business"), business?.name ?? "—"],
  ];

  return (
    <div>
      <PageTitle icon={UserRound} tone="indigo">
        {t("profile.title")}
      </PageTitle>

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            {/* Kim kirgani bir qarashda: bosh harflar, ism va lavozim */}
            <div className="flex items-center gap-4">
              <Avatar name={user.full_name} size="lg" />
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold leading-6">{user.full_name}</h2>
                <p className="mt-1">
                  <Chip tone="indigo">{t(roleKey(user))}</Chip>
                </p>
              </div>
            </div>
            <dl className="mt-5 divide-y divide-line border-t border-line">
              {rows.map(([Icon, label, value]) => (
                <div key={label} className="flex items-center justify-between gap-6 py-3">
                  <dt className="flex shrink-0 items-center gap-2.5 text-sm text-muted">
                    <Icon className="size-4" aria-hidden="true" />
                    {label}
                  </dt>
                  <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-muted">{t("profile.readonly_note")}</p>
          </Card>

          <Card title={t("profile.language_title")} icon={Globe} tone="sky">
            <LanguageSelect
              value={user.language}
              onChange={changeLanguage}
              disabled={savingLanguage}
              className="w-full sm:w-64"
            />
            <p className="mt-2 text-sm text-muted">{t("profile.language_hint")}</p>
            {languageSaved && (
              <div className="mt-3">
                <Alert tone="success">{t("profile.language_saved")}</Alert>
              </div>
            )}
            {languageError && (
              <div className="mt-3">
                <Alert>{languageError}</Alert>
              </div>
            )}
          </Card>

          <FeedbackCard />

          {/* Telegram'ni faqat biznes egalari ulaydi (xabarlar va kunlik xulosa ularga boradi) */}
          {user.role === "owner" && <TelegramCard />}
        </div>

        <Card title={t("profile.password_title")} icon={LockKeyhole} tone="saffron">
          {passwordChanged && (
            <div className="mb-5">
              <Alert tone="success">{t("password.changed")}</Alert>
            </div>
          )}
          <PasswordForm
            currentLabel={t("password.current")}
            submitLabel={t("password.change")}
            onChanged={() => setPasswordChanged(true)}
          />
        </Card>
      </div>
    </div>
  );
}
