import { useRef, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CalendarClock, CheckCheck, CircleCheck, CreditCard, Eraser, HandCoins, Pencil, Phone, Power, RotateCcw, Wallet } from "lucide-react";
import { useCurrentUser } from "@/modules/auth/AuthProvider";
import { salesKeys } from "@/modules/sales/types";
import { ApiError, api, patch, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { useRequestId } from "@/shared/api/requestId";
import { feedback } from "@/shared/feedback";
import { formatDate, formatDateTime, formatNumber } from "@/shared/format";
import { Avatar } from "@/shared/ui/Avatar";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { MoneyInput, Segmented } from "@/shared/ui/controls";
import { Alert, ConfirmBar, Loading } from "@/shared/ui/feedback";
import { fieldLabel, PhoneField, SelectField, TextAreaField, TextField } from "@/shared/ui/fields";
import { BackLink, Chip, Empty, IconChip, RowAction, rowClass, SectionHeader } from "@/shared/ui/list";
import { PageTitle } from "@/shared/ui/PageTitle";
import { Stat, statGrid } from "@/shared/ui/Stat";
import { num, Table, td, Th } from "@/shared/ui/table";
import { useWide } from "@/shared/useWide";
import {
  creditKeys,
  phoneText,
  type CustomerCard,
  type DebtRow,
  type MoneyMethod,
  type PaymentCreated,
} from "./types";

/** Mijoz kartochkasi: qarzlari, to'lovlar va hisobdan chiqarishlar tarixi; to'lov qabul qilish. */
export function CustomerPage() {
  const id = Number(useParams().id);
  return <CustomerView key={id} id={id} />;
}

function CustomerView({ id }: { id: number }) {
  const { t } = useTranslation();
  const wide = useWide();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const sum = t("settings.units.sum");
  const [mode, setMode] = useState<"view" | "pay" | "edit">("view");
  const [writingOff, setWritingOff] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const card = useQuery({
    queryKey: creditKeys.customer(id),
    queryFn: () => api<CustomerCard>(`/customers/${id}`),
  });
  const customer = card.data;

  /** Qarz o'zgardi: mijozlar ro'yxati va sotuv kartochkalari ham yangilanadi */
  async function changed(message: string) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: creditKeys.all }),
      queryClient.invalidateQueries({ queryKey: salesKeys.all }),
    ]);
    setMode("view");
    setWritingOff(null);
    setNotice(message);
  }

  const back = <BackLink to="/customers">{t(user.role === "owner" ? "nav.credit" : "store.nav.customers")}</BackLink>;

  if (card.isLoading) return <Loading />;
  if (!customer) {
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
  const open = customer.debts.filter((debt) => debt.remaining > 0);

  return (
    <div>
      {back}

      <div className="mt-3">
        <PageTitle
          leading={<Avatar name={customer.name} size="lg" />}
          title={customer.name}
          sub={
            <span className="flex flex-wrap items-center gap-x-1.5 break-words">
              <a
                href={`tel:${customer.phone}`}
                className="inline-flex items-center gap-1.5 whitespace-nowrap hover:underline"
              >
                <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                {phoneText(customer.phone)}
              </a>
              {customer.note && ` · ${customer.note}`}
            </span>
          }
          action={
            mode === "view" && (
              <div className="flex flex-wrap gap-2">
                {customer.debt > 0 && (
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => (setMode("pay"), setNotice(null), setWritingOff(null))}
                  >
                    <HandCoins className="size-4" aria-hidden="true" />
                    {t("credit.pay.open")}
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => (setMode("edit"), setNotice(null))}>
                  <Pencil className="size-4" aria-hidden="true" />
                  {t("common.edit")}
                </Button>
              </div>
            )
          }
        >
          <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 break-words">
            {customer.name}
            {!customer.is_active && <Chip>{t("common.inactive")}</Chip>}
          </span>
        </PageTitle>
      </div>

      <div className="mt-5 space-y-4">
        {notice && <Alert tone="success">{notice}</Alert>}

        {mode === "edit" && (
          <EditForm
            customer={customer}
            onClose={() => setMode("view")}
            onDone={() => changed(t("credit.customer.saved"))}
          />
        )}
        {mode === "pay" && (
          <PaymentForm
            customer={customer}
            debts={open}
            onClose={() => setMode("view")}
            onDone={(result) =>
              changed(
                t("credit.pay.done", { amount: formatNumber(result.amount), debt: formatNumber(result.debt) }),
              )
            }
          />
        )}

        <div className={`${statGrid} lg:grid-cols-3`}>
          <Stat label={t("credit.total_debt")} value={customer.debt} unit={sum} icon={HandCoins} accent="saffron" />
          <Stat
            label={t("credit.overdue")}
            value={customer.overdue}
            unit={sum}
            icon={CalendarClock}
            accent="madder"
            tone={customer.overdue > 0 ? "text-madder" : ""}
          />
          <Stat
            label={t("credit.last_payment")}
            value={customer.last_payment_at ? formatDate(customer.last_payment_at) : "—"}
            icon={Wallet}
            accent="leaf"
          />
        </div>

        {/* Juda keng ekranda: chapda qarzlar, o'ngda to'lovlar va hisobdan chiqarishlar tarixi */}
        <div className="grid gap-4 2xl:grid-cols-2 2xl:items-start">
          <section className="min-w-0 overflow-hidden rounded-card border border-line bg-panel shadow-card">
            <SectionHeader>{t("credit.card.debts")}</SectionHeader>
            {customer.debts.length === 0 && (
              <Empty icon={HandCoins} tone="saffron">
                {t("credit.card.debts_empty")}
              </Empty>
            )}
            <ul className="divide-y divide-line">
              {customer.debts.map((debt) => (
                <li key={debt.id} className={`${rowClass} ${debt.remaining === 0 ? "bg-page/60" : ""}`}>
                  <div className="flex items-start gap-3">
                    <IconChip icon={HandCoins} tone={debt.remaining === 0 ? "neutral" : "saffron"} />
                    <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1 basis-60">
                        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <Link to={`/sales/${debt.sale_id}`} className="font-medium text-indigo hover:underline">
                            {debt.sale_number}
                          </Link>
                          {debt.overdue && <Chip tone="madder">{t("credit.card.overdue_chip")}</Chip>}
                        </p>
                        <p className="break-words text-sm text-muted">
                          {formatDate(debt.created_at)} · {debt.store} · {debt.seller}
                        </p>
                        <p className="text-sm">
                          {[
                            t("credit.card.sale_total", { amount: formatNumber(debt.sale_total) }),
                            debt.initial_payment > 0 &&
                              t("credit.card.initial", { amount: formatNumber(debt.initial_payment) }),
                            debt.paid > 0 && t("credit.card.paid", { amount: formatNumber(debt.paid) }),
                            debt.returned > 0 && t("credit.card.returned", { amount: formatNumber(debt.returned) }),
                            debt.written_off > 0 &&
                              t("credit.card.written_off", { amount: formatNumber(debt.written_off) }),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      {/* Telefonda — pastda: summa o'ngda, amal chapda; keng ekranda — o'ngda ustun bo'lib */}
                      <div className="flex w-full flex-row-reverse flex-wrap items-center justify-between gap-x-4 gap-y-2 text-right sm:w-auto sm:flex-col sm:items-end sm:justify-start sm:gap-y-1.5">
                        {debt.remaining > 0 ? (
                          <>
                            <div>
                              <p
                                className={`whitespace-nowrap font-medium tabular-nums ${debt.overdue ? "text-madder" : ""}`}
                              >
                                {money(debt.remaining)}
                              </p>
                              <p className="text-[13px] text-muted">
                                {debt.days > 0 && `${t("credit.card.days", { count: debt.days })} · `}
                                {t("credit.card.due", { date: formatDate(debt.due_date) })}
                              </p>
                            </div>
                            {writingOff !== debt.id && (
                              <RowAction
                                icon={Eraser}
                                tone="danger"
                                aria-label={t("credit.writeoff.open_for", { number: debt.sale_number })}
                                onClick={() => (setWritingOff(debt.id), setMode("view"), setNotice(null))}
                              >
                                {t("credit.writeoff.open")}
                              </RowAction>
                            )}
                          </>
                        ) : (
                          <Chip tone="leaf" icon={CircleCheck}>
                            {t("credit.card.closed")}
                          </Chip>
                        )}
                      </div>
                    </div>
                  </div>
                  {writingOff === debt.id && (
                    <WriteoffForm
                      debt={debt}
                      onClose={() => setWritingOff(null)}
                      onDone={(amount) => changed(t("credit.writeoff.done", { amount: formatNumber(amount) }))}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>

          <div className="min-w-0 space-y-4">
            <section className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
              <SectionHeader>{t("credit.card.payments")}</SectionHeader>
              {customer.payments.length === 0 && (
                <Empty icon={Wallet} tone="leaf">
                  {t("credit.card.payments_empty")}
                </Empty>
              )}
              {/* Keng ekranda — ixcham jadval (bir qarashda: qachon, qancha, qanday); telefonda — kartochkalar */}
              {wide && customer.payments.length > 0 && (
                <Table
                  flush
                  compact
                  label={t("credit.card.payments")}
                  head={
                    <tr>
                      <Th>{t("sales.list.col_time")}</Th>
                      <Th className="text-right">{t("sales.list.col_amount")}</Th>
                      <Th>{t("sales.payment.label")}</Th>
                      <Th>{t("credit.card.col_sales")}</Th>
                    </tr>
                  }
                >
                  {customer.payments.map((payment) => (
                    <tr key={payment.id} className="align-top">
                      <td className={td}>
                        <span className="whitespace-nowrap">{formatDateTime(payment.created_at)}</span>
                        <span className="block break-words text-[13px] text-muted">
                          {payment.user} · {payment.store}
                        </span>
                      </td>
                      <td className={`${td} ${num} font-medium`}>{formatNumber(payment.amount)}</td>
                      <td className={td}>
                        <Chip
                          tone={payment.method === "cash" ? "leaf" : "sky"}
                          icon={payment.method === "cash" ? Banknote : CreditCard}
                        >
                          {t(`sales.payment.${payment.method}`)}
                        </Chip>
                      </td>
                      <td className={`${td} text-sm`}>
                        {payment.allocations.map((part) => (
                          <span key={part.sale_id} className="block whitespace-nowrap">
                            {t("credit.card.allocated", { number: part.sale_number, amount: formatNumber(part.amount) })}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
              {!wide && (
                <ul className="divide-y divide-line">
                  {customer.payments.map((payment) => (
                    <li key={payment.id} className={`${rowClass} flex items-start gap-3`}>
                      <IconChip icon={Wallet} tone="leaf" />
                      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-4 gap-y-1.5">
                        <div className="min-w-0 flex-1 basis-48">
                          <p className="text-sm">
                            {payment.allocations
                              .map((part) =>
                                t("credit.card.allocated", {
                                  number: part.sale_number,
                                  amount: formatNumber(part.amount),
                                }),
                              )
                              .join(" · ")}
                          </p>
                          <p className="break-words text-[13px] text-muted">
                            {payment.user}, {formatDateTime(payment.created_at)} · {payment.store}
                          </p>
                        </div>
                        <div className="ml-auto flex flex-row-reverse flex-wrap items-center gap-x-2.5 gap-y-1 text-right sm:block">
                          <p className="whitespace-nowrap font-medium tabular-nums">{money(payment.amount)}</p>
                          <p className="sm:mt-0.5">
                            <Chip
                              tone={payment.method === "cash" ? "leaf" : "sky"}
                              icon={payment.method === "cash" ? Banknote : CreditCard}
                            >
                              {t(`sales.payment.${payment.method}`)}
                            </Chip>
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {customer.writeoffs.length > 0 && (
              <section className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
                <SectionHeader>{t("credit.card.writeoffs")}</SectionHeader>
                <ul className="divide-y divide-line">
                  {customer.writeoffs.map((item) => (
                    <li key={item.id} className={`${rowClass} flex items-start gap-3`}>
                      <IconChip icon={Eraser} tone="madder" />
                      <div className="flex min-w-0 flex-1 flex-wrap items-start gap-x-4 gap-y-1.5">
                        <div className="min-w-0 flex-1 basis-48">
                          <p className="font-medium">{item.sale_number}</p>
                          <p className="break-words text-sm">{t("sales.card.reason", { reason: item.reason })}</p>
                          <p className="break-words text-[13px] text-muted">
                            {item.user}, {formatDateTime(item.created_at)}
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
      </div>
    </div>
  );
}

/** Qarz to'lovi: eng eski qarzdan boshlab yopiladi; kerak bo'lsa aniq sotuv tanlanadi. */
function PaymentForm({
  customer,
  debts,
  onDone,
  onClose,
}: {
  customer: CustomerCard;
  debts: DebtRow[];
  onDone: (result: PaymentCreated) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<MoneyMethod>("cash");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Javob yo'qolib tugma qayta bosilsa, to'lov ikki marta yozilmasin: o'sha identifikator bilan qayta ketadi
  const request = useRequestId();

  // To'lov chegarasi: tanlangan qarz yoki mijozning umumiy qarzi
  const limit = target ? (debts.find((debt) => String(debt.id) === target)?.remaining ?? 0) : customer.debt;
  const tooLarge = (debt: number) => t("credit.pay.errors.too_large", { debt: formatNumber(debt) });

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!value) return setError(t("credit.pay.errors.amount"));
    if (value > limit) return setError(tooLarge(limit));
    setBusy(true);
    try {
      const result = await post<PaymentCreated>(`/customers/${customer.id}/payments`, {
        client_uuid: request.current(),
        amount: value,
        method,
        debt_id: target ? Number(target) : null,
      });
      request.settle();
      feedback("cash"); // pul kassaga tushdi
      await onDone(result);
    } catch (failure) {
      request.settle(failure);
      const late = failure instanceof ApiError && failure.code === "payment_too_large";
      setError(late ? tooLarge(Number(failure.details.debt)) : errorText(failure));
      setBusy(false);
    }
  }

  return (
    <Card title={t("credit.pay.title")} icon={Wallet} tone="leaf">
      <form onSubmit={save} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div>
            <p className={fieldLabel}>{t("credit.pay.amount")}</p>
            <MoneyInput
              label={t("credit.pay.amount")}
              value={amount}
              onChange={(value) => (setAmount(value), setError(null))}
              invalid={Number(amount) > limit}
              className="w-44"
            />
          </div>
          <div>
            <p className={fieldLabel}>{t("credit.pay.method")}</p>
            <Segmented<MoneyMethod>
              label={t("credit.pay.method")}
              value={method}
              onChange={setMethod}
              options={[
                { value: "cash", label: t("sales.payment.cash") },
                { value: "card", label: t("sales.payment.card") },
              ]}
            />
          </div>
          <RowAction
            icon={CheckCheck}
            className="mb-1.5"
            onClick={() => (setAmount(String(limit)), setError(null))}
          >
            {t("credit.pay.all", { amount: formatNumber(limit) })}
          </RowAction>
        </div>
        {debts.length > 1 && (
          <div className="max-w-md">
            <SelectField
              label={t("credit.pay.target")}
              value={target}
              onChange={(value) => (setTarget(value), setError(null))}
            >
              <option value="">{t("credit.pay.oldest_first")}</option>
              {debts.map((debt) => (
                <option key={debt.id} value={debt.id}>
                  {t("credit.pay.target_option", {
                    number: debt.sale_number,
                    amount: formatNumber(debt.remaining),
                  })}
                </option>
              ))}
            </SelectField>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="success" loading={busy}>
            {t("credit.pay.submit")}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t("nav.close")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Hisobdan chiqarish: summa (boshida — qolgan qarzning hammasi) va majburiy sabab. */
function WriteoffForm({
  debt,
  onDone,
  onClose,
}: {
  debt: DebtRow;
  onDone: (amount: number) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [amount, setAmount] = useState(String(debt.remaining));
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const value = Number(amount);
    if (!value) return setError(t("credit.pay.errors.amount"));
    if (value > debt.remaining) {
      return setError(t("credit.pay.errors.too_large", { debt: formatNumber(debt.remaining) }));
    }
    if (!reason.trim()) return setReasonError(t("credit.writeoff.reason_required"));
    setBusy(true);
    try {
      await post(`/debts/${debt.id}/writeoff`, { amount: value, reason: reason.trim() });
      await onDone(value);
    } catch (failure) {
      setError(errorText(failure));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="mt-3 space-y-3 rounded-control bg-madder-soft p-4">
      <p className="text-sm text-madder">{t("credit.writeoff.text")}</p>
      {error && <Alert>{error}</Alert>}
      <div>
        <p className={fieldLabel}>{t("credit.writeoff.amount")}</p>
        <MoneyInput
          label={t("credit.writeoff.amount")}
          value={amount}
          onChange={(value) => (setAmount(value), setError(null))}
          invalid={Number(amount) > debt.remaining}
          className="w-44"
        />
      </div>
      <TextAreaField
        label={t("credit.writeoff.reason")}
        value={reason}
        onChange={(value) => (setReason(value), setReasonError(null))}
        error={reasonError}
        rows={2}
        maxLength={300}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" loading={busy}>
          {t("credit.writeoff.submit")}
        </Button>
        {/* "Ha, hisobdan chiqarish" yonida — "Yo'q, qolsin" (tasdiq chizig'i qoidasi) */}
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          {t("common.keep")}
        </Button>
      </div>
    </form>
  );
}

/** Mijozni tahrirlash; qarzi bo'lmasa — faolsizlantirish (mijoz o'chirilmaydi). */
function EditForm({
  customer,
  onDone,
  onClose,
}: {
  customer: CustomerCard;
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone.replace(/^\+998/, ""));
  const [note, setNote] = useState(customer.note ?? "");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const offRef = useRef<HTMLButtonElement | null>(null);

  const nameError = checked && name.trim().length < 2 ? t("credit.customer.name_short") : null;
  const phoneError = checked && phone.length !== 9 ? t("login.phone_incomplete") : null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onDone();
    } catch (failure) {
      const taken = failure instanceof ApiError && failure.code === "customer_phone_taken";
      setError(
        taken && failure.details.name
          ? t("credit.customer.taken", { name: String(failure.details.name) })
          : errorText(failure),
      );
      setBusy(false);
    }
  }

  function save(event: FormEvent) {
    event.preventDefault();
    setChecked(true);
    if (name.trim().length < 2 || phone.length !== 9) return;
    void run(() =>
      patch(`/customers/${customer.id}`, { name: name.trim(), phone: `+998${phone}`, note: note.trim() || null }),
    );
  }

  return (
    <Card title={t("credit.customer.edit")} icon={Pencil} tone="saffron">
      <form onSubmit={save} noValidate className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label={t("credit.customer.name")}
            value={name}
            onChange={setName}
            error={nameError}
            maxLength={100}
            autoComplete="off"
          />
          <PhoneField
            label={t("credit.customer.phone")}
            value={phone}
            onChange={setPhone}
            error={phoneError}
            autoComplete="off"
          />
        </div>
        <TextField
          label={t("credit.customer.note")}
          value={note}
          onChange={setNote}
          hint={t("common.optional")}
          placeholder={t("credit.customer.note_placeholder")}
          maxLength={200}
        />
        {/* ref: tasdiq yopilganda fokus faolsizlantirish tugmasiga qaytadi (Button ref qabul qilmaydi) */}
        <div
          ref={(el) => (offRef.current = el?.querySelector<HTMLButtonElement>("button.ml-auto") ?? null)}
          className="flex flex-wrap items-center gap-2"
        >
          <Button type="submit" loading={busy}>
            {t("common.save")}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t("nav.close")}
          </Button>
          {/* Qarzi bor mijoz faolsizlantirilmaydi; faolsizlantirish — tasdiq bilan (xodim va joylar kabi) */}
          {(customer.debt === 0 || !customer.is_active) && (
            <Button
              variant="ghost"
              className="ml-auto"
              disabled={busy || confirmOff}
              aria-expanded={customer.is_active ? confirmOff : undefined}
              onClick={() =>
                customer.is_active
                  ? setConfirmOff(true)
                  : void run(() => post(`/customers/${customer.id}/active`, { is_active: true }))
              }
            >
              {customer.is_active ? (
                <Power className="size-4" aria-hidden="true" />
              ) : (
                <RotateCcw className="size-4" aria-hidden="true" />
              )}
              {t(customer.is_active ? "common.deactivate" : "common.activate")}
            </Button>
          )}
        </div>
        {confirmOff && (
          <ConfirmBar
            text={t("credit.customer.deactivate_confirm", {
              defaultValue: "Mijoz faolsizlantirilsinmi? Tarixi saqlanadi.",
            })}
            confirmLabel={t("structure.deactivate_yes")}
            busy={busy}
            returnFocusTo={offRef}
            onConfirm={() => void run(() => post(`/customers/${customer.id}/active`, { is_active: false }))}
            onCancel={() => setConfirmOff(false)}
          />
        )}
      </form>
    </Card>
  );
}
