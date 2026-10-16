import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Layers, PackagePlus, PackageSearch, Plus, Ruler, Trash2, X } from "lucide-react";
import { useCurrentUser } from "@/modules/auth/AuthProvider";
import { SearchInput, Thumb } from "@/modules/catalog/parts";
import { api, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { useRequestId } from "@/shared/api/requestId";
import { minDecimal, parseDecimal, sumDecimals } from "@/shared/decimal";
import { clearDraft, loadDraft, saveDraft } from "@/shared/draft";
import { feedback } from "@/shared/feedback";
import { formatDecimal } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Alert, Loading } from "@/shared/ui/feedback";
import { fieldLabel, SelectField, TextField } from "@/shared/ui/fields";
import { BackLink, Empty, Fact, RowAction, rowClass, SectionHeader } from "@/shared/ui/list";
import { PageTitle } from "@/shared/ui/PageTitle";
import { focusRing } from "@/shared/ui/tones";
import {
  inventoryKeys,
  metersForRolls,
  skuNames,
  type Sendable,
  type TransferOptions,
} from "./types";

type Line = { batch: Sendable; rolls: string; meters: string };

/** Qoralama: qayerdan, qayerga, izoh va tanlangan partiyalar — qurilmada saqlanadi (`shared/draft.ts`) */
type TransferDraft = { picked: string; to: string; note: string; lines: Line[] };

const isDirty = (draft: TransferDraft) => Boolean(draft.picked || draft.to || draft.note || draft.lines.length > 0);

/** Saqlangan qoralama shakli to'g'rimi (eski versiyadan qolgan yoki buzilgan bo'lishi mumkin) */
function restoredDraft(key: string): TransferDraft | null {
  const saved = loadDraft<Partial<TransferDraft>>(key);
  if (
    !saved ||
    typeof saved.picked !== "string" ||
    typeof saved.to !== "string" ||
    typeof saved.note !== "string" ||
    !Array.isArray(saved.lines) ||
    saved.lines.some((line) => typeof line?.batch?.batch_id !== "number" || typeof line.meters !== "string")
  ) {
    return null;
  }
  const draft = saved as TransferDraft;
  return isDirty(draft) ? draft : null;
}

const cell =
  "h-11 w-full rounded-control border bg-panel px-3 text-right text-[16px] tabular-nums transition-colors";
const cellOk = `border-edge focus:border-indigo ${focusRing}`;
const cellBad = `border-madder ${focusRing} focus-visible:ring-madder`;

