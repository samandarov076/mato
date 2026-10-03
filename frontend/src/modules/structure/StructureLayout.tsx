import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, Store, TabletSmartphone, Users, Warehouse } from "lucide-react";
import { PageTitle } from "@/shared/ui/PageTitle";
import { tabClass, tabsNav } from "@/shared/ui/tabs";

const TABS = [
  { to: "/structure", key: "structure.tab_stores", end: true, icon: Store },
  { to: "/structure/warehouses", key: "structure.tab_warehouses", end: false, icon: Warehouse },
  { to: "/structure/staff", key: "structure.tab_staff", end: false, icon: Users },
  { to: "/structure/devices", key: "structure.tab_devices", end: false, icon: TabletSmartphone },
];

/** "Tuzilma" bo'limi: do'konlar, skladlar, xodimlar, do'kon qurilmalari (faqat biznes egasi). */
export function StructureLayout() {
  const { t } = useTranslation();
  return (
    <div>
      <PageTitle icon={Building2} tone="rose">
        {t("structure.title")}
      </PageTitle>
      <nav aria-label={t("structure.title")} className={tabsNav}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => tabClass(isActive, "rose")}
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
