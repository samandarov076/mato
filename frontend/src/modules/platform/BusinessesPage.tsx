import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Building2, Plus } from "lucide-react";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDate, formatDateTime } from "@/shared/format";
import { Avatar } from "@/shared/ui/Avatar";
import { ButtonLink } from "@/shared/ui/Button";
import { Segmented } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { SelectField, TextField } from "@/shared/ui/fields";
import { formatPhoneFull, StatusChip, type BusinessRow } from "./parts";
import { PageTitle } from "@/shared/ui/PageTitle";
import { Empty, rowClass, sectionStrip } from "@/shared/ui/list";
import { focusRing } from "@/shared/ui/tones";

type StatusFilter = "" | "active" | "blocked";

const COLUMNS = "md:grid-cols-[2fr_1.6fr_92px_92px_120px_110px_150px]";

/** Platforma egasining bosh sahifasi: barcha bizneslar. */
export function BusinessesPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState(""); // yozish to'xtagach yuboriladigan qidiruv matni
  const [status, setStatus] = useState<StatusFilter>("");
  const [sort, setSort] = useState("created_at");

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const businesses = useQuery({
    queryKey: ["platform", "businesses", query, status, sort],
    queryFn: () => {
      const params = new URLSearchParams({ sort });
      if (query) params.set("search", query);
      if (status) params.set("status", status);
      return api<BusinessRow[]>(`/platform/businesses?${params}`);
    },
    placeholderData: (previous) => previous, // qidiruv paytida ro'yxat "lip" etib yo'qolmasin
  });

  return (
    <div>
      <PageTitle
        icon={Building2}
        tone="indigo"
        action={
          <ButtonLink to="/businesses/new">
            <Plus className="size-[18px]" aria-hidden="true" />
            {t("platform.add")}
          </ButtonLink>
        }
      >
        {t("platform.businesses")}
      </PageTitle>

      <div className="mt-5 grid items-end gap-4 md:grid-cols-[1fr_auto_240px]">
        <TextField
          label={t("platform.search")}
          value={search}
          onChange={setSearch}
          placeholder={t("platform.search_placeholder")}
          type="search"
        />
        <Segmented<StatusFilter>
          label={t("platform.columns.status")}
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: t("platform.status.all") },
            { value: "active", label: t("platform.status.active") },
            { value: "blocked", label: t("platform.status.blocked") },
          ]}
        />
        <SelectField label={t("platform.sort")} value={sort} onChange={setSort}>
          <option value="created_at">{t("platform.sort_created")}</option>
          <option value="last_activity_at">{t("platform.sort_activity")}</option>
        </SelectField>
      </div>

      <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <div className={`${sectionStrip} hidden gap-4 md:grid ${COLUMNS}`}>
          <span>{t("platform.columns.business")}</span>
          <span>{t("platform.columns.owner")}</span>
          <span className="text-right">{t("platform.columns.stores")}</span>
          <span className="text-right">{t("platform.columns.staff")}</span>
          <span>{t("platform.columns.status")}</span>
          <span>{t("platform.columns.created")}</span>
          <span>{t("platform.columns.activity")}</span>
        </div>

        {businesses.isLoading && <Loading className="px-5 py-6" />}
        {businesses.isError && (
          <div className="p-5">
            <Alert>{errorText(businesses.error)}</Alert>
          </div>
        )}
        {businesses.data?.length === 0 && (
          <Empty icon={Building2} tone="indigo">
            {t("platform.empty")}
          </Empty>
        )}

        <ul className="divide-y divide-line">
          {businesses.data?.map((business) => {
            const activity = business.last_activity_at
              ? formatDateTime(business.last_activity_at)
              : t("platform.no_activity");
            return (
              <li key={business.id}>
                <Link
                  to={`/businesses/${business.id}`}
                  className={`${rowClass} pressable block transition-colors hover:bg-indigo-soft/50 active:bg-indigo-soft ${focusRing}`}
                >
                  {/* Telefon: ustma-ust */}
                  <div className="md:hidden">
                    <div className="flex items-center gap-3">
                      <Avatar name={business.name} />
                      <p className="min-w-0 flex-1 font-medium">{business.name}</p>
                      <StatusChip status={business.status} />
                    </div>
                    <p className="mt-0.5 text-sm">
                      {business.owner?.full_name ?? "—"} ·{" "}
                      {formatPhoneFull(business.owner?.phone ?? null)}
                    </p>
                    <p className="mt-1 text-[13px] text-muted">
                      {t("platform.columns.stores")}: {business.stores_count} ·{" "}
                      {t("platform.columns.staff")}: {business.staff_count} ·{" "}
                      {t("platform.columns.activity")}: {activity}
                    </p>
                  </div>
                  {/* Keng ekran: ustunlar */}
                  <div className={`hidden items-center gap-4 md:grid ${COLUMNS}`}>
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar name={business.name} size="sm" />
                      <span className="min-w-0 truncate font-medium">{business.name}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate">{business.owner?.full_name ?? "—"}</span>
                      <span className="block text-[13px] text-muted">
                        {formatPhoneFull(business.owner?.phone ?? null)}
                      </span>
                    </span>
                    <span className="text-right">{business.stores_count}</span>
                    <span className="text-right">{business.staff_count}</span>
                    <span>
                      <StatusChip status={business.status} />
                    </span>
                    <span className="text-sm text-muted">{formatDate(business.created_at)}</span>
                    <span className="text-sm text-muted">{activity}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
