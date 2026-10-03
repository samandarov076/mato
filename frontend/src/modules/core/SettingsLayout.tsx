import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { History, Settings, SlidersHorizontal } from "lucide-react";
import { PageTitle } from "@/shared/ui/PageTitle";
import { tabClass, tabsNav } from "@/shared/ui/tabs";

const TABS = [
  { to: "/settings", key: "settings.tab_business", end: true, icon: SlidersHorizontal },
  { to: "/settings/journal", key: "settings.tab_journal", end: false, icon: History },
];

/** "Sozlamalar" bo'limi: biznes sozlamalari va harakatlar jurnali (faqat biznes egasi). */
export function SettingsLayout() {
  const { t } = useTranslation();
  return (
    <div>
      <PageTitle icon={Settings} tone="neutral">
        {t("settings.title")}
      </PageTitle>
      <nav aria-label={t("settings.title")} className={tabsNav}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => tabClass(isActive, "indigo")}
          >
            <tab.icon className="size-4" aria-hidden="true" />
            {t(tab.key)}
          </NavLink>
        ))}
      </nav>
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}
