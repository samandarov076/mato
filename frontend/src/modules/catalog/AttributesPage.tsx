import { memo, useCallback, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Flower2, Palette, Pencil, Plus, Power, RotateCcw } from "lucide-react";
import { ApiError, api, patch, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Alert, Loading } from "@/shared/ui/feedback";
import { fieldLabel, TextField } from "@/shared/ui/fields";
import { ImageField } from "@/shared/ui/ImageField";
import { InactiveChip, SearchInput, ShowInactive, Thumb, linkButton } from "./parts";
import { catalogKeys, similarCodes, type Attribute, type AttributeKind } from "./types";
import { Chip, Empty, RowAction } from "@/shared/ui/list";
import { focusWithinRing } from "@/shared/ui/tones";
import { Hint } from "@/shared/ui/Hint";

type Form = {
  id: number | null; // null — yangi
  code: string;
  name: string;
  hex: string; // "" — namuna tanlanmagan
  imageUrl: string | null;
};

type Errors = Partial<Record<"code" | "name" | "form", string>>;

const EMPTY: Form = { id: null, code: "", name: "", hex: "", imageUrl: null };

// Plitka — tileClass bilan bir xil chetlar; faolsiz plitka kulrang fonda
const tile = "flex gap-3.5 rounded-card border border-line p-4 shadow-card sm:p-5";

