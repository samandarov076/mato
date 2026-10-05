import { useRef, useState, type FormEvent } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  Banknote,
  CalendarDays,
  Lock,
  PackagePlus,
  Pencil,
  StickyNote,
  UserRound,
  Warehouse,
} from "lucide-react";
import { Thumb } from "@/modules/catalog/parts";
import { catalogKeys, type Attribute, type Fabric } from "@/modules/catalog/types";
import { ApiError, api, patch, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDate, formatDateTime, formatDecimal, formatNumber, todayISO, trimDecimal } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Alert, ConfirmBar, Loading } from "@/shared/ui/feedback";
import { TextField } from "@/shared/ui/fields";
import { BackLink, Chip, Fact, RowAction, rowClass, SectionHeader } from "@/shared/ui/list";
import { PageTitle } from "@/shared/ui/PageTitle";
import { LabelPrinter } from "./Labels";
import { LineEditor } from "./LineEditor";
import {
  lineBody,
  receivingKeys,
  skuPick,
  validateLine,
  type BatchLine,
  type Catalog,
  type LineDraft,
  type LineErrors,
  type ReceiptCard,
} from "./types";

const toDraft = (batch: BatchLine): LineDraft => ({
  key: batch.id,
  fabricId: String(batch.sku.fabric.id),
  colorId: String(batch.sku.color.id),
  patternId: String(batch.sku.pattern.id),
  rolls: String(batch.rolls_count),
  meters: trimDecimal(batch.meters_labeled),
  kg: batch.kg === null ? "" : trimDecimal(batch.kg),
  // Kg bor bo'lsa koeffitsient o'zi hisoblanadi; yo'q bo'lsa — saqlangani ko'rsatiladi
  coefficient: batch.kg === null && batch.m_per_kg !== null ? trimDecimal(batch.m_per_kg) : "",
  cost: String(batch.cost_per_m),
  price: null,
  priceUnit: null,
});

/** Kirim kartochkasi: hujjat, partiyalar, tuzatish, bekor qilish va etiketka chop etish. */
export function ReceiptPage() {
  const id = Number(useParams().id);
  // key: boshqa kirimga o'tilganda tuzatish holati eskisidan qolib ketmaydi
  return <ReceiptView key={id} id={id} />;
}

