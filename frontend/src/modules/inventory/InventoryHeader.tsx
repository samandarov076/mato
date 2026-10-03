import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "@/modules/auth/AuthProvider";
import { ArrowLeftRight, Layers, PackagePlus, Ruler, Warehouse } from "lucide-react";
import { PageTitle } from "@/shared/ui/PageTitle";
import { tabClass, tabsNav } from "@/shared/ui/tabs";

const TABS = [
  { to: "/stock", key: "inventory.tab_stock", icon: Layers },
  { to: "/receiving", key: "receiving.title", icon: PackagePlus },
  { to: "/transfers", key: "inventory.tab_transfers", icon: ArrowLeftRight },
  { to: "/differences", key: "inventory.tab_differences", icon: Ruler },
];

/**
 * Ombor sahifalarining sarlavhasi. Biznes egasida bu — bitta "Ombor" bo'limi va uning varaqlari
 * (Qoldiq · Kirimlar · Ko'chirishlar · Metr farqi). Omborchi va sotuvchida har sahifa menyuda alohida
 * turadi, shuning uchun ularga sahifaning o'z nomi ko'rsatiladi.
 */
export function InventoryHeader({ title, action }: { title: string; action?: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const owner = user.role === "owner";
  return (
    <div>
      <PageTitle icon={Warehouse} tone="sky" action={action}>
        {owner ? t("nav.inventory") : title}
      </PageTitle>
      {owner && (
        <nav aria-label={t("nav.inventory")} className={tabsNav}>
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) => tabClass(isActive, "sky")}
            >
              <tab.icon className="size-4" aria-hidden="true" />
              {t(tab.key)}
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
