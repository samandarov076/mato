import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Barcode, Flower2, Palette, Scroll, Tags } from "lucide-react";
import { PageTitle } from "@/shared/ui/PageTitle";
import { tabClass, tabsNav } from "@/shared/ui/tabs";

const TABS = [
  { to: "/catalog", key: "catalog.tab_fabrics", end: true, icon: Scroll },
  { to: "/catalog/colors", key: "catalog.tab_colors", end: false, icon: Palette },
  { to: "/catalog/patterns", key: "catalog.tab_patterns", end: false, icon: Flower2 },
  { to: "/catalog/skus", key: "catalog.tab_skus", end: false, icon: Barcode },
];

/** "Katalog" bo'limi: matolar, ranglar, gullar va SKU (biznes egasi va omborchi). */
export function CatalogLayout() {
  const { t } = useTranslation();
  return (
    <div>
      <PageTitle icon={Tags} tone="plum">
        {t("catalog.title")}
      </PageTitle>
      <nav aria-label={t("catalog.title")} className={tabsNav}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => tabClass(isActive, "plum")}
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
