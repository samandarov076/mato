import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { formatDate } from "@/shared/format";
import { Barcode } from "@/shared/ui/Barcode";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Segmented } from "@/shared/ui/controls";
import { focusRing } from "@/shared/ui/tones";

/** Etiketka o'lchamlari (mm). Pilot printeriga qarab ro'yxat kengaytiriladi. */
const SIZES = {
  "58x40": { width: 58, height: 40 },
  "58x30": { width: 58, height: 30 },
  "100x50": { width: 100, height: 50 },
} as const;
type SizeId = keyof typeof SIZES;

/** Etiketkaga kerakli ma'lumot — kirim qatoridan ham, partiya kartochkasidan ham shu ko'rinishda beriladi */
export type LabelItem = {
  id: number;
  /** Partiya raqami — shtrix-kod */
  number: string;
  /** SKU kodi: mato-rang[-gul] */
  code: string;
  /** "Xon atlas · Qizil · Lola" */
  names: string;
  /** Boshlang'ich nusxalar soni (odatda rulonlar soni) */
  copies: number;
};

const STORAGE_KEY = "mato.label_size";
const MAX_LABELS = 500;

function savedSize(): SizeId {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved && saved in SIZES ? (saved as SizeId) : "58x40";
}

/** Bitta etiketka: SKU kodi va nomi, shtrix-kod (partiya raqami), sana. O'lchamlar millimetrda — chop etish uchun. */
function Label({ item, date, size }: { item: LabelItem; date: string; size: SizeId }) {
  const { width, height } = SIZES[size];
  const small = `${height * 0.075}mm`;
  return (
    <div
      className="label"
      style={{
        width: `${width}mm`,
        height: `${height}mm`,
        padding: "2mm 2.5mm",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflow: "hidden",
        background: "#fff",
        color: "#000",
        fontFamily: "Arial, Helvetica, sans-serif",
        lineHeight: 1.15,
      }}
    >
      <div>
        <div style={{ fontSize: `${height * 0.14}mm`, fontWeight: 700, whiteSpace: "nowrap" }}>
          {item.code}
        </div>
        <div style={{ fontSize: small, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {item.names}
        </div>
      </div>
      <div style={{ height: `${height * 0.36}mm` }}>
        <Barcode value={item.number} className="block size-full" />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: small }}>
        <span style={{ fontWeight: 700 }}>{item.number}</span>
        <span>{date}</span>
      </div>
    </div>
  );
}

/**
 * Etiketka chop etish: qaysi partiyalar, nechtadan nusxa va qaysi o'lchamda.
 * Chop etish brauzer orqali: etiketkalar ekranda ko'rinmaydigan varaqqa chiziladi, chop etishda esa
 * faqat shu varaq ko'rinadi (index.css dagi `.print-sheet` qoidalari).
 */
export function LabelPrinter({ items, receiptDate }: { items: LabelItem[]; receiptDate: string }) {
  const { t } = useTranslation();
  const [size, setSize] = useState<SizeId>(savedSize);
  // Har partiyaga nusxalar soni; boshida — rulonlar soniga teng (har rulonga bitta etiketka)
  const [copies, setCopies] = useState<Record<number, string>>({});
  const [printing, setPrinting] = useState(false);

  const date = formatDate(`${receiptDate}T12:00:00+05:00`);
  const count = (item: LabelItem) => {
    const value = copies[item.id] ?? String(item.copies);
    return /^\d+$/.test(value) ? Number(value) : 0;
  };
  const total = items.reduce((sum, item) => sum + count(item), 0);

  function chooseSize(next: SizeId) {
    setSize(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  // Varaq chizilgach chop etish oynasi ochiladi; yopilgach varaq olib tashlanadi
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const timer = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  const { width, height } = SIZES[size];
  return (
    <Card title={t("receiving.labels.title")} icon={Printer} tone="sky">
      <p className="-mt-2 text-sm text-muted">{t("receiving.labels.intro")}</p>

      <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <ul className="divide-y divide-line rounded-control border border-line">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{item.number}</span>
                  <span className="min-w-0 break-words text-sm text-muted">{item.code}</span>
                </span>
                <input
                  aria-label={t("receiving.labels.copies_for", { number: item.number })}
                  inputMode="numeric"
                  value={copies[item.id] ?? String(item.copies)}
                  onChange={(e) =>
                    setCopies({ ...copies, [item.id]: e.target.value.replace(/\D/g, "").slice(0, 3) })
                  }
                  className={`h-9 w-16 rounded-control border border-edge bg-panel px-2 text-right text-[16px] tabular-nums transition-colors focus:border-indigo ${focusRing}`}
                />
                <span className="w-12 text-sm text-muted">{t("receiving.labels.pcs")}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Segmented<SizeId>
              label={t("receiving.labels.size")}
              value={size}
              onChange={chooseSize}
              options={(Object.keys(SIZES) as SizeId[]).map((id) => ({
                value: id,
                label: `${SIZES[id].width}×${SIZES[id].height} mm`,
              }))}
            />
            <Button onClick={() => setPrinting(true)} disabled={total === 0 || total > MAX_LABELS}>
              <Printer className="size-[18px]" aria-hidden="true" />
              {t("receiving.labels.print", { count: total })}
            </Button>
          </div>
          {total > MAX_LABELS && (
            <p role="alert" className="mt-2 text-sm text-madder">
              {t("receiving.labels.too_many", { max: MAX_LABELS })}
            </p>
          )}
        </div>

        {/* Namuna: birinchi partiyaning etiketkasi haqiqiy o'lchamda */}
        {items[0] && (
          <div className="min-w-0">
            <p className="mb-1.5 text-[13px] text-muted">{t("receiving.labels.preview")}</p>
            {/* Katta o'lcham (100×50) tor ekranga sig'maydi — sahifa emas, namunaning o'zi suriladi */}
            <div className="inline-block max-w-full overflow-x-auto overflow-y-hidden rounded-md border border-line align-top shadow-sm">
              <Label item={items[0]} date={date} size={size} />
            </div>
          </div>
        )}
      </div>

      {printing &&
        createPortal(
          <div className="print-sheet">
            <style>{`@page { size: ${width}mm ${height}mm; margin: 0; }`}</style>
            {items.flatMap((item) =>
              Array.from({ length: count(item) }, (_, index) => (
                <Label key={`${item.id}-${index}`} item={item} date={date} size={size} />
              )),
            )}
          </div>,
          document.body,
        )}
    </Card>
  );
}