function ReceiptView({ id }: { id: number }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const justCreated = Boolean((useLocation().state as { created?: boolean } | null)?.created);

  const card = useQuery({
    queryKey: receivingKeys.card(id),
    queryFn: () => api<ReceiptCard>(`/receipts/${id}`),
  });
  const receipt = card.data;

  // Katalog ro'yxatlari faqat tuzatish uchun kerak
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
  const catalog: Catalog = {
    fabrics: fabrics.data ?? [],
    colors: colors.data ?? [],
    patterns: patterns.data ?? [],
  };

  const [draft, setDraft] = useState<LineDraft | null>(null); // tuzatilayotgan partiya
  const [draftErrors, setDraftErrors] = useState<LineErrors>({});
  const [header, setHeader] = useState<{ date: string; note: string } | null>(null); // sana va izohni tuzatish
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelTrigger = useRef<HTMLElement | null>(null); // tasdiq yopilganda fokus shu tugmaga qaytadi

  const reload = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: receivingKeys.all }),
      queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
    ]);

  /** So'rovni bajaradi; xato bo'lsa ko'rsatadi. Muvaffaqiyatli bo'lsa true. */
  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
      return true;
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === "validation_error"
          ? t("receiving.errors.check_fields")
          : errorText(failure),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveLine(event: FormEvent, batch: BatchLine) {
    event.preventDefault();
    if (!draft) return;
    const found = validateLine(draft);
    setDraftErrors(found);
    if (Object.keys(found).length > 0) return;
    const body = { ...lineBody(draft), ...(batch.has_movement ? {} : { sku: skuPick(draft) }) };
    if (await run(() => patch(`/batches/${batch.id}`, body))) setDraft(null);
  }

  async function saveHeader(event: FormEvent) {
    event.preventDefault();
    if (!header) return;
    const body = { receipt_date: header.date, note: header.note.trim() || null };
    if (await run(() => patch(`/receipts/${id}`, body))) setHeader(null);
  }

  async function cancel() {
    if (await run(() => post(`/receipts/${id}/cancel`))) setConfirmCancel(false);
  }

  const back = <BackLink to="/receiving">{t("receiving.title")}</BackLink>;

  if (card.isLoading) return <Loading />;
  if (!receipt) {
    return (
      <div className="space-y-4">
        {back}
        <Alert>{errorText(card.error)}</Alert>
      </div>
    );
  }

  const cancelled = receipt.status === "cancelled";
  const sum = t("settings.units.sum");

  // Etiketka chop etish: yangi saqlangan kirimda — muvaffaqiyat xabari ostida (keyingi qadam), aks holda pastda
  const labels = !cancelled && (
    <LabelPrinter
      receiptDate={receipt.receipt_date}
      items={receipt.lines.map((batch) => ({
        id: batch.id,
        number: batch.number,
        code: batch.sku.code,
        names: [
          batch.sku.fabric.name,
          batch.sku.color.name,
          !batch.sku.pattern.is_plain && batch.sku.pattern.name,
        ]
          .filter(Boolean)
          .join(" · "),
        copies: batch.rolls_count,
      }))}
    />
  );

  return (
    <div>
      {back}

      <div className="mt-3">
        <PageTitle
          icon={PackagePlus}
          tone={cancelled ? "madder" : "sky"}
          sub={cancelled ? <Chip tone="madder" dot>{t("receiving.cancelled")}</Chip> : undefined}
          action={
            receipt.can_cancel && (
              <Button
                variant="secondary"
                size="sm"
                disabled={confirmCancel}
                aria-expanded={confirmCancel}
                onClick={(event) => {
                  cancelTrigger.current = event.currentTarget;
                  setConfirmCancel(true);
                }}
              >
                <Ban className="size-4" aria-hidden="true" />
                {t("receiving.cancel")}
              </Button>
            )
          }
        >
          <span className={cancelled ? "text-muted" : ""}>
            {t("receiving.receipt")} {receipt.number}
          </span>
        </PageTitle>
      </div>

      <div className="mt-5 space-y-4">
        {justCreated && !cancelled && <Alert tone="success">{t("receiving.created")}</Alert>}
        {justCreated && labels}
        {error && <Alert>{error}</Alert>}
        {confirmCancel && (
          <ConfirmBar
            text={t("receiving.cancel_confirm")}
            confirmLabel={t("receiving.cancel_yes")}
            onConfirm={() => void cancel()}
            onCancel={() => setConfirmCancel(false)}
            busy={busy}
            returnFocusTo={cancelTrigger}
          />
        )}

        <Card>
          {header ? (
            <form onSubmit={saveHeader} noValidate className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <TextField
                  label={t("receiving.date")}
                  type="date"
                  value={header.date}
                  max={todayISO()}
                  onChange={(date) => setHeader({ ...header, date })}
                />
                <TextField
                  label={t("receiving.note")}
                  value={header.note}
                  onChange={(note) => setHeader({ ...header, note })}
                  hint={t("common.optional")}
                  maxLength={500}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" loading={busy}>
                  {t("common.save")}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setHeader(null)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                <Fact icon={CalendarDays} label={t("receiving.date")}>
                  {formatDate(`${receipt.receipt_date}T12:00:00+05:00`)}
                </Fact>
                <Fact icon={Warehouse} tone="sky" label={t("receiving.warehouse")}>
                  {receipt.warehouse.name}
                </Fact>
                <Fact
                  icon={UserRound}
                  tone="indigo"
                  label={t("receiving.created_by")}
                  sub={formatDateTime(receipt.created_at)}
                >
                  {receipt.created_by.name}
                </Fact>
                <Fact
                  icon={Banknote}
                  tone="leaf"
                  label={t("receiving.total_amount")}
                  sub={
                    <>
                      {t("receiving.batches_count", { count: receipt.lines.length })} ·{" "}
                      {formatDecimal(receipt.total_m)} m
                    </>
                  }
                >
                  <span className="tabular-nums">
                    {formatNumber(receipt.total_amount)} {sum}
                  </span>
                </Fact>
              </dl>
              {receipt.note && (
                <p className="mt-5 flex items-start gap-2.5 border-t border-line pt-4">
                  <StickyNote className="mt-1 size-4 shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0 break-words">{receipt.note}</span>
                </p>
              )}
              {cancelled && receipt.cancelled_by && receipt.cancelled_at && (
                <p className="mt-5 flex items-start gap-2.5 border-t border-line pt-4 text-sm text-muted">
                  <Ban className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    {t("receiving.cancelled_by", {
                      name: receipt.cancelled_by.name,
                      when: formatDateTime(receipt.cancelled_at),
                    })}
                  </span>
                </p>
              )}
              {receipt.can_edit && (
                <RowAction
                  icon={Pencil}
                  className="mt-4"
                  onClick={() => setHeader({ date: receipt.receipt_date, note: receipt.note ?? "" })}
                >
                  {t("receiving.edit_header")}
                </RowAction>
              )}
            </>
          )}
        </Card>

        <section className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
          <SectionHeader>{t("receiving.batches")}</SectionHeader>
          <ul className="divide-y divide-line">
            {receipt.lines.map((batch) =>
              draft?.key === batch.id ? (
                <li key={batch.id} className="p-5">
                  <form onSubmit={(event) => void saveLine(event, batch)} noValidate>
                    <p className="mb-4 font-medium">
                      {batch.number}
                      <span className="ml-2 font-normal text-muted">{t("receiving.editing")}</span>
                    </p>
                    <LineEditor
                      line={draft}
                      onChange={(next) => (setDraft(next), setDraftErrors({}))}
                      catalog={catalog}
                      errors={draftErrors}
                      skuLocked={batch.has_movement}
                    />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button type="submit" size="sm" loading={busy}>
                        {t("common.save")}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setDraft(null)}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </form>
                </li>
              ) : (
                <li key={batch.id} className={`flex flex-wrap items-start gap-x-4 gap-y-3 ${rowClass}`}>
                  <Thumb
                    imageUrl={batch.sku.pattern.image_url ?? batch.sku.color.image_url}
                    hex={batch.sku.color.hex}
                    code={batch.sku.color.code}
                  />
                  <div className="min-w-0 flex-1 basis-52">
                    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                      <span className="font-medium">{batch.number}</span>
                      <span>{batch.sku.code}</span>
                      <span className="text-sm text-muted">
                        {[
                          batch.sku.fabric.name,
                          batch.sku.color.name,
                          !batch.sku.pattern.is_plain && batch.sku.pattern.name,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </p>
                    <p className="mt-1 text-sm tabular-nums">
                      {[
                        t("receiving.rolls_value", { count: batch.rolls_count }),
                        `${formatDecimal(batch.meters_labeled)} m`,
                        batch.kg !== null && `${formatDecimal(batch.kg)} kg`,
                        batch.m_per_kg !== null &&
                          t("catalog.fabric.coefficient_value", { value: trimDecimal(batch.m_per_kg) }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-0.5 text-sm tabular-nums text-muted">
                      {t("receiving.cost_value", { cost: formatNumber(batch.cost_per_m) })}
                      {!cancelled && (
                        <> · {t("receiving.in_stock", { meters: formatDecimal(batch.qty_m) })}</>
                      )}
                    </p>
                    {batch.has_movement && !batch.can_edit && !cancelled && (
                      <p className="mt-2 flex items-start gap-2 text-[13px] text-muted">
                        <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0">{t("receiving.locked_note")}</span>
                      </p>
                    )}
                  </div>
                  {/* O'ngda — qatorning summasi va tuzatish amali; tor ekranda pastga tushadi */}
                  <div className="ml-auto flex flex-col items-end gap-2">
                    <p className="whitespace-nowrap font-medium tabular-nums">
                      {t("receiving.amount_value", { amount: formatNumber(batch.amount) })}
                    </p>
                    {batch.can_edit && draft === null && (
                      <RowAction icon={Pencil} onClick={() => (setDraftErrors({}), setDraft(toDraft(batch)))}>
                        {t("receiving.edit_line")}
                      </RowAction>
                    )}
                  </div>
                </li>
              ),
            )}
          </ul>
        </section>

        {!justCreated && labels}
      </div>
    </div>
  );
}
