import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Banknote, CheckCheck, HandCoins, Receipt, Undo2, Wallet } from "lucide-react";
import { useCurrentUser } from "@/modules/auth/AuthProvider";
import { parseDecimal } from "@/modules/catalog/types";
import { creditKeys } from "@/modules/credit/types";
import { inventoryKeys } from "@/modules/inventory/types";
import { api, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDate, formatDateTime, formatDecimal, formatNumber, formatPrice, trimDecimal } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Segmented } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { fieldLabel, TextAreaField } from "@/shared/ui/fields";
import {
  BackLink,
  Chip,
  Fact,
  IconChip,
  InfoRow,
  InfoTable,
  RowAction,
  rowClass,
  SectionHeader,
  sectionStrip,
} from "@/shared/ui/list";
import { PageTitle } from "@/shared/ui/PageTitle";
import { focusRing } from "@/shared/ui/tones";
import { lineAmount } from "./cart";
import { PaymentChip, SaleStatusChip } from "./SalesPage";
import {
  salesKeys,
  type MoneyMethod,
  type ReturnCreated,
  type SaleCard,
  type SaleLine,
} from "./types";

// Keng ekranda ustunlar: tovar · metr · kg · tavsiya narx · narx · jami
const columns = "md:grid-cols-[minmax(0,1.7fr)_84px_76px_112px_112px_124px]";

/** Qatordan yana qancha metr qaytarsa bo'ladi */
const returnable = (line: SaleLine) => Math.round((Number(line.meters) - Number(line.returned_m)) * 100) / 100;

/** Sotuv kartochkasi: qatorlar, to'lov, qaytarishlar tarixi; amallar — qaytarish va bekor qilish. */
export function SaleCardPage() {
  const id = Number(useParams().id);
  return <SaleView key={id} id={id} />;
}

