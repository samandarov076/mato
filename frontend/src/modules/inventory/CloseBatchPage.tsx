import { Fragment, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, PackageCheck, ScanLine, Store, Warehouse } from "lucide-react";
import { useCurrentUser } from "@/modules/auth/AuthProvider";
import { Thumb } from "@/modules/catalog/parts";
import { api, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { formatDecimal, formatNumber } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Alert, ConfirmBar, Loading } from "@/shared/ui/feedback";
import { TextField } from "@/shared/ui/fields";
import { Hint } from "@/shared/ui/Hint";
import { Empty, rowClass, RowAction, SectionHeader } from "@/shared/ui/list";
import { PageTitle } from "@/shared/ui/PageTitle";
import { Table, td, Th } from "@/shared/ui/table";
import { inventoryKeys, skuNames, type ClosableBatch, type ClosablePage, type ClosablePlace } from "./types";

type Target = { batch: ClosableBatch; place: ClosablePlace; qty: string };

/**
 * Partiyani yopish (docs/03-details/05-ombor.md). Tepada — skaner / raqam (kartochka ochiladi) va "Tugagan (0 m)":
 * qoldig'i 0 bo'lgan ochiq partiyalar bir bosishda yopiladi (avto-yopish yo'q — mato qolgan bo'lishi mumkin).
 * Pastda — ochiq partiyalar: bir nechta joy ko'radigan xodimga jadval (ustun — joy), bitta do'konda — ro'yxat.
 * Qoldig'i bor partiyani yopishdan oldin natija ko'rinadi: metr farqi va (egaga) taxminiy summa.
 */
