import { useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Ban,
  Banknote,
  Lock,
  PackageCheck,
  PackagePlus,
  Pencil,
  RotateCcw,
  Ruler,
  Scale,
  Send,
  ShoppingCart,
  Store,
  Undo2,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import { useCurrentUser } from "@/modules/auth/AuthProvider";
import { Thumb } from "@/modules/catalog/parts";
import { LabelPrinter } from "@/modules/receiving/Labels";
import { receivingKeys } from "@/modules/receiving/types";
import { api, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDate, formatDateTime, formatDecimal, formatNumber, trimDecimal } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Alert, ConfirmBar, Loading } from "@/shared/ui/feedback";
import { TextField } from "@/shared/ui/fields";
import { BackLink, Chip, Fact, IconChip, RowAction, rowClass, rowClassCompact, SectionHeader } from "@/shared/ui/list";
import { PageTitle } from "@/shared/ui/PageTitle";
import type { Tone } from "@/shared/ui/tones";
import { inventoryKeys, skuNames, type BatchCard, type BatchPlace } from "./types";

/** Farq shu ulushdan (kirgan metrga nisbatan) katta bo'lsa — yopishdan oldin qo'shimcha ogohlantiriladi */
const BIG_DIFFERENCE = 0.1;

/** Harakat turining belgisi va rangi (tarix qatorlarida); ro'yxatda yo'q tur — kulrang umumiy belgi */
const MOVEMENTS: Record<string, [LucideIcon, Tone]> = {
  receipt: [PackagePlus, "leaf"],
  receipt_cancel: [Ban, "neutral"],
  transfer_out: [Send, "coral"],
  transfer_in: [PackageCheck, "sky"],
  transfer_cancel: [Ban, "neutral"],
  sale: [ShoppingCart, "leaf"],
  sale_cancel: [Ban, "neutral"],
  return: [Undo2, "saffron"],
  close: [Lock, "neutral"],
  reopen: [RotateCcw, "neutral"],
  correction: [Pencil, "neutral"],
};
const OTHER_MOVEMENT: [LucideIcon, Tone] = [Activity, "neutral"];

/** Partiya kartochkasi: joylar bo'yicha qoldiq, yopish / qayta ochish, harakatlar tarixi, etiketka. */
export function BatchPage() {
  const id = Number(useParams().id);
  return <BatchView key={id} id={id} />;
}

