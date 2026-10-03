import { useTranslation } from "react-i18next";
import { LogOut } from "lucide-react";
import { Logo, Selvedge } from "@/shared/ui/brand";
import { HeaderControls } from "@/shared/ui/HeaderControls";
import { useDocumentTitle } from "@/shared/ui/PageTitle";
import { focusRing } from "@/shared/ui/tones";
import { useAuth } from "./AuthProvider";
import { PasswordForm } from "./PasswordForm";

/** Birinchi kirish: vaqtinchalik parol almashtirilmaguncha tizimda ishlab bo'lmaydi. */
export function ChangePasswordPage() {
  const { t } = useTranslation();
  const { logout, updateUser } = useAuth();
  useDocumentTitle(t("password.first_title"));

  return (
    <div className="flex min-h-dvh flex-col">
      <Selvedge />
      <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <Logo compact />
        <div className="flex items-center gap-1 sm:gap-2">
          <HeaderControls />
          {/* Telefonda joy tor — faqat belgi (nomi aria-label'da) */}
          <button
            type="button"
            onClick={() => void logout()}
            aria-label={t("nav.logout")}
            className={`inline-flex h-10 items-center gap-2 rounded-control px-3 text-sm text-muted transition-colors hover:bg-indigo-soft hover:text-ink active:bg-indigo-soft [@media(pointer:coarse)]:h-11 ${focusRing}`}
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t("nav.logout")}</span>
          </button>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-[440px] rounded-card border border-line bg-panel p-6 shadow-card sm:p-8">
          {/* Kirish ekranlari bilan bir xil sarlavha o'lchami (28px) */}
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{t("password.first_title")}</h1>
          <p className="mb-7 mt-2 text-muted">{t("password.first_text")}</p>
          <PasswordForm
            currentLabel={t("password.temporary")}
            submitLabel={t("password.save")}
            onChanged={() => updateUser({ must_change_password: false })}
          />
        </div>
      </main>
    </div>
  );
}
