import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, HandCoins, Pencil, ShoppingCart, Trash2, WifiOff } from "lucide-react";
import { useAuth, useCurrentUser } from "@/modules/auth/AuthProvider";
import { Thumb } from "@/modules/catalog/parts";
import { CustomerPicker } from "@/modules/credit/CustomerPicker";
import { creditKeys } from "@/modules/credit/types";
import { inventoryKeys } from "@/modules/inventory/types";
import { ApiError, api, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { isRejected } from "@/shared/api/requestId";
import { fromUnits, toUnits } from "@/shared/decimal";
import { feedback } from "@/shared/feedback";
import { formatDecimal, formatNumber, formatPrice } from "@/shared/format";
import { Button, iconButtonSmall as iconButton } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { MoneyInput, Segmented } from "@/shared/ui/controls";
import { Alert, ConfirmBar, Loading } from "@/shared/ui/feedback";
import { fieldLabel, SelectField } from "@/shared/ui/fields";
import { BackLink, sectionStrip } from "@/shared/ui/list";
import { PageTitle } from "@/shared/ui/PageTitle";
import { focusRing } from "@/shared/ui/tones";
import {
  cartKey as cartKeyOf,
  emptyCart,
  lineAmount,
  loadCart,
  newId,
  overdrawn,
  pendingElsewhere,
  saveCart,
  type Cart,
  type CartLine,
} from "./cart";
import { EntryForm } from "./EntryForm";
import {
  salesKeys,
  type MoneyMethod,
  type PaymentType,
  type Ref,
  type SaleContext,
  type SaleCreated,
} from "./types";

const STORE_KEY = "mato.sale.store";

/**
 * Sotuv ekrani. Sotuvchi — qurilma bog'langan do'konda (pastki menyuning birinchi bo'limi);
 * biznes egasi do'konni o'zi tanlaydi.
 */
export function SalePage() {
  const { user } = useCurrentUser();
  return user.role === "seller" ? <SaleScreen storeId={null} /> : <OwnerSale />;
}

function OwnerSale() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const stores = useQuery({
    queryKey: ["locations", "stores"],
    queryFn: () => api<Ref[]>("/locations?type=store"),
  });
  const { device, business } = useAuth();
  // Ega o'z biznesining do'kon planshetida: shu do'kon oldindan tanlangan (o'zgartirish mumkin).
  // Boshqa hollarda — oxirgi tanlangan do'kon.
  const deviceStore =
    device?.bound && business && device.business?.id === business.id ? device.store?.id : undefined;
  const [picked, setPicked] = useState(() => {
    if (deviceStore) return String(deviceStore);
    try {
      return localStorage.getItem(STORE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const list = stores.data ?? [];
  // Oxirgi tanlangan do'kon eslab qolinadi; do'kon bitta bo'lsa — tanlash shart emas
  const storeId = list.some((store) => String(store.id) === picked)
    ? picked
    : list.length === 1
      ? String(list[0].id)
      : "";

  function choose(next: string) {
    setPicked(next);
    try {
      localStorage.setItem(STORE_KEY, next);
    } catch {
      /* eslab qolinmaydi, xolos */
    }
  }

  return (
    <div>
      <BackLink to="/sales">{t("sales.card.back")}</BackLink>
      <div className="mt-3">
        <PageTitle icon={ShoppingCart} tone="leaf">
          {t("sales.new")}
        </PageTitle>
      </div>

      {stores.isLoading && <Loading className="mt-5" />}
      {stores.isError && (
        <div className="mt-5">
          <Alert>{errorText(stores.error)}</Alert>
        </div>
      )}
      {stores.isSuccess && list.length === 0 && (
        <div className="mt-5 max-w-xl">
          <Alert tone="info">{t("sales.no_stores")}</Alert>
        </div>
      )}
      {list.length > 1 && (
        <div className="mt-5 max-w-sm">
          <SelectField label={t("sales.store")} value={storeId} onChange={choose}>
            <option value="">{t("sales.choose_store")}</option>
            {list.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </SelectField>
        </div>
      )}
      {storeId && (
        <div className="mt-5 max-w-3xl xl:max-w-none">
          <SaleScreen key={storeId} storeId={Number(storeId)} />
        </div>
      )}
    </div>
  );
}

function SaleScreen({ storeId }: { storeId: number | null }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const { user, store } = useCurrentUser();
  const seller = user.role === "seller";
  const sum = t("settings.units.sum");
  // Savat xodim va do'kon bo'yicha alohida: qurilma qulflansa, uni faqat shu sotuvchi davom ettiradi
  const cartStore = storeId ?? store?.id ?? 0;
  const cartKey = cartKeyOf(user.id, cartStore);

  const context = useQuery({
    queryKey: salesKeys.context(storeId),
    queryFn: () => api<SaleContext>(`/sales/context${storeId ? `?store_id=${storeId}` : ""}`),
  });
  const data = context.data;

  const [cart, setCart] = useState<Cart>(() => loadCart(cartKey));
  const [editing, setEditing] = useState<string | null>(null);
  const [forced, setForced] = useState<string[]>([]); // server "izoh kerak" degan qatorlar
  const [checked, setChecked] = useState(false); // "Yakunlash" bosilgandan keyin bo'sh izohlar qizil
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<SaleCreated | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [quickSaving, setQuickSaving] = useState(false); // tez sotish yuborilmoqda — savat ko'rsatilmaydi
  const clearRef = useRef<HTMLButtonElement>(null);
  const sending = useRef(false); // so'rov yo'lda — `finish` ikkinchi marta boshlanmaydi
  // Boshqa sotuvchining shu qurilmada javobi kelmay qolgan sotuvlari
  const [others] = useState(() => pendingElsewhere(user.id, cartStore));

  useEffect(() => saveCart(cartKey, cart), [cartKey, cart]);

  // Shu savat boshqa oynada ham ochiq bo'lsa — ikkalasi bitta savatni ko'rsatadi: biri yuborsa, ikkinchisi ham
  // qulflanadi. Aks holda ikki oyna bitta identifikator ostida har xil mazmun yuborishi mumkin edi.
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== cartKey || sending.current) return;
      setCart((current) => (JSON.stringify(current) === event.newValue ? current : loadCart(cartKey)));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [cartKey]);

  const stock: Record<number, string> = {};
  for (const item of data?.items ?? []) for (const batch of item.batches) stock[batch.id] = batch.qty_m;
  const over = overdrawn(cart.lines, stock);
  const needsNote = (line: CartLine) => line.id in over || forced.includes(line.id);

  const total = cart.lines.reduce((amount, line) => amount + lineAmount(line.meters, line.price), 0);
  // Nasiya sozlamada o'chirilgan bo'lsa, saqlangan savatdagi "nasiya" naqdga aylanadi
  const payment: PaymentType = cart.payment === "credit" && data && !data.credit_enabled ? "cash" : cart.payment;
  const initial = payment === "credit" ? Number(cart.initial || 0) : 0;
  const locked = cart.pending || saving;
  // Yuborilgan, lekin natijasi noma'lum (javob kelmadi, server xatosi yoki sahifa javobni kutmay yangilandi)
  const uncertain = cart.pending && !saving;

  const inCart: Record<number, number> = {};
  for (const line of cart.lines) {
    if (line.id !== editing) inCart[line.batch_id] = (inCart[line.batch_id] ?? 0) + (toUnits(line.meters, 2) ?? 0);
  }
  for (const id in inCart) inCart[id] /= 100; // yig'indi yuzdan bir metrda (aniq), forma metrda oladi

  const change = (changes: Partial<Cart>) => setCart((current) => ({ ...current, ...changes }));
  const changeLine = (id: string, changes: Partial<CartLine>) =>
    setCart((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === id ? { ...line, ...changes } : line)),
    }));

  function put(line: CartLine) {
    setCart((current) => ({
      ...current,
      lines: current.lines.some((row) => row.id === line.id)
        ? current.lines.map((row) => (row.id === line.id ? line : row))
        : [...current.lines, line],
    }));
    setEditing(null);
    setDone(null);
    setError(null);
  }

  function clearCart() {
    setCart(emptyCart());
    setEditing(null);
    setForced([]);
    setError(null);
    setConfirmClear(false);
  }

  /**
   * Sotuvni yuboradi. `override` — tez sotish: qator savatga hali tushmagan (holat keyingi chizishda yangilanadi),
   * shuning uchun qatorlar to'g'ridan-to'g'ri beriladi. Savatga ham shu qator yozib qo'yilgan: internet uzilsa
   * yoki server rad etsa, sotuvchi uni savatda ko'radi va qayta yuboradi.
   */
  async function finish(override?: CartLine[]) {
    if (sending.current) return; // "online" hodisasi va "Qayta yuborish" bir vaqtda kelsa — bitta so'rov
    const lines = override ?? cart.lines;
    const overNow = override ? overdrawn(lines, stock) : over;
    setError(null);
    setDone(null);
    setChecked(true);
    if (lines.length === 0) return setError(t("sales.errors.empty"));
    if (lines.some((line) => (line.id in overNow || forced.includes(line.id)) && !line.note.trim())) {
      return setError(t("sales.errors.note"));
    }
    if (payment === "credit") {
      if (!cart.customer) return setError(t("sales.errors.customer"));
      if (initial > total) return setError(t("sales.errors.initial"));
    }
    sending.current = true;
    setSaving(true);
    // Qulf so'rovdan OLDIN qurilmaga yoziladi: javobni kutayotganda sahifa yangilansa ham savat o'zgartirilmaydi
    const sent: Cart = { ...cart, lines, pending: true, seller: user.full_name };
    saveCart(cartKey, sent);
    setCart(sent);
    try {
      const created = await post<SaleCreated>("/sales", {
        client_uuid: sent.uuid,
        store_id: storeId,
        payment_type: payment,
        customer_id: payment === "credit" ? (cart.customer?.id ?? null) : null,
        initial_payment: initial,
        initial_payment_method: initial > 0 ? cart.initialMethod : null,
        lines: lines.map((line) => ({
          batch_id: line.batch_id,
          meters: line.meters,
          kg: line.kg,
          price_per_m: line.price,
          negative_stock_note: line.note.trim() || null,
        })),
      });
      // Qoldiq joyida yangilanadi — butun katalog (/sales/context) qayta yuklanmaydi
      // Yuzdan bir metrda — float bilan "9.899999999999999" kabi qoldiq chiqmasin
      const sold = new Map<number, number>();
      for (const line of lines) {
        sold.set(line.batch_id, (sold.get(line.batch_id) ?? 0) + (toUnits(line.meters, 2) ?? 0));
      }
      queryClient.setQueryData<SaleContext>(salesKeys.context(storeId), (old) =>
        old && {
          ...old,
          items: old.items.map((it) => ({
            ...it,
            batches: it.batches.map((b) =>
              sold.has(b.id)
                ? { ...b, qty_m: fromUnits((toUnits(b.qty_m, 2) ?? 0) - (sold.get(b.id) ?? 0), 2, true) }
                : b,
            ),
          })),
        },
      );
      setCart(emptyCart());
      setDone(created);
      setChecked(false);
      setForced([]);
      setEditing(null);
      setConfirmClear(false);
      void queryClient.invalidateQueries({ queryKey: ["sales", "list"] });
      void queryClient.invalidateQueries({ queryKey: ["sales", "sale"] });
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.all });
      void queryClient.invalidateQueries({ queryKey: creditKeys.all });
    } catch (failure) {
      if (failure instanceof ApiError && isRejected(failure)) {
        // Server aniq rad etdi — bu identifikator bilan sotuv yozilmagan; savatni tuzatsa bo'ladi.
        // Keyingi urinish yangi identifikator bilan ketadi.
        setCart((current) => ({ ...current, pending: false, uuid: newId() }));
        if (failure.code === "negative_stock_note_required") {
          const line = lines[Number(failure.details.line)];
          if (line) setForced((ids) => [...ids, line.id]);
        }
        setError(errorText(failure));
        void queryClient.invalidateQueries({ queryKey: salesKeys.context(storeId) });
      }
      // Aks holda (javob kelmadi, vaqt tugadi, 5xx) natija noaniq: sotuv yozilgan bo'lishi ham mumkin.
      // Savat qulf holda qoladi va shu identifikator bilan qayta yuboriladi.
    } finally {
      sending.current = false;
      setSaving(false);
    }
  }

  // Internet tiklanganda yuborilmagan sotuv o'zi qayta yuboriladi (har doim savatning oxirgi holati bilan)
  const retry = useRef(finish);
  useEffect(() => {
    retry.current = finish;
  });
  useEffect(() => {
    if (!cart.pending) return;
    const resend = () => void retry.current();
    window.addEventListener("online", resend);
    return () => window.removeEventListener("online", resend);
  }, [cart.pending]);

  if (context.isLoading) return <Loading />;
  if (!data) return <Alert>{errorText(context.error)}</Alert>;

  const editingLine = cart.lines.find((line) => line.id === editing) ?? null;
  const payments: { value: PaymentType; label: string }[] = [
    { value: "cash", label: t("sales.payment.cash") },
    { value: "card", label: t("sales.payment.card") },
    ...(data.credit_enabled ? [{ value: "credit" as const, label: t("sales.payment.credit") }] : []),
  ];
  const paymentControl = (
    <Segmented<PaymentType>
      label={t("sales.payment.label")}
      value={payment}
      onChange={(next) => change({ payment: next })}
      options={payments}
      disabled={locked}
    />
  );

  // Oddiy holat — savat bo'sh: savat va jami ko'rinmaydi, tovar formaning o'zidan sotiladi
  const simple = (cart.lines.length === 0 || quickSaving) && !uncertain && editing === null;

  /** Tez sotish: bitta tovar savatsiz. Nasiyada mijoz kerak — qator savatga tushadi va mijoz tanlash ochiladi */
  async function quickSell(line: CartLine) {
    if (payment === "credit") return put(line);
    setCart((current) => ({ ...current, lines: [line] }));
    setQuickSaving(true);
    await finish([line]);
    setQuickSaving(false);
  }

  // Yakunlash tugmasi: naqd/kartada — jami qatorida; nasiyada — mijoz va boshlang'ich to'lovdan keyin,
  // sotuvchi telefonda yuqoriga qaytib yurmaydi
  const finishButton = !uncertain && (
    <Button variant="success" size="lg" loading={saving} onClick={() => void finish()}>
      {!saving && <Check className="size-5" aria-hidden="true" />}
      {t("sales.finish")}
    </Button>
  );

  return (
    <div
      className={
        simple
          ? "mx-auto max-w-5xl space-y-4" // tovar tanlanmaganda to'r butun enni ishlatadi; forma o'zi torayadi
          : "space-y-4 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:items-start xl:gap-5 xl:space-y-0"
      }
    >
      {seller && <h1 className="sr-only">{t("store.nav.sale")}</h1>}

      <div className={`space-y-4 ${simple ? "" : "xl:sticky xl:top-20"}`}>
        {others.map((other, index) => (
          <Alert key={index} tone="info">
            {t("sales.pending_other", { seller: other.seller, amount: formatNumber(other.total) })}
          </Alert>
        ))}
        {uncertain && (
          <div className="flex flex-wrap items-center gap-3 rounded-control bg-saffron-soft px-3.5 py-3">
            <WifiOff className="size-5 shrink-0 text-saffron" aria-hidden="true" />
            <p role="status" className="min-w-0 flex-1 basis-56 text-sm">
              {t("sales.pending")}
            </p>
            <Button size="sm" loading={saving} onClick={() => void finish()}>
              {t("sales.retry")}
            </Button>
          </div>
        )}

        {(!locked || quickSaving) &&
          (data.items.length === 0 ? (
            <Alert tone="info">{t("sales.nothing_to_sell")}</Alert>
          ) : (
            <EntryForm
              key={editing ?? "new"}
              items={data.items}
              sellByKg={data.sell_by_kg}
              inCart={inCart}
              initial={editingLine}
              onAdd={put}
              onCancel={() => setEditing(null)}
              quick={
                simple
                  ? {
                      payment: paymentControl,
                      credit: payment === "credit",
                      busy: saving,
                      onSell: (line) => void quickSell(line),
                    }
                  : undefined
              }
            />
          ))}
      </div>

      <div className="space-y-4">
        {!simple && (
        <section className="overflow-hidden rounded-card border border-line bg-panel shadow-card">
          <div className={`${sectionStrip} flex items-center justify-between gap-3`}>
            <h2>{t("sales.cart.title")}</h2>
            {cart.lines.length > 0 && !locked && (
              <button
                ref={clearRef}
                type="button"
                disabled={confirmClear}
                aria-expanded={confirmClear}
                className={`rounded text-indigo hover:underline disabled:opacity-60 ${focusRing}`}
                onClick={(event) => {
                  feedback("warning", event);
                  setConfirmClear(true);
                }}
              >
                {t("sales.cart.clear")}
              </button>
            )}
          </div>
          {confirmClear && cart.lines.length > 0 && (
            <div className="border-b border-line p-3">
              <ConfirmBar
                text={t("sales.cart.clear_confirm", {
                  count: cart.lines.length,
                  defaultValue: "Savatdagi {{count}} ta qator o'chirilsinmi?",
                })}
                confirmLabel={t("sales.cart.clear_yes", { defaultValue: "Ha, tozalash" })}
                onConfirm={clearCart}
                onCancel={() => setConfirmClear(false)}
                returnFocusTo={clearRef}
              />
            </div>
          )}
          {cart.lines.length === 0 ? (
            <p className="px-5 py-8 text-center text-muted">{t("sales.cart.empty")}</p>
          ) : (
            <ol className="divide-y divide-line">
              {cart.lines.map((line, index) => {
                const n = index + 1;
                const noteMissing = needsNote(line) && checked && !line.note.trim();
                return (
                  <li
                    key={line.id}
                    className={`animate-line-in px-4 py-3 transition-colors duration-base sm:px-5 ${
                      line.id === editing ? "bg-indigo-soft/50" : ""
                    }`}
                  >
                    {/* Telefonda ikki qator: tovar va amallar; ostida miqdor va summa. Keng ekranda — bitta qator */}
                    <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[auto_auto_minmax(0,1fr)_6.5rem_7rem_auto]">
                      <span className="w-5 text-center text-sm tabular-nums text-muted">{n}</span>
                      <Thumb imageUrl={line.image_url} hex={line.hex} code={line.sku_code} />
                      <div className="min-w-0">
                        <p className="font-medium sm:truncate">
                          {line.sku_code} <span className="font-normal text-muted">· {line.sku_name}</span>
                        </p>
                        <p className="text-sm text-muted sm:truncate">
                          {line.batch_number} · {formatPrice(line.price, "m", t)}
                        </p>
                      </div>
                      <p className="col-start-3 row-start-2 tabular-nums sm:col-start-4 sm:row-start-1 sm:text-right">
                        {formatDecimal(line.meters)} m
                        {line.kg && (
                          <span className="text-muted sm:block sm:text-[13px]">
                            <span className="sm:hidden"> · </span>
                            {formatDecimal(line.kg)} kg
                          </span>
                        )}
                      </p>
                      <p className="col-start-4 row-start-2 text-right font-medium tabular-nums sm:col-start-5 sm:row-start-1">
                        {formatNumber(lineAmount(line.meters, line.price))}
                      </p>
                      {!locked && (
                        <span className="col-start-4 row-start-1 flex justify-end sm:col-start-6">
                          <button
                            type="button"
                            aria-label={t("sales.cart.edit", { n })}
                            onClick={() => setEditing(line.id)}
                            className={`${iconButton} hover:bg-indigo-soft hover:text-ink active:bg-indigo-soft ${focusRing}`}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={t("sales.cart.remove", { n })}
                            onClick={(event) => {
                              feedback("remove", event);
                              setCart((current) => ({
                                ...current,
                                lines: current.lines.filter((row) => row.id !== line.id),
                              }));
                              if (editing === line.id) setEditing(null);
                            }}
                            className={`${iconButton} hover:bg-madder-soft hover:text-madder active:bg-madder-soft ${focusRing}`}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        </span>
                      )}
                    </div>
                    {needsNote(line) && (
                      <div className="ml-8 mt-2.5">
                        <p id={`note-why-${line.id}`} className="text-sm text-saffron">
                          {line.id in over
                            ? t("sales.cart.note_text", { available: formatDecimal(over[line.id].toFixed(2)) })
                            : t("sales.cart.note_text_plain")}
                        </p>
                        <input
                          aria-label={t("sales.cart.note", { n })}
                          aria-invalid={noteMissing || undefined}
                          aria-describedby={`note-why-${line.id}`}
                          placeholder={t("sales.cart.note_placeholder")}
                          maxLength={300}
                          disabled={locked}
                          value={line.note}
                          onChange={(e) => changeLine(line.id, { note: e.target.value })}
                          className={`mt-1.5 h-11 w-full rounded-control border bg-panel px-3 text-[16px] transition-colors placeholder:text-muted disabled:bg-page ${focusRing} ${
                            noteMissing ? "border-madder focus-visible:ring-madder" : "border-edge focus:border-indigo"
                          }`}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        )}

        {/* Xato va natija — "Yakunlash" tugmasining yonida: telefonda ham ko'rinadi */}
        {done && (
          <Alert tone="success" focus>
            {t("sales.done", { number: done.number, amount: formatNumber(done.total) })}{" "}
            <Link to={`/sales/${done.id}`} className="font-medium underline">
              {t("sales.open_sale")}
            </Link>
            {/* Server shu savatni avval yozgan (javob yo'qolib qayta yuborilgan) — yangidan yozilmagani bilinsin */}
            {done.duplicate && <span className="mt-1 block text-[13px]">{t("sales.done_duplicate", { number: done.number })}</span>}
          </Alert>
        )}
        {error && <Alert focus>{error}</Alert>}

        {/* Jami doim ko'z oldida (keng ekranda yopishib turadi); oddiy holatda — formaning o'zida */}
        {!simple && (
        <section
          className={`z-10 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border border-line bg-panel p-4 shadow-pop ${
            seller ? "sm:sticky sm:bottom-[calc(72px+env(safe-area-inset-bottom,0px))]" : "sm:sticky sm:bottom-3"
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">{t("sales.total")}</p>
            {/* key={total}: summa o'zgarganda qisqa "turtki" — qo'shilgani sezildi */}
            <p
              key={total}
              className="origin-left animate-bump whitespace-nowrap text-2xl font-semibold tabular-nums sm:text-[28px] sm:leading-8"
            >
              {formatNumber(total)} <span className="text-base font-normal text-muted">{sum}</span>
            </p>
          </div>
          {/* Telefonda: jami va "Yakunlash" bir qatorda, to'lov turi — ostida */}
          <div className="order-3 w-full sm:order-2 sm:w-auto">{paymentControl}</div>
          {payment !== "credit" && <div className="order-2 sm:order-3">{finishButton}</div>}
        </section>
        )}

        {payment === "credit" && !simple && (
          <Card title={t("sales.credit.title")} icon={HandCoins} tone="saffron">
            <CustomerPicker value={cart.customer} onChange={(customer) => change({ customer })} disabled={locked} />
            <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
              <div>
                <p className={fieldLabel}>{t("sales.credit.initial")}</p>
                <MoneyInput
                  label={t("sales.credit.initial")}
                  value={cart.initial}
                  onChange={(value) => change({ initial: value })}
                  invalid={initial > total}
                  disabled={locked}
                  placeholder="0"
                  className="w-44"
                />
              </div>
              {initial > 0 && (
                <Segmented<MoneyMethod>
                  label={t("sales.credit.method")}
                  value={cart.initialMethod}
                  onChange={(initialMethod) => change({ initialMethod })}
                  options={[
                    { value: "cash", label: t("sales.payment.cash") },
                    { value: "card", label: t("sales.payment.card") },
                  ]}
                  disabled={locked}
                />
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-sm text-muted">
                {total > 0 && initial === total
                  ? t("sales.credit.paid_in_full")
                  : initial > total
                    ? t("sales.errors.initial")
                    : t("sales.credit.debt", { amount: formatNumber(total - initial) })}
              </p>
              {finishButton}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