function BatchView({ id }: { id: number }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const staff = user.role !== "seller"; // kirim sahifalari sotuvchiga yopiq
  // Qayerdan kelindi: "Partiyani yopish" sahifasidan bo'lsa — ortga o'sha yerga (keyingi partiyani yopish uchun)
  const from = (useLocation().state as { from?: string } | null)?.from;
  const backTo = from === "/close" ? "/close" : "/stock";

  const card = useQuery({
    queryKey: inventoryKeys.batch(id),
    queryFn: () => api<BatchCard>(`/batches/${id}`),
  });
  const batch = card.data;

  const [closing, setClosing] = useState<number | null>(null); // yopilayotgan joy
  const [reopening, setReopening] = useState<number | null>(null); // qayta ochish tasdiqlanayotgan joy
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const trigger = useRef<HTMLElement | null>(null); // tasdiq yopilganda fokus qaytadigan tugma

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setClosing(null);
      setReopening(null);
      setNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: receivingKeys.all }),
      ]);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  /** Yopish panelini ochadi; ochgan tugma eslab qolinadi — panel yopilganda fokus unga qaytadi */
  function startClosing(locationId: number, event: MouseEvent<HTMLButtonElement>) {
    trigger.current = event.currentTarget;
    setNote("");
    setError(null);
    setClosing(locationId);
  }
  function stopClosing() {
    setClosing(null);
    setError(null);
    // Tugma panel ochiq paytda o'chirilgan — qayta chizilgach fokus oladi
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  }

  const back = <BackLink to={backTo}>{t(from === "/close" ? "inventory.close.title" : "inventory.tab_stock")}</BackLink>;

  if (card.isLoading) return <Loading />;
  if (!batch) {
    return (
      <div className="space-y-4">
        {back}
        <Alert>{errorText(card.error)}</Alert>
      </div>
    );
  }

  return (
    <div>
      {back}

      <div className="mt-3">
        <PageTitle
          leading={<Thumb imageUrl={batch.sku.image_url} hex={batch.sku.hex} code={batch.sku.code} size="lg" />}
          sub={
            <span className="break-words">
              {batch.sku.code} · {skuNames(batch.sku)}
            </span>
          }
          title={`${t("inventory.batch.title")} ${batch.number}`}
        >
          {t("inventory.batch.title")} {batch.number}
        </PageTitle>
      </div>

      <div className="mt-5 space-y-4">
        {/* Yopish tugmasi sahifaning o'rtasida bo'lishi mumkin — xato ko'rinadigan joyga suriladi */}
        {error && <Alert focus>{error}</Alert>}

        <Card>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact
              icon={PackagePlus}
              tone="sky"
              label={t("receiving.receipt")}
              sub={formatDate(`${batch.receipt.receipt_date}T12:00:00+05:00`)}
            >
              {staff ? (
                <Link to={`/receiving/${batch.receipt.id}`} className="text-indigo hover:underline">
                  {batch.receipt.number}
                </Link>
              ) : (
                batch.receipt.number
              )}
            </Fact>
            <Fact
              icon={Ruler}
              tone="sky"
              label={t("inventory.batch.labeled")}
              sub={t("receiving.rolls_value", { count: batch.rolls_count })}
            >
              <span className="tabular-nums">{formatDecimal(batch.meters_labeled)} m</span>
            </Fact>
            <Fact
              icon={Scale}
              label={t("receiving.coefficient")}
              sub={batch.kg !== null ? `${formatDecimal(batch.kg)} kg` : undefined}
            >
              <span className="tabular-nums">
                {batch.m_per_kg === null ? "—" : `${trimDecimal(batch.m_per_kg)} m`}
              </span>
            </Fact>
            {/* Tannarx — faqat biznes egasiga (server boshqalarga yubormaydi) */}
            {batch.cost_per_m !== null && (
              <Fact icon={Banknote} tone="leaf" label={t("inventory.batch.cost")}>
                <span className="tabular-nums">
                  {formatNumber(batch.cost_per_m)} {t("settings.units.sum")}
                </span>
              </Fact>
            )}
          </dl>
        </Card>

        {/* Juda keng ekranda joylar va tarix yonma-yon turadi */}
        <div className="grid gap-4 2xl:grid-cols-2 2xl:items-start">
          <section className="min-w-0 overflow-hidden rounded-card border border-line bg-panel shadow-card">
            <SectionHeader>{t("inventory.batch.places")}</SectionHeader>
            <ul className="divide-y divide-line">
              {batch.places.map((place) => {
                const closed = place.status === "closed";
                const confirming = closing === place.location.id || reopening === place.location.id;
                return (
                  <li key={place.location.id} className={`${rowClass} ${closed ? "bg-page/60" : ""}`}>
                    <div className="flex items-start gap-3">
                      {/* Do'kon — yashil, sklad — feruza; yopilgan joy — kulrang */}
                      <IconChip
                        icon={place.location.type === "store" ? Store : Warehouse}
                        tone={closed ? "neutral" : place.location.type === "store" ? "leaf" : "sky"}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                          <p className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                            <span className="min-w-0 break-words font-medium">{place.location.name}</span>
                            {closed && (
                              <Chip tone="neutral" icon={Lock}>
                                {t("inventory.batch.closed")}
                              </Chip>
                            )}
                          </p>
                          <p className={`whitespace-nowrap tabular-nums ${Number(place.qty_m) < 0 ? "text-madder" : ""}`}>
                            <span className="font-semibold">{formatDecimal(place.qty_m)} m</span>
                            {place.status === "open" && (
                              <span className="ml-2 text-sm text-muted">
                                {t("inventory.rolls_about", { count: place.rolls })}
                              </span>
                            )}
                          </p>
                        </div>
                        <p className="mt-0.5 text-sm tabular-nums text-muted">
                          {t("inventory.batch.received", { meters: formatDecimal(place.received_m) })}
                        </p>
                        {place.closure && <ClosureNote place={place} />}
                      </div>
                    </div>

                    {/* Tugmalar tasdiq ochiq paytda ham joyida turadi (o'chirilgan) — fokus va joylashuv sakramaydi */}
                    {(place.can_close || place.can_reopen) && (
                      <div className="mt-3 flex flex-wrap gap-2 pl-[52px]">
                        {place.can_close && (
                          <RowAction
                            icon={Lock}
                            disabled={confirming}
                            aria-expanded={closing === place.location.id}
                            onClick={(event) => startClosing(place.location.id, event)}
                          >
                            {t("inventory.batch.close")}
                          </RowAction>
                        )}
                        {place.can_reopen && (
                          <RowAction
                            icon={RotateCcw}
                            tone="success"
                            disabled={busy || confirming}
                            aria-expanded={reopening === place.location.id}
                            onClick={(event) => {
                              trigger.current = event.currentTarget;
                              setError(null);
                              setReopening(place.location.id);
                            }}
                          >
                            {t("inventory.batch.reopen")}
                          </RowAction>
                        )}
                      </div>
                    )}
                    {closing === place.location.id && (
                      <ClosePanel
                        place={place}
                        note={note}
                        onNote={setNote}
                        busy={busy}
                        onCancel={stopClosing}
                        onConfirm={() =>
                          void run(() =>
                            post(`/batches/${id}/close`, {
                              location_id: place.location.id,
                              note: note.trim() || null,
                            }),
                          )
                        }
                      />
                    )}
                    {reopening === place.location.id && (
                      <div className="mt-3">
                        <ConfirmBar
                          text={t("inventory.batch.reopen_confirm", { place: place.location.name })}
                          confirmLabel={t("inventory.batch.reopen_yes")}
                          danger={false}
                          busy={busy}
                          onConfirm={() =>
                            void run(() => post(`/batches/${id}/reopen`, { location_id: place.location.id }))
                          }
                          onCancel={() => setReopening(null)}
                          returnFocusTo={trigger}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {batch.in_transit.length > 0 && (
              <ul className="divide-y divide-line border-t border-line bg-indigo-soft/40">
                {batch.in_transit.map((transit) => (
                  <li
                    key={transit.transfer_id}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm ${rowClassCompact}`}
                  >
                    <Chip tone="indigo" icon={Send}>
                      {t("inventory.in_transit")}
                    </Chip>
                    <Link to={`/transfers/${transit.transfer_id}`} className="text-indigo hover:underline">
                      {transit.number}
                    </Link>
                    <span className="min-w-0 break-words text-muted">
                      {transit.source.name} → {transit.target.name}
                    </span>
                    <span className="ml-auto whitespace-nowrap font-medium tabular-nums">
                      {formatDecimal(transit.sent_m)} m
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="min-w-0 overflow-hidden rounded-card border border-line bg-panel shadow-card">
            <SectionHeader>{t("inventory.batch.history")}</SectionHeader>
            <ul className="divide-y divide-line">
              {batch.movements.map((movement) => {
                const qty = Number(movement.qty_m);
                const [icon, tone] = MOVEMENTS[movement.type] ?? OTHER_MOVEMENT;
                const link =
                  movement.ref_type === "transfer"
                    ? `/transfers/${movement.ref_id}`
                    : movement.ref_type === "receipt" && staff
                      ? `/receiving/${movement.ref_id}`
                      : null;
                return (
                  <li key={movement.id} className={`flex items-start gap-3 ${rowClassCompact}`}>
                    <IconChip icon={icon} tone={tone} size="sm" className="mt-0.5" />
                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-4 gap-y-0.5">
                      <span className="min-w-0 flex-1 basis-44">
                        <span className="font-medium">
                          {t(`inventory.movement.${movement.type}`, { defaultValue: movement.type })}
                        </span>
                        {movement.ref_number &&
                          (link ? (
                            <Link to={link} className="ml-2 text-sm text-indigo hover:underline">
                              {movement.ref_number}
                            </Link>
                          ) : (
                            <span className="ml-2 text-sm text-muted">{movement.ref_number}</span>
                          ))}
                        <span className="block break-words text-[13px] text-muted">
                          {formatDateTime(movement.created_at)} · {movement.location.name}
                          {movement.user && ` · ${movement.user}`}
                          {movement.note && ` · ${movement.note}`}
                        </span>
                      </span>
                      <span
                        className={`whitespace-nowrap font-medium tabular-nums ${
                          qty > 0 ? "text-leaf" : qty < 0 ? "text-ink" : "text-muted"
                        }`}
                      >
                        {qty > 0 ? "+" : ""}
                        {formatDecimal(movement.qty_m)} m
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <LabelPrinter
          receiptDate={batch.receipt.receipt_date}
          items={[
            {
              id: batch.id,
              number: batch.number,
              code: batch.sku.code,
              names: skuNames(batch.sku),
              copies: 1, // yo'qolgan etiketka o'rniga — odatda bitta kerak
            },
          ]}
        />
      </div>
    </div>
  );
}

/** Yopilgan joydagi metr farqi: [50 m kam chiqdi] 1 500 000 so'm  Nodira, 02.10.2026 — farq rangli yorliqda */
function ClosureNote({ place }: { place: BatchPlace }) {
  const { t } = useTranslation();
  const closure = place.closure;
  if (!closure) return null;
  const diff = Number(closure.diff_m);
  const meters = formatDecimal(String(Math.abs(diff)));
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      <Chip tone={diff > 0 ? "madder" : diff < 0 ? "saffron" : "neutral"}>
        {diff > 0
          ? t("inventory.diff.short", { meters })
          : diff < 0
            ? t("inventory.diff.over", { meters })
            : t("inventory.diff.none")}
      </Chip>
      {closure.diff_amount !== null && diff !== 0 && (
        <span className="whitespace-nowrap font-medium tabular-nums">
          {formatNumber(Math.abs(closure.diff_amount))} {t("settings.units.sum")}
        </span>
      )}
      <span className="min-w-0 break-words text-muted">
        {closure.closed_by}, {formatDateTime(closure.closed_at)}
        {closure.note && ` · ${closure.note}`}
      </span>
    </p>
  );
}

/** Yopishni tasdiqlash: kirgan, chiqqan, tizimdagi qoldiq va natijada chiqadigan metr farqi. */
function ClosePanel({
  place,
  note,
  onNote,
  busy,
  onCancel,
  onConfirm,
}: {
  place: BatchPlace;
  note: string;
  onNote: (note: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const received = Number(place.received_m);
  const left = Number(place.qty_m);
  const out = String(Math.round((received - left) * 100) / 100);
  const meters = formatDecimal(String(Math.abs(left)));
  const big = received > 0 && Math.abs(left) / received > BIG_DIFFERENCE;
  return (
    <div className="mt-3 max-w-xl space-y-3 rounded-control border border-line bg-page p-4">
      <p className="font-medium">{t("inventory.close.question")}</p>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div className="min-w-0">
          <dt className="text-[13px] text-muted">{t("inventory.close.received")}</dt>
          <dd className="font-medium tabular-nums">{formatDecimal(place.received_m)} m</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[13px] text-muted">{t("inventory.close.out")}</dt>
          <dd className="font-medium tabular-nums">{formatDecimal(out)} m</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[13px] text-muted">{t("inventory.close.left")}</dt>
          <dd className="font-semibold tabular-nums">{formatDecimal(place.qty_m)} m</dd>
        </div>
      </dl>
      <p className={`text-sm ${left > 0 ? "text-madder" : left < 0 ? "text-saffron" : "text-muted"}`}>
        {left > 0
          ? t("inventory.close.will_short", { meters })
          : left < 0
            ? t("inventory.close.will_over", { meters })
            : t("inventory.close.will_none")}
      </p>
      {big && (
        <p className="rounded-control bg-saffron-soft px-3.5 py-2.5 text-sm text-saffron">
          {t("inventory.close.big", { percent: Math.round((Math.abs(left) / received) * 100) })}
        </p>
      )}
      <TextField
        label={t("receiving.note")}
        value={note}
        onChange={onNote}
        hint={t("common.optional")}
        maxLength={500}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={big ? "danger" : "primary"} loading={busy} onClick={onConfirm}>
          {t("inventory.close.confirm")}
        </Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>
          {t("common.keep")}
        </Button>
      </div>
    </div>
  );
}
