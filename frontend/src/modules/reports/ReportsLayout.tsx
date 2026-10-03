import { useState } from "react";
import { NavLink, Outlet, useLocation, useOutletContext } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { Fabric } from "@/modules/catalog/types";
import { catalogKeys } from "@/modules/catalog/types";
import { api } from "@/shared/api/client";
import { Card } from "@/shared/ui/Card";
import { SelectField, TextField } from "@/shared/ui/fields";
import { defaultFilters, presetRange, PRESETS, type Filters, type Preset } from "./types";
import { ChartColumn, Clock, HandCoins, Layers, type LucideIcon, Ruler, Tag, TrendingUp, Trophy } from "lucide-react";
import { PageTitle } from "@/shared/ui/PageTitle";
import { tabClass, tabsNav } from "@/shared/ui/tabs";

// Varaqlar va har birida ishlaydigan filtrlar ("Qoldiq" — hozirgi holat, davrga bog'liq emas)
const TABS: { to: string; key: string; icon: LucideIcon; filters: ("period" | "store" | "seller" | "fabric")[] }[] = [
  { to: "/reports", key: "sales", icon: TrendingUp, filters: ["period", "store", "seller", "fabric"] },
  { to: "/reports/hours", key: "hours", icon: Clock, filters: ["period", "store", "seller", "fabric"] },
  { to: "/reports/top", key: "top", icon: Trophy, filters: ["period", "store", "seller", "fabric"] },
  { to: "/reports/stock", key: "stock", icon: Layers, filters: [] },
  { to: "/reports/credit", key: "credit", icon: HandCoins, filters: ["period", "store"] },
  { to: "/reports/price-deviation", key: "deviation", icon: Tag, filters: ["period", "store", "seller", "fabric"] },
];

/** Hisobot sahifalari filtrni shu yerdan oladi — varaq almashsa ham davr va do'kon saqlanadi. */
export function useReportFilters(): Filters {
  return useOutletContext<Filters>();
}

/** "Hisobotlar" bo'limi: varaqlar va umumiy filtrlar (davr, do'kon, sotuvchi, mato). */
export function ReportsLayout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const active = [...TABS].reverse().find((tab) => pathname.startsWith(tab.to)) ?? TABS[0];
  const has = (name: (typeof active.filters)[number]) => active.filters.includes(name);

  const stores = useQuery({
    queryKey: ["locations", "stores", "all"],
    queryFn: () => api<{ id: number; name: string }[]>("/locations?type=store&include_inactive=true"),
  });
  const staff = useQuery({
    queryKey: ["users"],
    queryFn: () => api<{ id: number; full_name: string; role: string }[]>("/users"),
  });
  const fabrics = useQuery({
    queryKey: catalogKeys.fabrics,
    queryFn: () => api<Fabric[]>("/catalog/fabrics?include_inactive=true"),
  });

  function choosePreset(preset: Preset) {
    if (preset === "custom") return setFilters({ ...filters, preset });
    const [date_from, date_to] = presetRange(preset);
    setFilters({ ...filters, preset, date_from, date_to });
  }
  const set = (key: keyof Filters) => (value: string) => setFilters({ ...filters, [key]: value });

  return (
    <div>
      <PageTitle icon={ChartColumn} tone="coral">
        {t("nav.reports")}
      </PageTitle>
      <nav aria-label={t("nav.reports")} className={tabsNav}>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === "/reports"}
            className={({ isActive }) => tabClass(isActive, "coral")}
          >
            <tab.icon className="size-4" aria-hidden="true" />
            {t(`reports.tabs.${tab.key}`)}
          </NavLink>
        ))}
        {/* Metr farqi hisoboti "Ombor" bo'limida turadi — shu yerdan ham ochiladi */}
        <NavLink
          to="/differences"
          className={tabClass(false)}
        >
          <Ruler className="size-4" aria-hidden="true" />
          {t("inventory.tab_differences")}
        </NavLink>
      </nav>

      {active.filters.length > 0 && (
        <Card className="mt-6">
          {/* Telefonda bittadan, 16px oraliq — boshqa filtr kartochkalari bilan bir xil */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              label={t("reports.period")}
              value={filters.preset}
              onChange={(value) => choosePreset(value as Preset)}
            >
              {PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {t(`reports.presets.${preset}`)}
                </option>
              ))}
            </SelectField>
            {has("store") && (
              <SelectField label={t("sales.store")} value={filters.store_id} onChange={set("store_id")}>
                <option value="">{t("common.all")}</option>
                {stores.data?.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </SelectField>
            )}
            {has("seller") && (
              <SelectField label={t("sales.list.seller")} value={filters.seller_id} onChange={set("seller_id")}>
                <option value="">{t("common.all")}</option>
                {staff.data
                  ?.filter((person) => person.role !== "warehouse")
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
              </SelectField>
            )}
            {has("fabric") && (
              <SelectField label={t("catalog.sku.fabric")} value={filters.fabric_id} onChange={set("fabric_id")}>
                <option value="">{t("common.all")}</option>
                {fabrics.data?.map((fabric) => (
                  <option key={fabric.id} value={fabric.id}>
                    {fabric.code} · {fabric.name}
                  </option>
                ))}
              </SelectField>
            )}
          </div>
          {filters.preset === "custom" && (
            <div className="mt-4 grid max-w-md gap-4 sm:grid-cols-2">
              <TextField
                type="date"
                label={t("audit.filters.from")}
                value={filters.date_from}
                max={filters.date_to}
                onChange={(value) => value && setFilters({ ...filters, date_from: value })}
              />
              <TextField
                type="date"
                label={t("audit.filters.to")}
                value={filters.date_to}
                min={filters.date_from}
                onChange={(value) => value && setFilters({ ...filters, date_to: value })}
              />
            </div>
          )}
        </Card>
      )}

      <div className="mt-6">
        <Outlet context={filters} />
      </div>
    </div>
  );
}
