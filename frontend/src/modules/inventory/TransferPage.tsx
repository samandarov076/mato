import { useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowRight, Ban, StickyNote, Store, UserCheck, UserRound, UserX, Warehouse } from "lucide-react";
import { Thumb } from "@/modules/catalog/parts";
import { ApiError, api, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDateTime, formatDecimal, trimDecimal } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Alert, ConfirmBar, Loading } from "@/shared/ui/feedback";
import { fieldLabel, TextAreaField } from "@/shared/ui/fields";
import { BackLink, Fact, IconChip, rowClass, sectionStrip } from "@/shared/ui/list";
import { PageTitle } from "@/shared/ui/PageTitle";
import { focusRing } from "@/shared/ui/tones";
import { TransferStatusChip } from "./TransfersPage";
import {
  inventoryKeys,
  metersForRolls,
  skuNames,
  type Place,
  type TransferCard,
  type TransferLine,
} from "./types";

type Got = { rolls: string; meters: string };

const cell =
  "h-11 w-full rounded-control border bg-panel px-3 text-right text-[16px] tabular-nums transition-colors";
const cellOk = `border-edge focus:border-indigo ${focusRing}`;
const cellBad = `border-madder ${focusRing} focus-visible:ring-madder`;
// Keng ekranda ustunlar: partiya · jo'natilgan rulon · jo'natilgan metr · kelgan rulon · kelgan metr · farq
const columns = "md:grid-cols-[minmax(0,1.6fr)_80px_100px_100px_120px_110px]";

/** Kelgan metr: 0 va undan katta, ko'pi bilan 2 kasr xona ("188", "187,5"). Yaroqsiz bo'lsa — null. */
function parseMeters(text: string): number | null {
  const value = text.trim().replace(",", ".");
  return /^\d{1,7}(\.\d{1,2})?$/.test(value) ? Number(value) : null;
}

/** Farq: jo'natilgan − kelgan. Kam kelgan — qizil, ortiq kelgan — sariq, farq yo'q — chiziqcha. */
function Difference({ sent, got }: { sent: number; got: number | null }) {
  const { t } = useTranslation();
  if (got === null) return <span className="text-muted">—</span>;
  const diff = Math.round((sent - got) * 100) / 100;
  if (diff === 0) return <span className="text-muted">—</span>;
  const meters = formatDecimal(String(Math.abs(diff)));
  return diff > 0 ? (
    <span className="font-medium tabular-nums text-madder">{t("inventory.receive.short", { meters })}</span>
  ) : (
    <span className="font-medium tabular-nums text-saffron">{t("inventory.receive.over", { meters })}</span>
  );
}

/** Joy: do'kon — yashil, sklad — feruza belgi bilan (Tuzilma bo'limidagi kabi). */
function PlaceName({ place }: { place: Place }) {
  const store = place.type === "store";
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <IconChip icon={store ? Store : Warehouse} tone={store ? "leaf" : "sky"} size="sm" />
      <span className="min-w-0 break-words">{place.name}</span>
    </span>
  );
}

/** Ko'chirish kartochkasi: yo'lda bo'lsa — qabul qilish (kelgan rulon va metrni tasdiqlash) yoki bekor qilish. */
export function TransferPage() {
  const id = Number(useParams().id);
  return <TransferView key={id} id={id} />;
}

