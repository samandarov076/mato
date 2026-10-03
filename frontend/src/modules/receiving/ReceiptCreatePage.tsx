import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, PackagePlus, Plus, Trash2, X } from "lucide-react";
import { useCurrentUser } from "@/modules/auth/AuthProvider";
import { catalogKeys, type Attribute, type Fabric } from "@/modules/catalog/types";
import { api, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { useRequestId } from "@/shared/api/requestId";
import { clearDraft, loadDraft, saveDraft } from "@/shared/draft";
import { feedback } from "@/shared/feedback";
import { sumDecimals } from "@/shared/decimal";
import { useWide } from "@/shared/useWide";
import { formatDecimal, formatNumber, todayISO } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Card, cardTitle } from "@/shared/ui/Card";
import { Alert, ConfirmBar, Loading } from "@/shared/ui/feedback";
import { SelectField, TextField } from "@/shared/ui/fields";
import { BackLink, IconChip, RowAction } from "@/shared/ui/list";
import { PageTitle } from "@/shared/ui/PageTitle";
import { LineEditor, LineRow } from "./LineEditor";
import {
  emptyLine,
  lineAmount,
  lineBody,
  lineHasValues,
  receivingKeys,
  reserveKeys,
  skuPick,
  validateLine,
  type LineDraft,
  type LineErrors,
  type ReceiptOptions,
} from "./types";

/** Qoralama: sklad, sana, izoh va qatorlar — qurilmada saqlanadi (`shared/draft.ts`) */
type ReceiptDraft = { picked: string; date: string; note: string; lines: LineDraft[] };

/** Qoralamada saqlashga arziydigan narsa bormi (bo'sh forma saqlanmaydi va tiklanmaydi) */
const isDirty = (draft: ReceiptDraft) =>
  Boolean(draft.picked || draft.note || draft.lines.some(lineHasValues));

/** Saqlangan qoralama shakli to'g'rimi (eski versiyadan qolgan yoki buzilgan bo'lishi mumkin) */
function restoredDraft(key: string): ReceiptDraft | null {
  const saved = loadDraft<Partial<ReceiptDraft>>(key);
  if (
    !saved ||
    typeof saved.picked !== "string" ||
    typeof saved.date !== "string" ||
    typeof saved.note !== "string" ||
    !Array.isArray(saved.lines) ||
    saved.lines.length === 0 ||
    saved.lines.some((line) => typeof line?.key !== "number" || typeof line.fabricId !== "string")
  ) {
    return null;
  }
  const draft = saved as ReceiptDraft;
  if (!isDirty(draft)) return null;
  reserveKeys(draft.lines);
  return draft;
}

/** Qatordagi tovar: mato + rang + gul (gul tanlanmagan — gulsiz) */
const skuKey = (line: LineDraft, plainId: string) =>
  line.fabricId && line.colorId ? `${line.fabricId}-${line.colorId}-${line.patternId || plainId}` : null;

/** Birlashtirilayotgan ikki qatorning metri (2 xona) yoki kg'i (3 xona) qo'shiladi; yaroqsiz bo'lsa — borining o'zi */
const sum = (a: string, b: string, decimals: number) => {
  const total = sumDecimals([a, b], decimals);
  return total !== "0" ? total : a || b;
};