/** Ko'chirish yaratish: qayerdan → qayerga va partiyalar (rulon, metr). Jo'natilgach holat — "yo'lda". */
export function TransferCreatePage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const draftKey = `mato.transfer.${user.id}`;

  const options = useQuery({
    queryKey: inventoryKeys.options,
    queryFn: () => api<TransferOptions>("/transfers/options"),
  });
  const sources = options.data?.sources ?? [];

  // Oldingi safar yakunlanmagan forma bo'lsa — o'sha holatdan davom etiladi
  const [restored] = useState(() => restoredDraft(draftKey));
  const [picked, setPicked] = useState(restored?.picked ?? "");
  const [to, setTo] = useState(restored?.to ?? "");
  const [note, setNote] = useState(restored?.note ?? "");
  const [lines, setLines] = useState<Line[]>(() => restored?.lines ?? []);
  const [draftNotice, setDraftNotice] = useState(restored !== null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false); // "Jo'natish" bosilgandan keyin xatolar ko'rsatiladi
  const [saving, setSaving] = useState(false);

  const sent = useRef(false); // jo'natildi — qoralama endi yozilmaydi
  // Javob yo'qolib "Jo'natish" qayta bosilsa (yoki sahifa yangilansa) ko'chirish ikki marta yozilmasin
  const request = useRequestId(`${draftKey}.request`);
  const searchBox = useRef<HTMLDivElement>(null); // qo'shilgandan keyin qidiruv maydoni yana fokus oladi (skaner ketma-ket o'qiydi)

  // Bitta joydan jo'nata oladigan xodimga tanlash shart emas
  const from = picked || (sources.length === 1 ? String(sources[0].id) : "");
  const targets = (options.data?.targets ?? []).filter((place) => String(place.id) !== from);

  // Har o'zgarishda qoralama yangilanadi; forma bo'shatilsa — o'chadi
  useEffect(() => {
    if (sent.current) return;
    const draft: TransferDraft = { picked, to, note, lines };
    if (isDirty(draft)) saveDraft(draftKey, draft);
    else clearDraft(draftKey);
  }, [draftKey, picked, to, note, lines]);

  const sendable = useQuery({
    queryKey: inventoryKeys.sendable(from, search.trim()),
    enabled: Boolean(from),
    queryFn: () => {
      const query = new URLSearchParams({ location_id: from });
      if (search.trim()) query.set("search", search.trim());
      return api<Sendable[]>(`/transfers/sendable?${query}`);
    },
  });
  const chosen = new Set(lines.map((line) => line.batch.batch_id));
  const candidates = (sendable.data ?? []).filter((batch) => !chosen.has(batch.batch_id));

  function changeSource(next: string) {
    setPicked(next);
    setLines([]); // partiyalar boshqa joyniki — ro'yxat tozalanadi
    if (next === to) setTo("");
  }

  function add(batch: Sendable, event?: MouseEvent) {
    feedback("select", event);
    // Boshida — bitta rulon; rulon soni o'zgarsa metr o'zi hisoblanadi
    const rolls = batch.rolls > 0 ? "1" : "0";
    const meters = batch.rolls > 0 ? metersForRolls("1", batch.roll_m) : batch.qty_m;
    // Yangi qator TEPAGA: ko'p partiya qo'shilganda ham hozirgina qo'shilgani ko'rinib turadi
    setLines((all) => [{ batch, rolls, meters: minDecimal(meters, batch.qty_m, 2) }, ...all]);
    setSearch("");
    setError(null);
    searchBox.current?.querySelector("input")?.focus();
  }

  function removeLine(line: Line, event: MouseEvent) {
    feedback("remove", event);
    setLines((all) => all.filter((item) => item.batch.batch_id !== line.batch.batch_id));
  }

  /** Tiklangan qoralamadan voz kechish — bo'sh formadan boshlanadi */
  function discardDraft() {
    clearDraft(draftKey);
    setPicked("");
    setTo("");
    setNote("");
    setLines([]);
    setChecked(false);
    setError(null);
    setDraftNotice(false);
  }

  const update = (id: number, changes: Partial<Line>) =>
    setLines((all) => all.map((line) => (line.batch.batch_id === id ? { ...line, ...changes } : line)));

  function setRolls(line: Line, value: string) {
    const rolls = value.replace(/\D/g, "").slice(0, 5);
    const meters = metersForRolls(rolls, line.batch.roll_m);
    // Hisoblangan metr qoldiqdan oshmaydi (oxirgi rulon to'liq bo'lmasligi mumkin)
    update(line.batch.batch_id, {
      rolls,
      meters: meters === "" ? line.meters : minDecimal(meters, line.batch.qty_m, 2),
    });
  }

  const problem = (line: Line): string | null => {
    const meters = parseDecimal(line.meters, 2);
    if (meters === null) return t("inventory.transfer.errors.meters");
    if (Number(meters) > Number(line.batch.qty_m)) {
      return t("inventory.transfer.errors.too_much", { available: formatDecimal(line.batch.qty_m) });
    }
    if (!/^\d+$/.test(line.rolls)) return t("inventory.transfer.errors.rolls");
    return null;
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    setChecked(true);
    setError(null);
    if (!from || !to) return setError(t("inventory.transfer.errors.places"));
    if (lines.length === 0) return setError(t("inventory.transfer.errors.empty"));
    if (lines.some((line) => problem(line) !== null)) {
      // Xato qator tepada qolib ketishi mumkin: tugma yonida xulosa, ekran esa birinchi xatoga suriladi
      setError(t("receiving.errors.check_fields"));
      requestAnimationFrame(() => {
        const field = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        field?.scrollIntoView?.({ block: "center", behavior: "smooth" });
        field?.focus({ preventScroll: true });
      });
      return;
    }

    setSaving(true);
    try {
      const { id } = await post<{ id: number }>("/transfers", {
        client_uuid: request.current(),
        from_location_id: Number(from),
        to_location_id: Number(to),
        note: note.trim() || null,
        lines: lines.map((line) => ({
          batch_id: line.batch.batch_id,
          rolls: Number(line.rolls),
          meters: parseDecimal(line.meters, 2),
        })),
      });
      await queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      sent.current = true;
      request.settle();
      clearDraft(draftKey);
      navigate(`/transfers/${id}`, { replace: true, state: { sent: true } });
    } catch (failure) {
      request.settle(failure);
      setError(errorText(failure));
      setSaving(false);
    }
  }

  const totalMeters = sumDecimals(lines.map((line) => line.meters), 2);

  return (
    <div>
      <BackLink to="/transfers">{t("inventory.tab_transfers")}</BackLink>
      <div className="mt-3">
        <PageTitle icon={ArrowLeftRight} tone="coral">
          {t("inventory.transfer.create")}
        </PageTitle>
      </div>

      {options.isLoading ? (
        <Loading className="mt-5" />
      ) : sources.length === 0 ? (
        <div className="mt-5 max-w-xl">
          <Alert tone="info">{t("inventory.transfer.no_sources")}</Alert>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label={t("inventory.transfer.from")} value={from} onChange={changeSource}>
                {sources.length > 1 && <option value="">{t("receiving.choose")}</option>}
                {sources.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </SelectField>
              <SelectField label={t("inventory.transfer.to")} value={to} onChange={(value) => (setTo(value), setError(null))}>
                <option value="">{t("receiving.choose")}</option>
                {targets.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </SelectField>
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

          {/* Qidiruv tanlangan qatorlardan TEPADA: har qo'shilgan partiya maydonni pastga surmaydi, skaner ketma-ket o'qiydi.
              Keng ekranda — yonma-yon: nomzodlar chapda, tanlanganlar o'ngda */}
          <div className={lines.length > 0 ? "space-y-5 xl:grid xl:grid-cols-2 xl:items-start xl:gap-5 xl:space-y-0" : ""}>
          {from && (
            <Card title={t("inventory.transfer.add_batch")} icon={PackagePlus} tone="coral">
              <div ref={searchBox}>
                <SearchInput value={search} onChange={setSearch} label={t("inventory.transfer.search")} />
              </div>
              {sendable.isLoading && <Loading className="mt-4" />}
              {sendable.isError && (
                <div className="mt-4">
                  <Alert>{errorText(sendable.error)}</Alert>
                </div>
              )}
              {sendable.isSuccess && candidates.length === 0 && (
                <Empty icon={PackageSearch} tone="sky">
                  {t(search.trim() || lines.length > 0 ? "catalog.nothing_found" : "inventory.transfer.nothing_to_send")}
                </Empty>
              )}
              {/* Nomzodlar o'z ichida suriladi — ro'yxat uzun bo'lsa ham tanlangan partiyalar ekrandan chiqib ketmaydi */}
              <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto overscroll-contain pr-1">
                {candidates.slice(0, 20).map((batch) => (
                  <li key={batch.batch_id} className="flex items-center gap-3 py-2.5">
                    <Thumb imageUrl={batch.sku.image_url} hex={batch.sku.hex} code={batch.sku.code} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{batch.number}</span>
                      <span className="ml-2 text-sm text-muted">
                        {batch.sku.code} · {skuNames(batch.sku)}
                      </span>
                      <span className="block text-[13px] text-muted">
                        {t("inventory.transfer.available", {
                          meters: formatDecimal(batch.qty_m),
                          count: batch.rolls,
                        })}
                      </span>
                    </span>
                    {/* Tovushni add() beradi ("tanlandi") — tugmaning o'z tovushi o'chirilgan */}
                    <Button
                      variant="secondary"
                      size="sm"
                      silent
                      aria-label={t("inventory.transfer.add_number", { number: batch.number })}
                      onClick={(event) => add(batch, event)}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      {t("inventory.transfer.add")}
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {lines.length > 0 && (
            <section className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
              <SectionHeader>{t("inventory.transfer.lines")}</SectionHeader>
              <ul aria-label={t("inventory.transfer.lines")} className="divide-y divide-line">
                {lines.map((line) => {
                  const issue = checked ? problem(line) : null;
                  return (
                    <li key={line.batch.batch_id} className={`animate-line-in ${rowClass}`}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                        <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
                          <Thumb imageUrl={line.batch.sku.image_url} hex={line.batch.sku.hex} code={line.batch.sku.code} />
                          <div className="min-w-0">
                            <p className="font-medium">{line.batch.number}</p>
                            <p className="truncate text-sm text-muted">
                              {line.batch.sku.code} · {skuNames(line.batch.sku)}
                            </p>
                            <p className="text-[13px] text-muted">
                              {t("inventory.transfer.available", {
                                meters: formatDecimal(line.batch.qty_m),
                                count: line.batch.rolls,
                              })}
                            </p>
                          </div>
                        </div>
                        {/* Telefonda maydonlar butun qatorni egallaydi; kengroq ekranda — o'ngda, qat'iy enda */}
                        <div className="flex min-w-0 flex-1 basis-64 items-end gap-3 sm:flex-none sm:basis-auto">
                          <label className="min-w-0 flex-1 sm:w-24 sm:flex-none">
                            <span className={fieldLabel}>{t("inventory.transfer.rolls")}</span>
                            <input
                              inputMode="numeric"
                              value={line.rolls}
                              onChange={(e) => setRolls(line, e.target.value)}
                              className={`${cell} ${cellOk}`}
                            />
                          </label>
                          <label className="min-w-0 flex-1 sm:w-32 sm:flex-none">
                            <span className={fieldLabel}>{t("inventory.transfer.meters")}</span>
                            <input
                              inputMode="decimal"
                              value={line.meters}
                              aria-invalid={issue ? true : undefined}
                              onChange={(e) => update(line.batch.batch_id, { meters: e.target.value })}
                              className={`${cell} ${issue ? cellBad : cellOk}`}
                            />
                          </label>
                          {/* Tugma maydonlar bilan bir chiziqda turadi (maydon 44, tugma 32 px) */}
                          <RowAction
                            icon={Trash2}
                            tone="danger"
                            className="mb-1.5 shrink-0"
                            aria-label={t("inventory.transfer.remove", { number: line.batch.number })}
                            onClick={(event) => removeLine(line, event)}
                          />
                        </div>
                      </div>
                      {issue && (
                        <p role="alert" className="mt-2 text-sm text-madder">
                          {issue}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          </div>

          {/* Jami va "Jo'natish" — ekran pastida turadi; xato xulosasi ham shu yerda, tugma yonida */}
          <div className="sticky bottom-3 z-10 rounded-card border border-line bg-panel p-4 shadow-pop">
            {error && (
              <div className="mb-3">
                <Alert>{error}</Alert>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <dl className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-3">
                <Fact icon={Layers} tone="coral" label={t("receiving.batches")}>
                  <span className="tabular-nums">{lines.length}</span>
                </Fact>
                <Fact icon={Ruler} tone="sky" label={t("receiving.total_m")}>
                  <span className="tabular-nums">{formatDecimal(totalMeters)} m</span>
                </Fact>
              </dl>
              <Button type="submit" loading={saving}>
                {t("inventory.transfer.send")}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