function SaleView({ id }: { id: number }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const sum = t("settings.units.sum");
  const [mode, setMode] = useState<"view" | "return" | "cancel">("view");
  const [notice, setNotice] = useState<string | null>(null);

  const card = useQuery({ queryKey: salesKeys.sale(id), queryFn: () => api<SaleCard>(`/sales/${id}`) });
  const sale = card.data;

  /** Sotuv o'zgardi: qoldiq, qarz va ro'yxatlar ham yangilanadi */
  async function changed(message: string | null) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: salesKeys.all }),
      queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
      queryClient.invalidateQueries({ queryKey: creditKeys.all }),
    ]);
    setMode("view");
    setNotice(message);
  }

  const back = <BackLink to="/sales">{t(user.role === "seller" ? "store.nav.my_sales" : "sales.card.back")}</BackLink>;

  if (card.isLoading) return <Loading />;
  if (!sale) {
    return (
      <div>
        {back}
        <div className="mt-5">
          <Alert>{errorText(card.error)}</Alert>
        </div>
      </div>
    );
  }

  const money = (value: number) => `${formatNumber(value)} ${sum}`;
  const method = (value: MoneyMethod | null) => (value ? t(`sales.payment.${value}`) : "");
  const hasReturns = sale.returns.length > 0;

  return (
    <div>
      {back}

      <div className="mt-3">
        <PageTitle
          icon={Receipt}
          tone={sale.status === "cancelled" ? "madder" : "leaf"}
          sub={<SaleStatusChip status={sale.status} />}
          action={
            mode === "view" &&
            (sale.can_return || sale.can_cancel) && (
              <div className="flex flex-wrap gap-2">
                {sale.can_return && (
                  <Button variant="secondary" size="sm" onClick={() => (setMode("return"), setNotice(null))}>
                    <Undo2 className="size-4" aria-hidden="true" />
                    {t("sales.return.open")}
                  </Button>
                )}
                {sale.can_cancel && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-madder hover:text-madder"
                    onClick={() => (setMode("cancel"), setNotice(null))}
                  >
                    <Ban className="size-4" aria-hidden="true" />
                    {t("sales.cancel.open")}
                  </Button>
                )}
              </div>
            )
          }
        >
          {t("sales.sale")} {sale.number}
        </PageTitle>
      </div>

      <div className="mt-5 space-y-4">
        {notice && <Alert tone="success">{notice}</Alert>}

        {sale.status === "cancelled" && sale.cancelled_by && sale.cancelled_at && (
          <div className="flex items-start gap-3 rounded-control border border-line bg-page/60 px-3.5 py-3 text-sm">
            <IconChip icon={Ban} tone="neutral" size="sm" />
            <div className="min-w-0">
              <p>
                {t("sales.card.cancelled_by", { name: sale.cancelled_by, when: formatDateTime(sale.cancelled_at) })}
              </p>
              {sale.cancel_reason && (
                <p className="break-words text-muted">{t("sales.card.reason", { reason: sale.cancel_reason })}</p>
              )}
            </div>
          </div>
        )}

        {mode === "cancel" && (
          <CancelForm
            id={id}
            onClose={() => setMode("view")}
            onDone={() => changed(null)}
          />
        )}
        {mode === "return" && (
          <ReturnForm
            sale={sale}
            onClose={() => setMode("view")}
            onDone={(result) => changed(t("sales.return.done", { amount: formatNumber(result.amount) }))}
          />
        )}

        {/* Ma'lumot va to'lov — jadval ko'rinishida (chapda nom, o'ngda qiymat); keng ekranda yonma-yon */}
        <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
          <Card title={t("sales.card.info")} icon={Receipt} tone="neutral" className="min-w-0">
            <InfoTable>
              <InfoRow label={t("sales.card.when")}>{formatDateTime(sale.created_at)}</InfoRow>
              <InfoRow label={t("sales.store")}>{sale.store.name}</InfoRow>
              <InfoRow label={t("sales.list.seller")}>{sale.seller.name}</InfoRow>
              {sale.customer && (
                <InfoRow label={t("sales.card.customer")}>
                  <Link to={`/customers/${sale.customer.id}`} className="text-indigo hover:underline">
                    {sale.customer.name}
                  </Link>
                </InfoRow>
              )}
            </InfoTable>
          </Card>

          <Card title={t("sales.card.payment")} icon={Wallet} tone="leaf" className="min-w-0">
            <InfoTable>
              <InfoRow label={t("sales.total")} strong>
                {money(sale.total)}
              </InfoRow>
              <InfoRow label={t("sales.payment.label")}>
                <PaymentChip type={sale.payment_type} />
              </InfoRow>
              {sale.returned_total > 0 && (
                <InfoRow label={t("sales.card.returned_total")}>
                  <span className="text-saffron">{money(sale.returned_total)}</span>
                </InfoRow>
              )}
              {sale.debt && (
                <>
                  {sale.initial_payment > 0 && (
                    <InfoRow label={t("sales.credit.initial")}>
                      {money(sale.initial_payment)}
                      {sale.initial_payment_method && (
                        <span className="font-normal text-muted"> · {method(sale.initial_payment_method)}</span>
                      )}
                    </InfoRow>
                  )}
                  <InfoRow label={t("sales.card.debt")}>{money(sale.debt.amount)}</InfoRow>
                  <InfoRow label={t("sales.card.debt_remaining")}>
                    {sale.debt.status === "cancelled" ? (
                      <span className="font-normal text-muted">{t("sales.card.debt_cancelled")}</span>
                    ) : (
                      <span className={sale.debt.remaining > 0 ? "text-madder" : ""}>{money(sale.debt.remaining)}</span>
                    )}
                  </InfoRow>
                  {sale.debt.status === "active" && (
                    <InfoRow label={t("sales.card.due")}>{formatDate(sale.debt.due_date)}</InfoRow>
                  )}
                </>
              )}
              {/* Foyda — faqat biznes egasiga keladi (server); to'lov qatorlaridan keyin */}
              {sale.profit !== null && (
                <InfoRow label={t("sales.card.profit")}>
                  <span className={sale.profit < 0 ? "text-madder" : "text-leaf"}>{money(sale.profit)}</span>
                </InfoRow>
              )}
            </InfoTable>
          </Card>
        </div>

        <section className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
          <div className={`${sectionStrip} hidden items-center gap-x-4 md:grid ${columns}`}>
            <span>{t("sales.card.col_item")}</span>
            <span className="text-right">{t("sales.entry.meters")}</span>
            <span className="text-right">{t("sales.entry.kg")}</span>
            <span className="text-right">{t("sales.card.col_recommended")}</span>
            <span className="text-right">{t("sales.card.col_price")}</span>
            <span className="text-right">{t("sales.card.col_amount")}</span>
          </div>
          <ul className="divide-y divide-line">
            {sale.lines.map((line) => (
              <li key={line.id} className={`${rowClass} grid items-baseline gap-x-4 gap-y-1 ${columns}`}>
                <span className="min-w-0">
                  <span className="block font-medium">{line.sku_label}</span>
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <Link to={`/batches/${line.batch_id}`} className="text-sm text-indigo hover:underline">
                      {line.batch_number}
                    </Link>
                    {Number(line.returned_m) > 0 && (
                      <Chip tone="saffron" icon={Undo2}>
                        {t("sales.card.returned_m", { meters: formatDecimal(line.returned_m) })}
                      </Chip>
                    )}
                  </span>
                  {line.negative_stock_note && (
                    <span className="block text-sm text-saffron">
                      {t("sales.card.negative_note", { note: line.negative_stock_note })}
                    </span>
                  )}
                </span>
                {/* Telefon: miqdor va narx bitta qatorda */}
                <span className="text-sm text-muted md:hidden">
                  {formatDecimal(line.meters)} m{line.kg && ` · ${formatDecimal(line.kg)} kg`} ×{" "}
                  {formatPrice(line.price_per_m, "m", t)}
                </span>
                <span className="hidden text-right tabular-nums md:block">{formatDecimal(line.meters)}</span>
                <span className="hidden text-right tabular-nums md:block">
                  {line.kg ? formatDecimal(line.kg) : "—"}
                </span>
                <span className="hidden text-right tabular-nums text-muted md:block">
                  {line.recommended_price_per_m ? formatNumber(line.recommended_price_per_m) : "—"}
                </span>
                <span className="hidden text-right tabular-nums md:block">
                  {formatNumber(line.price_per_m)}
                  {line.cost_per_m !== null && (
                    <span className="block text-[13px] text-muted">
                      {t("sales.card.cost", { cost: formatNumber(line.cost_per_m) })}
                    </span>
                  )}
                </span>
                <span className="font-medium tabular-nums md:text-right">{money(line.amount)}</span>
              </li>
            ))}
          </ul>
        </section>

        {hasReturns && (
          <section className="min-w-0 overflow-hidden rounded-card border border-line bg-panel shadow-card">
            <SectionHeader>{t("sales.card.returns")}</SectionHeader>
            <ul className="divide-y divide-line">
              {sale.returns.map((item) => (
                <li key={item.id} className={`${rowClass} flex items-start gap-3`}>
                  <IconChip icon={Undo2} tone="saffron" />
                  <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-4 gap-y-1">
                    <div className="min-w-0 flex-1 basis-48">
                      {item.lines.map((line, index) => (
                        <p key={index} className="text-sm">
                          {line.sku_label} · {formatDecimal(line.meters)} m
                        </p>
                      ))}
                      <p className="text-[13px] text-muted">
                        {item.user}, {formatDateTime(item.created_at)}
                      </p>
                      <p className="text-sm text-muted">
                        {[
                          item.debt_amount > 0 &&
                            t("sales.card.return_debt", { amount: formatNumber(item.debt_amount) }),
                          item.refund > 0 &&
                            t(`sales.card.return_refund_${item.method ?? "cash"}`, {
                              amount: formatNumber(item.refund),
                            }),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <p className="ml-auto whitespace-nowrap text-right font-medium tabular-nums">
                      {money(item.amount)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/** Qaytarish: har qatorga qaytgan metr. Nasiya sotuvda summa avval qarzdan ayriladi, qolgani pul bilan. */
function ReturnForm({
  sale,
  onDone,
  onClose,
}: {
  sale: SaleCard;
  onDone: (result: ReturnCreated) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const sum = t("settings.units.sum");
  const [entered, setEntered] = useState<Record<number, string>>({});
  const [method, setMethod] = useState<MoneyMethod>("cash");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = sale.lines
    .filter((line) => returnable(line) > 0)
    .map((line) => {
      const text = (entered[line.id] ?? "").trim();
      const meters = text ? parseDecimal(text, 2) : null;
      const left = returnable(line);
      const bad = text !== "" && (meters === null || Number(meters) > left);
      // Oxirgi qism qaytarilganda — qolgan summaning hammasi (yaxlitlash farqi qolmaydi), serverdagi kabi
      const amount =
        meters === null || bad
          ? 0
          : Number(meters) === left
            ? line.amount - line.returned_amount
            : lineAmount(meters, line.price_per_m);
      return { line, meters, left, bad, amount };
    });
  const total = rows.reduce((amount, row) => amount + row.amount, 0);
  const debtLeft = sale.debt?.status === "active" ? sale.debt.remaining : 0;
  const fromDebt = Math.min(total, debtLeft);
  const refund = total - fromDebt;

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (rows.some((row) => row.bad)) return setError(t("sales.return.errors.meters"));
    const lines = rows.filter((row) => row.meters !== null);
    if (lines.length === 0) return setError(t("sales.return.errors.empty"));
    setBusy(true);
    try {
      const result = await post<ReturnCreated>(`/sales/${sale.id}/returns`, {
        lines: lines.map((row) => ({ sale_line_id: row.line.id, meters: row.meters })),
        method,
      });
      await onDone(result);
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  }

  return (
    <Card title={t("sales.return.title")} icon={Undo2} tone="saffron">
      <form onSubmit={save} noValidate>
        <p className="-mt-2 text-sm text-muted">{t("sales.return.intro")}</p>
        {error && (
          <div className="mt-3">
            <Alert>{error}</Alert>
          </div>
        )}
        <ul className="mt-3 divide-y divide-line">
          {rows.map(({ line, left, bad }) => (
            <li key={line.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span className="min-w-0 flex-1 basis-52">
                <span className="block break-words font-medium">{line.sku_label}</span>
                <span className="block text-sm text-muted">
                  {line.batch_number} · {formatPrice(line.price_per_m, "m", t)}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <input
                  aria-label={t("sales.return.meters_for", { label: line.sku_label })}
                  aria-invalid={bad || undefined}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={entered[line.id] ?? ""}
                  onChange={(e) => setEntered({ ...entered, [line.id]: e.target.value })}
                  className={`h-11 w-28 rounded-control border bg-panel px-3 text-right text-[16px] tabular-nums transition-colors placeholder:text-muted ${focusRing} ${
                    bad ? "border-madder focus-visible:ring-madder" : "border-edge focus:border-indigo"
                  }`}
                />
                <span className="text-sm text-muted">m</span>
                <RowAction
                  icon={CheckCheck}
                  onClick={() => setEntered({ ...entered, [line.id]: trimDecimal(left.toFixed(2)) })}
                >
                  {t("sales.return.all", { meters: formatDecimal(left.toFixed(2)) })}
                </RowAction>
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-4 border-t border-line pt-4">
          <Fact icon={Undo2} tone="saffron" label={t("sales.return.amount")}>
            <span className="text-xl font-semibold tabular-nums">
              {formatNumber(total)} {sum}
            </span>
          </Fact>
          {fromDebt > 0 && (
            <Fact icon={HandCoins} tone="saffron" label={t("sales.return.from_debt")}>
              <span className="tabular-nums">
                {formatNumber(fromDebt)} {sum}
              </span>
            </Fact>
          )}
          {debtLeft > 0 && (
            <Fact icon={Banknote} tone="leaf" label={t("sales.return.refund")}>
              <span className="tabular-nums">
                {formatNumber(refund)} {sum}
              </span>
            </Fact>
          )}
        </dl>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          {refund > 0 && (
            <div>
              <p className={fieldLabel}>{t("sales.return.method")}</p>
              <Segmented<MoneyMethod>
                label={t("sales.return.method")}
                value={method}
                onChange={setMethod}
                options={[
                  { value: "cash", label: t("sales.payment.cash") },
                  { value: "card", label: t("sales.payment.card") },
                ]}
              />
            </div>
          )}
          <Button type="submit" loading={busy}>
            {t("sales.return.submit")}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t("nav.close")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Xato kiritilgan sotuvni bekor qilish — sabab majburiy. */
function CancelForm({
  id,
  onDone,
  onClose,
}: {
  id: number;
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!reason.trim()) return setReasonError(t("sales.cancel.reason_required"));
    setBusy(true);
    try {
      await post(`/sales/${id}/cancel`, { reason: reason.trim() });
      await onDone();
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-3 rounded-control bg-madder-soft p-4">
      <p className="text-sm text-madder">{t("sales.cancel.text")}</p>
      {error && <Alert>{error}</Alert>}
      <TextAreaField
        label={t("sales.cancel.reason")}
        value={reason}
        onChange={(value) => (setReason(value), setReasonError(null))}
        error={reasonError}
        rows={2}
        maxLength={300}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" loading={busy}>
          {t("sales.cancel.yes")}
        </Button>
        {/* "Ha, bekor qilish" yonida — "Yo'q, qolsin" (tasdiq chizig'i qoidasi) */}
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          {t("common.keep")}
        </Button>
      </div>
    </form>
  );
}