export function CloseBatchPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { store } = useCurrentUser();
  const [number, setNumber] = useState("");
  const [findError, setFindError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [asking, setAsking] = useState<Target | null>(null); // tasdiq so'ralayotgan katak
  const [closing, setClosing] = useState<string | null>(null); // yuborilayotgan katak kaliti
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const closable = useQuery({
    queryKey: inventoryKeys.stock("closable"),
    queryFn: () => api<ClosablePage>("/batches/closable"),
  });
  const places = closable.data?.locations ?? [];
  const batches = closable.data?.batches ?? [];
  const single = places.length <= 1; // do'kon qurilmasi yoki bitta joyli xodim — ro'yxat ko'rinishi
  const keyOf = (target: Target) => `${target.batch.id}-${target.place.id}`;
  const isZero = (qty: string) => Number(qty) === 0;

  // Tugagan (0 m) va yopsa bo'ladigan kataklar — alohida bo'limda, bir bosishda
  const finished: Target[] = batches.flatMap((batch) =>
    batch.cells.flatMap((cell) => {
      const place = places.find((candidate) => candidate.id === cell.location_id);
      return place?.can_close && isZero(cell.qty_m) ? [{ batch, place, qty: cell.qty_m }] : [];
    }),
  );
  const inFinished = (batch: ClosableBatch, placeId: number) =>
    finished.some((target) => target.batch.id === batch.id && target.place.id === placeId);
  // Asosiy ro'yxatda: tugaganlar bo'limiga tushmagan kamida bitta katagi bor partiyalar; qoldig'i ozi tepada
  const open = batches
    .filter((batch) => batch.cells.some((cell) => !inFinished(batch, cell.location_id)))
    .sort(
      (a, b) =>
        Math.min(...a.cells.map((cell) => Number(cell.qty_m))) - Math.min(...b.cells.map((cell) => Number(cell.qty_m))),
    );

  async function find(event: FormEvent) {
    event.preventDefault();
    const wanted = number.trim();
    if (!wanted) return;
    setSearching(true);
    setFindError(null);
    try {
      // Skaner Enter yuboradi — raqam topilsa, kartochka darhol ochiladi; "ortga" shu sahifaga qaytaradi
      const { id } = await api<{ id: number }>(`/batches/by-number/${encodeURIComponent(wanted)}`);
      navigate(`/batches/${id}`, { state: { from: "/close" } });
    } catch (failure) {
      setFindError(errorText(failure));
      setSearching(false);
    }
  }

  async function close(target: Target) {
    setClosing(keyOf(target));
    setError(null);
    setDone(null);
    try {
      await post(`/batches/${target.batch.id}/close`, { location_id: target.place.id, note: null });
      feedback("success");
      setDone(t("inventory.close.closed_done", { number: target.batch.number, place: target.place.name }));
      setAsking(null);
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setClosing(null);
    }
  }

  /** Qoldig'i 0 — darhol yopiladi (farq yo'q); aks holda avval natija ko'rsatiladi */
  function start(target: Target) {
    if (isZero(target.qty)) return void close(target);
    setError(null);
    setAsking(target);
  }

  const closeButton = (target: Target) => (
    <RowAction
      icon={Lock}
      disabled={closing !== null}
      aria-label={t("inventory.close.do_named", { number: target.batch.number, place: target.place.name })}
      onClick={() => start(target)}
    >
      {t("inventory.close.do")}
    </RowAction>
  );

  /** Tasdiq: tizimdagi qoldiq → metr farqi (+ kam chiqdi, − ortiq chiqdi); egaga — taxminiy summa */
  function confirm(target: Target) {
    const qty = Number(target.qty);
    const cost = target.batch.cost_per_m;
    return (
      <ConfirmBar
        text={
          <>
            <span className="block font-medium">
              {t("inventory.close.preview_who", { number: target.batch.number, place: target.place.name })}
            </span>
            {t(qty > 0 ? "inventory.close.preview_short" : "inventory.close.preview_over", {
              qty: formatDecimal(target.qty),
              diff: formatDecimal(Math.abs(qty).toFixed(2)),
            })}
            {cost !== null && (
              <span className="text-muted">
                {" "}
                ({t("inventory.close.preview_amount", { amount: formatNumber(Math.round(Math.abs(qty) * cost)) })})
              </span>
            )}
          </>
        }
        confirmLabel={t("inventory.close.confirm_yes")}
        busy={closing === keyOf(target)}
        onConfirm={() => void close(target)}
        onCancel={() => setAsking(null)}
      />
    );
  }

  const batchInfo = (batch: ClosableBatch) => (
    <span className="flex min-w-0 items-center gap-3">
      <Thumb imageUrl={batch.sku.image_url} hex={batch.sku.hex} code={batch.sku.code} />
      <span className="min-w-0">
        <Link
          to={`/batches/${batch.id}`}
          state={{ from: "/close" }}
          className="font-medium text-indigo underline-offset-2 hover:underline"
        >
          {batch.number}
        </Link>
        <span className="block truncate text-sm text-muted">
          {batch.sku.code} · {skuNames(batch.sku)}
        </span>
      </span>
    </span>
  );

  const quantity = (qty: string, rolls: number) => (
    <span className={`tabular-nums ${Number(qty) < 0 ? "text-madder" : ""}`}>
      <span className="whitespace-nowrap font-semibold">{formatDecimal(qty)} m</span>
      <span className="block whitespace-nowrap text-[13px] text-muted">{t("inventory.rolls_about", { count: rolls })}</span>
    </span>
  );

  const title = store ? t("inventory.close.here", { place: store.name }) : t("inventory.close.everywhere");

  return (
    <div>
      <PageTitle icon={PackageCheck} tone="plum">
        {t("inventory.close.title")}
      </PageTitle>
      <Hint id="close-batch" className="mt-2">
        {t("inventory.close.intro")}
      </Hint>

      <Card className="mt-5 max-w-xl">
        <form onSubmit={find} noValidate className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <TextField
              label={t("inventory.close.number")}
              value={number}
              onChange={(value) => (setNumber(value), setFindError(null))}
              error={findError}
              placeholder="P-000123"
              autoComplete="off"
              autoFocus
            />
          </div>
          <Button type="submit" loading={searching} className={findError ? "mb-[26px]" : ""}>
            <ScanLine className="size-[18px]" aria-hidden="true" />
            {t("inventory.close.find")}
          </Button>
        </form>
      </Card>

      {error && (
        <div className="mt-4">
          <Alert focus>{error}</Alert>
        </div>
      )}
      {done && (
        <div className="mt-4">
          <Alert tone="success">{done}</Alert>
        </div>
      )}

      {/* Tugagan (0 m): bir bosishda, tasdiqsiz — farq yo'q */}
      {finished.length > 0 && (
        <section
          aria-label={t("inventory.close.empty_title")}
          className="mt-5 overflow-hidden rounded-card border border-saffron/40 bg-panel shadow-card"
        >
          <SectionHeader>{t("inventory.close.empty_title")}</SectionHeader>
          <p className="px-4 pt-3 text-sm text-muted sm:px-5">{t("inventory.close.empty_hint")}</p>
          <ul className="divide-y divide-line">
            {finished.map((target) => (
              <li key={keyOf(target)} className={`flex flex-wrap items-center gap-3 ${rowClass}`}>
                <span className="min-w-0 flex-1 basis-56">{batchInfo(target.batch)}</span>
                {!single && (
                  <span className="flex items-center gap-1.5 text-sm">
                    {target.place.type === "store" ? (
                      <Store className="size-4 shrink-0 text-leaf" aria-hidden="true" />
                    ) : (
                      <Warehouse className="size-4 shrink-0 text-sky" aria-hidden="true" />
                    )}
                    <span>{target.place.name}</span>
                  </span>
                )}
                {closeButton(target)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-5 overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <SectionHeader>{title}</SectionHeader>
        {closable.isLoading && <Loading className="px-4 py-6 sm:px-5" />}
        {closable.isError && (
          <div className="p-5">
            <Alert>{errorText(closable.error)}</Alert>
          </div>
        )}
        {closable.isSuccess && open.length === 0 && (
          <Empty icon={PackageCheck} tone="sky">
            {t("inventory.close.nothing")}
          </Empty>
        )}

        {open.length > 0 && single && (
          // Bitta joy (do'kon qurilmasi): ro'yxat — joy nomi sarlavhada
          <ul aria-label={title} className="divide-y divide-line">
            {open.map((batch) => {
              const cell = batch.cells[0];
              const target: Target = { batch, place: places[0], qty: cell.qty_m };
              return (
                <li key={batch.id} className={rowClass}>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    <span className="min-w-0 flex-1 basis-48">{batchInfo(batch)}</span>
                    <span className="text-right">{quantity(cell.qty_m, cell.rolls)}</span>
                    {places[0].can_close && closeButton(target)}
                  </div>
                  {asking && keyOf(asking) === keyOf(target) && <div className="mt-3">{confirm(asking)}</div>}
                </li>
              );
            })}
          </ul>
        )}

        {open.length > 0 && !single && (
          // Bir nechta joy (ega, omborchi): qator — partiya, ustun — joy
          <Table
            flush
            label={title}
            head={
              <tr>
                <Th>{t("inventory.close.col_batch")}</Th>
                {places.map((place) => (
                  <Th key={place.id}>{place.name}</Th>
                ))}
              </tr>
            }
          >
              {open.map((batch) => (
                <Fragment key={batch.id}>
                  <tr className="border-t border-line align-top">
                    <td className={td}>{batchInfo(batch)}</td>
                    {places.map((place) => {
                      const cell = batch.cells.find((candidate) => candidate.location_id === place.id);
                      // Yo'q yoki "Tugagan" bo'limida turgan katak — chiziqcha
                      if (!cell || inFinished(batch, place.id)) {
                        return (
                          <td key={place.id} className={`${td} text-muted`}>
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={place.id} className={td}>
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            {quantity(cell.qty_m, cell.rolls)}
                            {place.can_close && closeButton({ batch, place, qty: cell.qty_m })}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                  {asking?.batch.id === batch.id && (
                    <tr>
                      <td colSpan={places.length + 1} className="px-4 pb-4 sm:px-5">
                        {confirm(asking)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
          </Table>
        )}
      </section>
    </div>
  );
}