/** Ranglar yoki gullar ro'yxati — barcha matolar uchun umumiy. Rangda namuna (rang) ham tanlanadi. */
export function AttributesPage({ kind }: { kind: AttributeKind }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const k = (key: string) => t(`catalog.${kind}.${key}`);

  const list = useQuery({
    queryKey: catalogKeys.attributes(kind),
    queryFn: () => api<Attribute[]>(`/catalog/${kind}?include_inactive=true`),
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

  const open = useCallback((row: Attribute | null) => {
    setErrors({});
    setForm(
      row
        ? { id: row.id, code: row.code, name: row.name, hex: row.hex ?? "", imageUrl: row.image_url }
        : EMPTY,
    );
    requestAnimationFrame(() => formRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const found: Errors = {};
    if (form.code.trim() === "") found.code = t("catalog.code_required");
    if (form.name.trim().length < 2) found.name = t("common.too_short");
    setErrors(found);
    if (Object.keys(found).length > 0) {
      feedback("error");
      return;
    }

    const body = {
      code: form.code.trim(),
      name: form.name.trim(),
      hex: kind === "colors" && form.hex ? form.hex : null,
      image_url: form.imageUrl,
    };
    setSaving(true);
    try {
      if (form.id === null) await post(`/catalog/${kind}`, body);
      else await patch(`/catalog/${kind}/${form.id}`, body);
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
    async (row: Attribute, active: boolean) => {
      setRowError(null);
      setToggling(row.id);
      try {
        await post(`/catalog/${kind}/${row.id}/${active ? "activate" : "deactivate"}`);
        if (!active) setShowInactive(true); // qator yo'qolib qolmasin — qaytarish yonida turadi
        await queryClient.invalidateQueries({ queryKey: catalogKeys.all });
      } catch (error) {
        setRowError(errorText(error));
      } finally {
        setToggling(null);
      }
    },
    [kind, queryClient, errorText],
  );

  const needle = search.trim().toLowerCase();
  const rows = (list.data ?? []).filter(
    (row) =>
      (showInactive || row.is_active) &&
      (needle === "" || row.code.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle)),
  );
  const similar = form ? similarCodes(form.code, list.data ?? [], form.id) : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hint id={kind}>{k("intro")}</Hint>
        {form === null && (
          <Button onClick={() => open(null)}>
            <Plus className="size-[18px]" aria-hidden="true" />
            {k("add")}
          </Button>
        )}
      </div>

      {form && (
        <div ref={formRef} className="mt-4 max-w-xl scroll-mt-4">
          <Card
            title={form.id === null ? k("add") : k("edit")}
            icon={kind === "colors" ? Palette : Flower2}
            tone="plum"
          >
            <form onSubmit={save} noValidate className="space-y-5">
              {errors.form && <Alert focus>{errors.form}</Alert>}
              <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <TextField
                  label={t("catalog.code")}
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
              {kind === "colors" && (
                <div>
                  <p className={fieldLabel}>{t("catalog.colors.swatch")}</p>
                  <div className="flex items-center gap-3">
                    {/* Brauzerning rang tanlagichi: ko'rinadigan namuna ustida shaffof turadi */}
                    <label
                      className={`relative size-11 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-edge ${focusWithinRing}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`absolute inset-0 ${form.hex ? "" : "bg-page"}`}
                        style={form.hex ? { backgroundColor: form.hex } : undefined}
                      />
                      <input
                        type="color"
                        aria-label={t("catalog.colors.swatch")}
                        value={form.hex || "#888888"}
                        onChange={(e) => set("hex", e.target.value)}
                        className="absolute inset-0 size-full cursor-pointer opacity-0"
                      />
                    </label>
                    <span className="text-sm tabular-nums text-muted">
                      {form.hex ? form.hex.toUpperCase() : t("catalog.colors.swatch_none")}
                    </span>
                    {form.hex && (
                      <button type="button" className={linkButton} onClick={() => set("hex", "")}>
                        {t("image.remove")}
                      </button>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-muted">{t("catalog.colors.swatch_hint")}</p>
                </div>
              )}
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

      {list.isLoading && <Loading className="mt-4" />}
      {list.isError && (
        <div className="mt-4">
          <Alert>{errorText(list.error)}</Alert>
        </div>
      )}
      {list.isSuccess && rows.length === 0 && (
        <section className="mt-4 rounded-card border border-line bg-panel shadow-card">
          <Empty icon={kind === "colors" ? Palette : Flower2} tone="plum">
            {list.data.length === 0 ? k("empty") : t("catalog.nothing_found")}
          </Empty>
        </section>
      )}

      <ul className="stagger mt-4 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-4">
        {rows.map((row) => (
          <AttributeTile key={row.id} row={row} busy={toggling === row.id} onEdit={open} onToggle={setActive} />
        ))}
      </ul>
    </div>
  );
}

/** Rang/gul plitkasi. memo: qidiruv yoki bitta plitka o'zgarganda qolganlari qayta chizilmaydi. */
const AttributeTile = memo(function AttributeTile({
  row,
  busy,
  onEdit,
  onToggle,
}: {
  row: Attribute;
  busy: boolean;
  onEdit: (row: Attribute) => void;
  onToggle: (row: Attribute, active: boolean) => Promise<void>;
}) {
  const { t } = useTranslation();
  return (
    <li className={`${tile} ${row.is_active ? "bg-panel" : "bg-page/60"}`}>
      <Thumb imageUrl={row.image_url} hex={row.hex} code={row.code} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className={`min-w-0 break-words font-medium ${row.is_active ? "" : "text-muted"}`}>{row.code}</p>
          {row.is_plain && <Chip tone="indigo">{t("catalog.patterns.plain_badge")}</Chip>}
          {!row.is_active && <InactiveChip />}
        </div>
        <p className="break-words text-sm">{row.name}</p>
        <p className="mt-0.5 text-[13px] text-muted">{t("catalog.sku_count", { count: row.sku_count })}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <RowAction icon={Pencil} onClick={() => onEdit(row)}>
            {t("common.edit")}
          </RowAction>
          {/* "Gulsiz" doim kerak — u faolsizlantirilmaydi */}
          {!row.is_plain && (
            <RowAction
              icon={row.is_active ? Power : RotateCcw}
              tone={row.is_active ? "danger" : "success"}
              disabled={busy}
              onClick={() => void onToggle(row, !row.is_active)}
            >
              {t(row.is_active ? "common.deactivate" : "common.activate")}
            </RowAction>
          )}
        </div>
      </div>
    </li>
  );
});