/** Kirim yaratish: sklad, sana, izoh va bir yoki bir nechta partiya. */
export function ReceiptCreatePage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const draftKey = `mato.receipt.${user.id}`;

  const options = useQuery({
    queryKey: receivingKeys.options,
    queryFn: () => api<ReceiptOptions>("/receipts/options"),
  });
  const fabrics = useQuery({
    queryKey: catalogKeys.fabrics,
    queryFn: () => api<Fabric[]>("/catalog/fabrics?include_inactive=true"),
  });
  const colors = useQuery({
    queryKey: catalogKeys.attributes("colors"),
    queryFn: () => api<Attribute[]>("/catalog/colors?include_inactive=true"),
  });
  const patterns = useQuery({
    queryKey: catalogKeys.attributes("patterns"),
    queryFn: () => api<Attribute[]>("/catalog/patterns?include_inactive=true"),
  });

  // Oldingi safar yakunlanmagan forma bo'lsa — o'sha holatdan davom etiladi
  const [restored] = useState(() => restoredDraft(draftKey));
  const [picked, setPicked] = useState(restored?.picked ?? "");
  const [date, setDate] = useState(restored?.date ?? todayISO);
  const [note, setNote] = useState(restored?.note ?? "");
  const [lines, setLines] = useState<LineDraft[]>(() => restored?.lines ?? [emptyLine()]);
  const [draftNotice, setDraftNotice] = useState(restored !== null);
  const [lineErrors, setLineErrors] = useState<Record<number, LineErrors>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [warehouseError, setWarehouseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  const saved = useRef(false); // kirim saqlandi — qoralama endi yozilmaydi
  // Javob yo'qolib "Saqlash" qayta bosilsa (yoki sahifa yangilansa) kirim ikki marta yozilmasin
  const request = useRequestId(`${draftKey}.request`);
  const removeTrigger = useRef<HTMLElement | null>(null); // tasdiq yopilganda fokus qaytadigan tugma
  const cards = useRef<Record<number, HTMLElement | null>>({});
  const wide = useWide(1024); // kompyuterda partiyalar — jadval qatorlari; torroqda — kartochkalar
  const focusLine = useRef<number | null>(null); // yangi qo'shilgan qator — unga suriladi va fokus beriladi

  // Har o'zgarishda qoralama yangilanadi; forma bo'shatilsa — o'chadi
  useEffect(() => {
    if (saved.current) return;
    const draft: ReceiptDraft = { picked, date, note, lines };
    if (isDirty(draft)) saveDraft(draftKey, draft);
    else clearDraft(draftKey);
  }, [draftKey, picked, date, note, lines]);

  // Yangi qator ekranning tepasiga keladi, birinchi maydoni (mato) fokus oladi — ikki marta bosilmaydi
  useEffect(() => {
    const key = focusLine.current;
    if (key === null) return;
    focusLine.current = null;
    const card = cards.current[key];
    card?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    card?.querySelector("select")?.focus({ preventScroll: true });
  }, [lines]);

  const warehouses = options.data?.warehouses ?? [];
  // Bitta sklad bo'lsa — tanlash shart emas
  const warehouseId = picked || (warehouses.length === 1 ? String(warehouses[0].id) : "");
  const catalog = { fabrics: fabrics.data ?? [], colors: colors.data ?? [], patterns: patterns.data ?? [] };
  const plainId = String(catalog.patterns.find((row) => row.is_plain)?.id ?? "");

  const update = (next: LineDraft) => {
    setLines((all) => all.map((line) => (line.key === next.key ? next : line)));
    setLineErrors((all) => ({ ...all, [next.key]: {} })); // tuzatilayotgan qatorning xatolari o'chadi
    setFormError(null);
  };
  const remove = (key: number) => {
    setLines((all) => all.filter((line) => line.key !== key));
    setConfirmRemove(null);
  };
  /** To'ldirilgan qator — avval so'raladi; bo'sh qator darhol olib tashlanadi */
  function askRemove(line: LineDraft, event: MouseEvent<HTMLButtonElement>) {
    if (!lineHasValues(line)) {
      feedback("remove", event);
      remove(line.key);
      return;
    }
    removeTrigger.current = event.currentTarget;
    setConfirmRemove(line.key);
  }
  function addLine() {
    const line = emptyLine();
    focusLine.current = line.key;
    setLines((all) => [...all, line]);
  }
  /** Tiklangan qoralamadan voz kechish — bo'sh formadan boshlanadi */
  function discardDraft() {
    clearDraft(draftKey);
    setPicked("");
    setDate(todayISO());
    setNote("");
    setLines([emptyLine()]);
    setLineErrors({});
    setFormError(null);
    setWarehouseError(null);
    setDraftNotice(false);
  }

  /** Bir xil tovar ikki qatorda — pastdagisi yuqoridagiga qo'shiladi */
  function merge(into: LineDraft, from: LineDraft) {
    setLines((all) =>
      all
        .filter((line) => line.key !== from.key)
        .map((line) =>
          line.key === into.key
            ? {
                ...line,
                rolls: String(Number(line.rolls || 0) + Number(from.rolls || 0) || ""),
                meters: sum(line.meters, from.meters, 2),
                kg: line.kg || from.kg ? sum(line.kg, from.kg, 3) : "",
                cost: line.cost || from.cost,
              }
            : line,
        ),
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const found: Record<number, LineErrors> = {};
    for (const line of lines) {
      const errors = validateLine(line);
      if (Object.keys(errors).length > 0) found[line.key] = errors;
    }
    setLineErrors(found);
    setWarehouseError(warehouseId ? null : t("receiving.errors.warehouse"));
    if (!warehouseId || Object.keys(found).length > 0) {
      // Xato qator bir necha ekran tepada bo'lishi mumkin: tugma yonida xulosa, ekran esa birinchi xatoga suriladi
      setFormError(t("receiving.errors.check_fields"));
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        field?.scrollIntoView?.({ block: "center", behavior: "smooth" });
        field?.focus({ preventScroll: true });
      });
      return;
    }
    setFormError(null);

    setSaving(true);
    try {
      const { id } = await post<{ id: number }>("/receipts", {
        client_uuid: request.current(),
        warehouse_id: Number(warehouseId),
        receipt_date: date,
        note: note.trim() || null,
        lines: lines.map((line) => ({
          ...skuPick(line),
          ...lineBody(line),
          // Tavsiya narx faqat foydalanuvchi shu yerda yozgan bo'lsa yuboriladi
          ...(line.price ? { price: Number(line.price), price_unit: line.priceUnit ?? "m" } : {}),
        })),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: receivingKeys.all }),
        queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
      ]);
      saved.current = true;
      request.settle();
      clearDraft(draftKey);
      navigate(`/receiving/${id}`, { replace: true, state: { created: true } });
    } catch (error) {
      request.settle(error);
      setFormError(errorText(error));
      setSaving(false);
    }
  }

  const loading = options.isLoading || fabrics.isLoading || colors.isLoading || patterns.isLoading;
  const totalMeters = sumDecimals(lines.map((line) => line.meters), 2);
  const totalAmount = lines.reduce((total, line) => total + (lineAmount(line) ?? 0), 0);
  const firstByKey = new Map<string, LineDraft>();

  return (
    <div>
      <BackLink to="/receiving">{t("receiving.title")}</BackLink>
      <div className="mt-3">
        <PageTitle icon={PackagePlus} tone="sky">
          {t("receiving.create")}
        </PageTitle>
      </div>

      {loading ? (
        <Loading className="mt-5" />
      ) : warehouses.length === 0 ? (
        <div className="mt-5 max-w-xl">
          <Alert tone="info">{t("receiving.no_warehouses")}</Alert>
        </div>
      ) : catalog.fabrics.every((row) => !row.is_active) || catalog.colors.every((row) => !row.is_active) ? (
        <div className="mt-5 max-w-xl space-y-3">
          <Alert tone="info">{t("receiving.no_catalog")}</Alert>
          <Link to="/catalog" className="inline-block text-sm text-indigo hover:underline">
            {t("catalog.title")} →
          </Link>
        </div>
      ) : (
        <form onSubmit={save} noValidate className="mt-5 space-y-4">
          {draftNotice && (
            <Alert tone="info">
              {t("common.draft_restored")}
              <RowAction icon={X} className="ml-3 align-middle" onClick={discardDraft}>
                {t("common.clear_draft")}
              </RowAction>
            </Alert>
          )}

          <Card>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <SelectField
                label={t("receiving.warehouse")}
                value={warehouseId}
                onChange={(value) => (setPicked(value), setFormError(null))}
                error={warehouseError}
              >
                {warehouses.length > 1 && <option value="">{t("receiving.choose")}</option>}
                {warehouses.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </SelectField>
              <TextField
                label={t("receiving.date")}
                type="date"
                value={date}
                max={todayISO()}
                onChange={setDate}
              />
            </div>
            <div className="mt-4">
              <TextField
                label={t("receiving.note")}
                value={note}
                onChange={setNote}
                hint={t("common.optional")}
                maxLength={500}
              />
            </div>
          </Card>

          {(() => {
            // Har qator uchun umumiy bloklar — kartochkada ham, jadval qatorida ham bir xil
            const blocks = lines.map((line, index) => {
              const key = skuKey(line, plainId);
              const twin = key ? firstByKey.get(key) : undefined;
              if (key && !twin) firstByKey.set(key, line);
              const removing = confirmRemove === line.key;
              const confirm = removing && (
                <ConfirmBar
                  text={t("receiving.remove_confirm", { n: index + 1 })}
                  confirmLabel={t("receiving.remove_yes")}
                  onConfirm={() => {
                    feedback("remove");
                    remove(line.key);
                  }}
                  onCancel={() => setConfirmRemove(null)}
                  returnFocusTo={removeTrigger}
                />
              );
              const duplicate = twin && (
                <div className="flex flex-wrap items-center gap-3 rounded-control bg-saffron-soft px-3.5 py-2.5 text-sm text-saffron">
                  <span className="min-w-0 flex-1 basis-56">
                    {t("receiving.warn_duplicate", { n: lines.indexOf(twin) + 1 })}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => merge(twin, line)}>
                    {t("receiving.merge")}
                  </Button>
                </div>
              );
              return { line, index, removing, confirm, duplicate };
            });

            // Kompyuterda (≥1024px) — jadval: har partiya bitta qator, Tab bilan yuriladi
            if (wide) {
              return (
                <section className="overflow-x-auto rounded-card border border-line bg-panel shadow-card">
                  <table aria-label={t("receiving.batches")} className="w-full min-w-[900px] table-fixed text-left">
                    <colgroup>
                      {/* 1280px da ham narx ustunlari sig'sin: tanlovlar biroz tor, tannarx va tavsiya narx kengroq */}
                      <col className="w-10" />
                      <col className="w-[13%]" />
                      <col className="w-[11%]" />
                      <col className="w-[9%]" />
                      <col className="w-[5%]" />
                      <col className="w-[8%]" />
                      <col className="w-[7%]" />
                      <col className="w-[7%]" />
                      <col className="w-[12%]" />
                      <col />
                      <col className="w-14" />
                    </colgroup>
                    <thead className="whitespace-nowrap border-b border-line bg-page/60 text-[13px] text-muted">
                      <tr>
                        <th scope="col" className="px-1 py-2.5 pl-4 font-medium">№</th>
                        <th scope="col" className="px-1 py-2.5 font-medium">{t("catalog.sku.fabric")}</th>
                        <th scope="col" className="px-1 py-2.5 font-medium">{t("catalog.sku.color")}</th>
                        <th scope="col" className="px-1 py-2.5 font-medium">{t("catalog.sku.pattern")}</th>
                        <th scope="col" className="px-1 py-2.5 text-right font-medium">{t("receiving.col_rolls")}</th>
                        <th scope="col" className="px-1 py-2.5 text-right font-medium">{t("receiving.col_meters")}</th>
                        <th scope="col" className="px-1 py-2.5 text-right font-medium">{t("receiving.col_kg")}</th>
                        <th scope="col" className="px-1 py-2.5 text-right font-medium">{t("receiving.col_coefficient")}</th>
                        <th scope="col" className="px-1 py-2.5 text-right font-medium">{t("receiving.col_cost")}</th>
                        <th scope="col" className="px-1 py-2.5 font-medium">{t("catalog.sku.col_price")}</th>
                        <th scope="col" className="px-1 py-2.5 pr-3" />
                      </tr>
                    </thead>
                    <tbody className="[&>tr]:border-t [&>tr]:border-line [&>tr:first-child]:border-t-0">
                      {blocks.map(({ line, index, removing, confirm, duplicate }) => (
                        <LineRow
                          key={line.key}
                          n={index + 1}
                          line={line}
                          onChange={update}
                          catalog={catalog}
                          errors={lineErrors[line.key] ?? {}}
                          removeRef={(element) => (cards.current[line.key] = element)}
                          removing={removing}
                          onRemove={lines.length > 1 ? (event) => askRemove(line, event) : undefined}
                        >
                          {(confirm || duplicate) && (
                            <>
                              {confirm}
                              {duplicate}
                            </>
                          )}
                        </LineRow>
                      ))}
                    </tbody>
                  </table>
                </section>
              );
            }

            return blocks.map(({ line, index, removing, confirm, duplicate }) => (
              // O'ram: yangi qator shu yerga suriladi (Card o'zi ref qabul qilmaydi)
              <div
                key={line.key}
                ref={(element) => (cards.current[line.key] = element)}
                className="scroll-mt-4"
              >
                <Card>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className={cardTitle}>
                      <IconChip icon={Layers} tone="sky" size="sm" />
                      {t("receiving.batch_n", { n: index + 1 })}
                    </h2>
                    {lines.length > 1 && (
                      <RowAction
                        icon={Trash2}
                        tone="danger"
                        disabled={removing}
                        aria-expanded={removing}
                        onClick={(event) => askRemove(line, event)}
                        aria-label={t("receiving.remove_line", { n: index + 1 })}
                      >
                        {t("receiving.remove")}
                      </RowAction>
                    )}
                  </div>
                  {confirm && <div className="mb-4">{confirm}</div>}
                  <LineEditor
                    line={line}
                    onChange={update}
                    catalog={catalog}
                    errors={lineErrors[line.key] ?? {}}
                    withPrice
                  >
                    {duplicate}
                  </LineEditor>
                </Card>
              </div>
            ));
          })()}

          <Button variant="secondary" onClick={addLine}>
            <Plus className="size-[18px]" aria-hidden="true" />
            {t("receiving.add_line")}
          </Button>

          {/* Saqlashdan oldin jami ko'rinish — ekran pastida turadi; xato xulosasi ham shu yerda, tugma yonida */}
          <div className="sticky bottom-3 z-10 rounded-card border border-line bg-panel p-2.5 shadow-pop sm:p-4">
            {formError && (
              <div className="mb-3">
                <Alert>{formError}</Alert>
              </div>
            )}
            <div className="flex items-center gap-x-3 sm:flex-wrap sm:gap-x-6 sm:gap-y-3">
              {/* Telefonda — bitta ixcham qator (nomlarsiz: "2 · 700.5 m · 17 005 000 so'm"), maydonlarni yopmaydi;
                  keng ekranda — nomlari bilan */}
              <dl className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-sm sm:basis-60 sm:gap-x-6 sm:gap-y-1 sm:text-base">
                <div>
                  <dt className="sr-only text-[13px] text-muted sm:not-sr-only">{t("receiving.batches")}</dt>
                  <dd className="font-medium tabular-nums">
                    {lines.length}
                    <span className="text-muted sm:hidden"> ×</span>
                  </dd>
                </div>
                <div>
                  <dt className="sr-only text-[13px] text-muted sm:not-sr-only">{t("receiving.total_m")}</dt>
                  <dd className="whitespace-nowrap font-medium tabular-nums">
                    {formatDecimal(totalMeters)} m
                  </dd>
                </div>
                <div>
                  <dt className="sr-only text-[13px] text-muted sm:not-sr-only">{t("receiving.total_amount")}</dt>
                  <dd className="whitespace-nowrap font-semibold tabular-nums">
                    {formatNumber(totalAmount)} {t("settings.units.sum")}
                  </dd>
                </div>
              </dl>
              <Button type="submit" loading={saving}>
                {t("receiving.save")}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
