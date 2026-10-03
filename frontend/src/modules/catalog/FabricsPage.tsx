import { memo, useCallback, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Barcode, Pencil, Plus, Power, RotateCcw, Scroll } from "lucide-react";
import { ApiError, api, patch, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { trimDecimal } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Alert, Loading } from "@/shared/ui/feedback";
import { TextField } from "@/shared/ui/fields";
import { ImageField } from "@/shared/ui/ImageField";
import { InactiveChip, SearchInput, ShowInactive, Thumb } from "./parts";
import { catalogKeys, parseDecimal, similarCodes, type Fabric } from "./types";
import { Empty, RowAction, actionClass, rowClass } from "@/shared/ui/list";
import { Hint } from "@/shared/ui/Hint";

type Form = {
  id: number | null; // null — yangi mato
  code: string;
  name: string;
  width: string;
  composition: string;
  coefficient: string;
  imageUrl: string | null;
};

type Errors = Partial<Record<"code" | "name" | "width" | "coefficient" | "form", string>>;

const EMPTY: Form = { id: null, code: "", name: "", width: "", composition: "", coefficient: "", imageUrl: null };

/** Matolar: kod, nom, eni, tarkibi, rasm va standart koeffitsient (1 kg = X metr). */
export function FabricsPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();

  const fabrics = useQuery({
    queryKey: catalogKeys.fabrics,
    queryFn: () => api<Fabric[]>("/catalog/fabrics?include_inactive=true"),
  });

  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  // Qidiruv maydoni o'zi 300 ms kutadi — bu yerda faqat tingan matn turadi
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<number | null>(null);
  // Forma ro'yxat tepasida — "Tahrirlash" bosilganda u ko'rinadigan joyga suriladi
  const formRef = useRef<HTMLDivElement>(null);

  const reload = () => queryClient.invalidateQueries({ queryKey: catalogKeys.all });

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    if (form) setForm({ ...form, [key]: value });
  }

  const open = useCallback((row: Fabric | null) => {
    setErrors({});
    setForm(
      row
        ? {
            id: row.id,
            code: row.code,
            name: row.name,
            width: row.width_cm === null ? "" : String(row.width_cm),
            composition: row.composition ?? "",
            coefficient: row.default_m_per_kg === null ? "" : trimDecimal(row.default_m_per_kg),
            imageUrl: row.image_url,
          }
        : EMPTY,
    );
    requestAnimationFrame(() => formRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const width = form.width.trim();
    const coefficient = form.coefficient.trim() === "" ? null : parseDecimal(form.coefficient, 4);
    const found: Errors = {};
    if (form.code.trim() === "") found.code = t("catalog.code_required");
    if (form.name.trim().length < 2) found.name = t("common.too_short");
    if (width !== "" && !(/^\d{1,4}$/.test(width) && Number(width) > 0 && Number(width) <= 1000)) {
      found.width = t("catalog.fabric.width_invalid");
    }
    if (form.coefficient.trim() !== "" && coefficient === null) {
      found.coefficient = t("catalog.fabric.coefficient_invalid");
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      feedback("error");
      return;
    }

    const body = {
      code: form.code.trim(),
      name: form.name.trim(),
      width_cm: width === "" ? null : Number(width),
      composition: form.composition.trim() || null,
      default_m_per_kg: coefficient,
      image_url: form.imageUrl,
    };
    setSaving(true);
    try {
      if (form.id === null) await post("/catalog/fabrics", body);
      else await patch(`/catalog/fabrics/${form.id}`, body);
      setForm(null);
      await reload();
    } catch (error) {
      if (error instanceof ApiError && error.code === "code_taken") {
        setErrors({ code: errorText(error) });
      } else {
        setErrors({ form: errorText(error) });
      }
    } finally {
      setSaving(false);
    }
  }

  const setActive = useCallback(
    async (row: Fabric, active: boolean) => {
      setRowError(null);
      setToggling(row.id);
      try {
        await post(`/catalog/fabrics/${row.id}/${active ? "activate" : "deactivate"}`);
        // Faolsizlantirilgan qator ko'zdan yo'qolmasin — yonida "qayta faollashtirish" turadi
        if (!active) setShowInactive(true);
        await queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      } catch (error) {
        setRowError(errorText(error));
      } finally {
        setToggling(null);
      }
    },
    [queryClient, errorText],
  );

  const needle = search.trim().toLowerCase();
  const rows = (fabrics.data ?? []).filter(
    (row) =>
      (showInactive || row.is_active) &&
      (needle === "" || row.code.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle)),
  );
  const similar = form ? similarCodes(form.code, fabrics.data ?? [], form.id) : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hint id="fabrics">{t("catalog.fabric.intro")}</Hint>
        {form === null && (
          <Button onClick={() => open(null)}>
            <Plus className="size-[18px]" aria-hidden="true" />
            {t("catalog.fabric.add")}
          </Button>
        )}
      </div>

      {form && (
        <div ref={formRef} className="mt-4 max-w-xl scroll-mt-4">
          <Card
            title={t(form.id === null ? "catalog.fabric.add" : "catalog.fabric.edit")}
            icon={Scroll}
            tone="plum"
          >
            <form onSubmit={save} noValidate className="space-y-5">
              {errors.form && <Alert focus>{errors.form}</Alert>}
              <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <TextField
                  label={t("catalog.fabric.code")}
                  value={form.code}
                  onChange={(v) => set("code", v)}
                  error={errors.code}
                  maxLength={30}
                  autoComplete="off"
                  autoFocus
                />
                <TextField
                  label={t("catalog.name")}
                  value={form.name}
                  onChange={(v) => set("name", v)}
                  error={errors.name}
                  maxLength={100}
                />
              </div>
              {similar.length > 0 && !errors.code && (
                <p className="rounded-control bg-saffron-soft px-3.5 py-2.5 text-sm text-saffron">
                  {t("catalog.similar_codes", {
                    codes: similar.map((row) => `${row.code} (${row.name})`).join(", "),
                  })}
                </p>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField
                  label={t("catalog.fabric.width")}
                  value={form.width}
                  onChange={(v) => set("width", v.replace(/\D/g, "").slice(0, 4))}
                  error={errors.width}
                  hint={t("common.optional")}
                  inputMode="numeric"
                />
                <TextField
                  label={t("catalog.fabric.coefficient")}
                  value={form.coefficient}
                  onChange={(v) => set("coefficient", v)}
                  error={errors.coefficient}
                  hint={t("catalog.fabric.coefficient_hint")}
                  inputMode="decimal"
                  placeholder="3.25"
                />
              </div>
              <TextField
                label={t("catalog.fabric.composition")}
                value={form.composition}
                onChange={(v) => set("composition", v)}
                hint={t("common.optional")}
                placeholder={t("catalog.fabric.composition_placeholder")}
                maxLength={200}
              />
              <ImageField label={t("image.label")} value={form.imageUrl} onChange={(url) => set("imageUrl", url)} />
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={saving}>
                  {t("common.save")}
                </Button>
                <Button variant="secondary" onClick={() => setForm(null)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <SearchInput value={search} onChange={setSearch} label={t("catalog.search")} />
        <ShowInactive checked={showInactive} onChange={setShowInactive} />
      </div>
      {rowError && (
        <div className="mt-3">
          <Alert focus>{rowError}</Alert>
        </div>
      )}

      <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel shadow-card">
        {fabrics.isLoading && <Loading className="px-5 py-6" />}
        {fabrics.isError && (
          <div className="p-5">
            <Alert>{errorText(fabrics.error)}</Alert>
          </div>
        )}
        {fabrics.isSuccess && rows.length === 0 && (
          <Empty icon={Scroll} tone="plum">
            {t(fabrics.data.length === 0 ? "catalog.fabric.empty" : "catalog.nothing_found")}
          </Empty>
        )}
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <FabricRow key={row.id} row={row} busy={toggling === row.id} onEdit={open} onToggle={setActive} />
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Mato qatori. memo: qidiruv yoki bitta qator o'zgarganda qolganlari qayta chizilmaydi. */
const FabricRow = memo(function FabricRow({
  row,
  busy,
  onEdit,
  onToggle,
}: {
  row: Fabric;
  busy: boolean;
  onEdit: (row: Fabric) => void;
  onToggle: (row: Fabric, active: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <li className={`${rowClass} flex flex-wrap items-center gap-x-4 gap-y-3 ${row.is_active ? "" : "bg-page/60"}`}>
      <Thumb imageUrl={row.image_url} code={row.code} size="lg" />
      <div className="min-w-0 flex-1 basis-60">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className={`font-medium ${row.is_active ? "" : "text-muted"}`}>
            {row.code}
            <span className="ml-2 font-normal">{row.name}</span>
          </p>
          {!row.is_active && <InactiveChip />}
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {[
            row.width_cm !== null && t("catalog.fabric.width_value", { value: row.width_cm }),
            row.composition,
            row.default_m_per_kg !== null &&
              t("catalog.fabric.coefficient_value", { value: trimDecimal(row.default_m_per_kg) }),
            t("catalog.sku_count", { count: row.sku_count }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to={`/catalog/skus?fabric_id=${row.id}`} className={actionClass()}>
          <Barcode className="size-3.5" aria-hidden="true" />
          {t("catalog.fabric.skus")}
        </Link>
        <RowAction icon={Pencil} onClick={() => onEdit(row)}>
          {t("common.edit")}
        </RowAction>
        <RowAction
          icon={row.is_active ? Power : RotateCcw}
          tone={row.is_active ? "danger" : "success"}
          disabled={busy}
          onClick={() => void onToggle(row, !row.is_active)}
        >
          {t(row.is_active ? "common.deactivate" : "common.activate")}
        </RowAction>
      </div>
    </li>
  );
});