function TransferView({ id }: { id: number }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  // Yaratish sahifasidan hozirgina jo'natilgan — tasdiq xabari ko'rsatiladi
  const justSent = Boolean((useLocation().state as { sent?: boolean } | null)?.sent);

  const card = useQuery({
    queryKey: inventoryKeys.transfer(id),
    queryFn: () => api<TransferCard>(`/transfers/${id}`),
  });
  const transfer = card.data;

  // "Kelgan" maydonlari jo'natilgan qiymatlar bilan oldindan to'ldirilgan; foydalanuvchi tegsa — shu yerda saqlanadi
  const [edited, setEdited] = useState<Record<number, Got>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null); // qabul qilindi — natija xabari
  const [noteError, setNoteError] = useState<string | null>(null);
  const [receiveError, setReceiveError] = useState<string | null>(null); // tugma yonidagi xato xulosasi
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelTrigger = useRef<HTMLElement | null>(null); // tasdiq yopilganda fokus shu tugmaga qaytadi

  const got = (line: TransferLine): Got =>
    edited[line.id] ?? { rolls: String(line.sent_rolls), meters: trimDecimal(line.sent_m) };

  function setRolls(line: TransferLine, value: string) {
    const rolls = value.replace(/\D/g, "").slice(0, 5);
    // Kelgan rulon o'zgarsa — metr o'rtacha rulon uzunligi bo'yicha qayta hisoblanadi (qo'lda tuzatsa bo'ladi)
    const meters =
      rolls === String(line.sent_rolls) ? trimDecimal(line.sent_m) : metersForRolls(rolls, line.roll_m);
    setEdited({ ...edited, [line.id]: { rolls, meters: meters === "" ? got(line).meters : meters } });
  }

  async function run(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      return true;
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.fields?.note
          ? t("inventory.receive.note_required")
          : errorText(failure),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  const back = <BackLink to="/transfers">{t("inventory.tab_transfers")}</BackLink>;

  if (card.isLoading) return <Loading />;
  if (!transfer) {
    return (
      <div className="space-y-4">
        {back}
        <Alert>{errorText(card.error)}</Alert>
      </div>
    );
  }

  const receiving = transfer.can_receive;
  const invalid = transfer.lines.some(
    (line) => parseMeters(got(line).meters) === null || !/^\d+$/.test(got(line).rolls),
  );
  const differs = transfer.lines.some(
    (line) =>
      parseMeters(got(line).meters) !== Number(line.sent_m) || got(line).rolls !== String(line.sent_rolls),
  );

  async function receive(event: FormEvent) {
    event.preventDefault();
    if (!transfer) return;
    if (invalid) {
      // Yaroqsiz qator tepada: tugma yonida xulosa, ekran esa birinchi xatoga suriladi
      setReceiveError(t("receiving.errors.check_fields"));
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        field?.scrollIntoView?.({ block: "center", behavior: "smooth" });
        field?.focus({ preventScroll: true });
      });
      return;
    }
    setReceiveError(null);
    if (differs && note.trim() === "") return setNoteError(t("inventory.receive.note_required"));
    setNoteError(null);
    const withDiff = differs;
    const done = await run(() =>
      post(`/transfers/${id}/receive`, {
        note: note.trim() || null,
        lines: transfer.lines.map((line) => ({
          line_id: line.id,
          rolls: Number(got(line).rolls),
          meters: String(parseMeters(got(line).meters)),
        })),
      }),
    );
    if (done) setNotice(t(withDiff ? "inventory.receive.done_diff" : "inventory.receive.done"));
  }

  return (
    <div>
      {back}

      <div className="mt-3">
        <PageTitle
          icon={ArrowLeftRight}
          tone="coral"
          sub={<TransferStatusChip status={transfer.status} hasDiff={transfer.has_diff} />}
          action={
            transfer.can_cancel && (
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
                {t("inventory.transfer.cancel")}
              </Button>
            )
          }
        >
          {t("inventory.transfer.title")} {transfer.number}
        </PageTitle>
      </div>

      <div className="mt-5 space-y-4">
        {justSent && notice === null && transfer.status === "in_transit" && (
          <Alert tone="success">{t("inventory.transfer.sent_done")}</Alert>
        )}
        {notice && <Alert tone="success">{notice}</Alert>}
        {/* Qabul qilish tugmasi sahifaning pastida — xato tepada chiqsa ham ko'rinadigan joyga suriladi */}
        {error && <Alert focus>{error}</Alert>}
        {confirmCancel && (
          <ConfirmBar
            text={t("inventory.transfer.cancel_confirm", { place: transfer.source.name })}
            confirmLabel={t("inventory.transfer.cancel_yes")}
            onConfirm={() =>
              void run(() => post(`/transfers/${id}/cancel`)).then((done) => done && setConfirmCancel(false))
            }
            onCancel={() => setConfirmCancel(false)}
            busy={busy}
            returnFocusTo={cancelTrigger}
          />
        )}

        {/* Juda keng ekranda: chapda — kim, qayerdan, qayerga; o'ngda — partiyalar va qabul qilish */}
        <div className="grid items-start gap-4 2xl:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
          <Card>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[17px] font-medium">
              <PlaceName place={transfer.source} />
              <ArrowRight className="size-5 shrink-0 text-muted" aria-hidden="true" />
              <PlaceName place={transfer.target} />
            </div>
            <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-line pt-5 sm:grid-cols-3 2xl:grid-cols-1">
              <Fact
                icon={UserRound}
                tone="indigo"
                label={t("inventory.transfer.sent_by")}
                sub={formatDateTime(transfer.sent_at)}
              >
                {transfer.sent_by.name}
              </Fact>
              {/* Hali qabul qilinmagan bo'lsa — belgi rangsiz */}
              <Fact
                icon={UserCheck}
                tone={transfer.received_by ? "leaf" : "neutral"}
                label={t("inventory.transfer.received_by")}
                sub={transfer.received_at && formatDateTime(transfer.received_at)}
              >
                {transfer.received_by?.name ?? "—"}
              </Fact>
              {transfer.cancelled_by && transfer.cancelled_at && (
                <Fact
                  icon={UserX}
                  tone="neutral"
                  label={t("inventory.transfer.cancelled_by")}
                  sub={formatDateTime(transfer.cancelled_at)}
                >
                  {transfer.cancelled_by.name}
                </Fact>
              )}
            </dl>
            {transfer.note && (
              <p className="mt-5 flex items-start gap-2.5 border-t border-line pt-4">
                <StickyNote className="mt-1 size-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 break-words">{transfer.note}</span>
              </p>
            )}
          </Card>

          <form onSubmit={receive} noValidate className="min-w-0 space-y-4">
            <section className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
              <div className={`${sectionStrip} hidden items-center gap-x-4 md:grid ${columns}`}>
                <span>{t("inventory.receive.col_batch")}</span>
                <span className="text-right">{t("inventory.receive.col_sent_rolls")}</span>
                <span className="text-right">{t("inventory.receive.col_sent_m")}</span>
                <span className="text-right">{t("inventory.receive.col_got_rolls")}</span>
                <span className="text-right">{t("inventory.receive.col_got_m")}</span>
                <span className="text-right">{t("inventory.receive.col_diff")}</span>
              </div>
              <ul className="divide-y divide-line">
                {transfer.lines.map((line) => {
                  const value = got(line);
                  const meters = receiving
                    ? parseMeters(value.meters)
                    : line.received_m === null
                      ? null
                      : Number(line.received_m);
                  // Qabul qilayotganda yaroqsiz qiymat — sababi qator ostida yoziladi (qizil chegaraning o'zi yetmaydi)
                  const lineIssue = !receiving
                    ? null
                    : meters === null
                      ? t("inventory.transfer.errors.meters")
                      : !/^\d+$/.test(value.rolls)
                        ? t("inventory.transfer.errors.rolls")
                        : null;
                  return (
                    <li key={line.id} className={`grid items-center gap-x-4 gap-y-2 ${rowClass} ${columns}`}>
                      <span className="flex min-w-0 items-center gap-3">
                        <Thumb imageUrl={line.sku.image_url} hex={line.sku.hex} code={line.sku.code} />
                        <span className="min-w-0">
                          <Link to={`/batches/${line.batch_id}`} className="font-medium text-indigo hover:underline">
                            {line.batch_number}
                          </Link>
                          <span className="block truncate text-sm text-muted">
                            {line.sku.code} · {skuNames(line.sku)}
                          </span>
                        </span>
                      </span>
                      {/* Telefon: jo'natilgan miqdor bitta qatorda */}
                      <span className="text-sm text-muted md:hidden">
                        {t("inventory.receive.sent_line", {
                          count: line.sent_rolls,
                          meters: formatDecimal(line.sent_m),
                        })}
                      </span>
                      <span className="hidden text-right tabular-nums md:block">{line.sent_rolls}</span>
                      <span className="hidden text-right tabular-nums md:block">{formatDecimal(line.sent_m)}</span>
                      {receiving ? (
                        <div className="grid grid-cols-2 gap-3 md:contents">
                          <label>
                            <span className={`${fieldLabel} md:hidden`}>{t("inventory.receive.col_got_rolls")}</span>
                            <input
                              aria-label={t("inventory.receive.got_rolls_for", { number: line.batch_number })}
                              inputMode="numeric"
                              value={value.rolls}
                              aria-invalid={/^\d+$/.test(value.rolls) ? undefined : true}
                              onChange={(e) => setRolls(line, e.target.value)}
                              className={`${cell} ${/^\d+$/.test(value.rolls) ? cellOk : cellBad}`}
                            />
                          </label>
                          <label>
                            <span className={`${fieldLabel} md:hidden`}>{t("inventory.receive.col_got_m")}</span>
                            <input
                              aria-label={t("inventory.receive.got_m_for", { number: line.batch_number })}
                              inputMode="decimal"
                              value={value.meters}
                              aria-invalid={meters === null ? true : undefined}
                              onChange={(e) =>
                                setEdited({ ...edited, [line.id]: { ...value, meters: e.target.value } })
                              }
                              className={`${cell} ${meters === null ? cellBad : cellOk}`}
                            />
                          </label>
                        </div>
                      ) : (
                        <>
                          <span className="hidden text-right tabular-nums md:block">
                            {line.received_rolls ?? "—"}
                          </span>
                          <span className="hidden text-right tabular-nums md:block">
                            {line.received_m === null ? "—" : formatDecimal(line.received_m)}
                          </span>
                          {line.received_m !== null && (
                            <span className="text-sm md:hidden">
                              {t("inventory.receive.got_line", {
                                count: line.received_rolls ?? 0,
                                meters: formatDecimal(line.received_m),
                              })}
                            </span>
                          )}
                        </>
                      )}
                      <span className="text-sm md:text-right">
                        <Difference sent={Number(line.sent_m)} got={meters} />
                      </span>
                      {lineIssue && (
                        <p role="alert" className="text-sm text-madder md:col-span-6">
                          {lineIssue}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>

            {transfer.receive_note && (
              <Card title={t("inventory.receive.note")} icon={StickyNote} tone="neutral">
                <p>{transfer.receive_note}</p>
              </Card>
            )}

            {receiving && (
              <Card>
                <TextAreaField
                  label={t("inventory.receive.note")}
                  value={note}
                  onChange={(value) => (setNote(value), setNoteError(null))}
                  error={noteError}
                  hint={t(differs ? "inventory.receive.note_hint_diff" : "common.optional")}
                  rows={2}
                  maxLength={500}
                />
                {receiveError && (
                  <div className="mt-4">
                    <Alert>{receiveError}</Alert>
                  </div>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {/* Farq paydo bo'lsa, "hammasi to'g'ri" tugmasi yashirinadi — izohsiz o'tib ketmaydi.
                      Yaroqsiz qiymatda tugma o'chmaydi: bosilganda sababi shu yerda ko'rsatiladi */}
                  <Button type="submit" loading={busy}>
                    {t(differs ? "inventory.receive.accept_diff" : "inventory.receive.accept_all")}
                  </Button>
                  {differs && <span className="text-sm text-muted">{t("inventory.receive.diff_reported")}</span>}
                </div>
              </Card>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
