import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Chip } from "@/shared/ui/list";
import { focusRing } from "@/shared/ui/tones";


// IconChip va Avatar bilan bir o'lchovda (32 / 40 / 48); xl — kartochka sarlavhasidagi katta namuna
const SIZES = {
  sm: "size-8 rounded-lg text-[10px]",
  md: "size-10 rounded-xl text-xs",
  lg: "size-12 rounded-2xl text-sm",
  xl: "size-16 rounded-2xl text-base",
  // Sotuvda tanlangan tovar: sotuvchi matoni rasmdan bir qarashda taniydi
  hero: "size-28 rounded-2xl text-2xl sm:size-36",
};
const PIXELS = { sm: 32, md: 40, lg: 48, xl: 64, hero: 144 };

/** Rasmning kichik varianti (96px) — ro'yxat va chiplar uchun; katta fayl faqat xl va hero da */
function thumbUrl(url: string, size: keyof typeof SIZES) {
  return size === "xl" || size === "hero" ? url : url.replace(/\.webp$/, ".s.webp");
}

/** Bosilganda to'liq ekranda ochiladigan rasm: Esc, yopish tugmasi yoki tashqarisini bosish yopadi. */
function ZoomThumb({ imageUrl, size, alt }: { imageUrl: string; size: keyof typeof SIZES; alt: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLSpanElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    closer.current?.focus();
    const back = opener.current; // yopilganda fokus rasm tugmasiga qaytadi
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      back?.focus({ preventScroll: true });
    };
  }, [open]);
  // Ko'pincha tanlov tugmasi yoki qator havolasi ICHIDA turadi — shuning uchun <button> emas, role="button" li span:
  // bosish va klaviatura hodisalari ota-elementga o'tkazilmaydi (rasm kattalashadi, tanlov / havola ishlamaydi).
  // Oyna portalda chizilsa ham React hodisalari ota-komponentga ko'tariladi — u yerda ham to'xtatiladi.
  const stop = (event: { stopPropagation: () => void; preventDefault: () => void }) => {
    event.stopPropagation();
    event.preventDefault();
  };
  return (
    <>
      <span
        ref={opener}
        role="button"
        tabIndex={0}
        aria-label={t("image.zoom")}
        onClick={(event) => (stop(event), setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            stop(event);
            setOpen(true);
          }
        }}
        className={`pressable inline-block shrink-0 cursor-zoom-in ${SIZES[size].split(" ").filter((name) => name.startsWith("rounded")).join(" ")} ${focusRing}`}
      >
        <img
          src={thumbUrl(imageUrl, size)}
          alt=""
          loading="lazy"
          decoding="async"
          width={PIXELS[size]}
          height={PIXELS[size]}
          className={`${SIZES[size]} border border-line object-cover`}
        />
      </span>
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t("image.zoom")}
            onClick={(event) => (stop(event), setOpen(false))}
            onKeyDown={(event) => event.stopPropagation()}
            className="fixed inset-0 z-50 grid cursor-zoom-out place-items-center bg-ink/80 p-4"
          >
            <img src={imageUrl} alt={alt} className="max-h-full max-w-full rounded-card object-contain shadow-pop" />
            <button
              ref={closer}
              type="button"
              onClick={(event) => (stop(event), setOpen(false))}
              className={`absolute right-4 top-4 rounded-control bg-panel px-3 py-2 text-sm font-medium shadow-pop ${focusRing}`}
            >
              {t("image.close")}
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Tovar belgisi: rasm, bo'lmasa rang namunasi, u ham bo'lmasa — kodning bosh harflari. */
export function Thumb({
  imageUrl,
  hex,
  code,
  size = "md",
  zoom = true,
}: {
  imageUrl?: string | null;
  hex?: string | null;
  code: string;
  size?: keyof typeof SIZES;
  /** Rasm bosilsa to'liq ekranda ochiladi (faqat rasm bo'lsa; standart — ha). Tugma yoki havola ichida ham ishlaydi:
   *  bosish ota-elementga o'tmaydi — rasm kattalashadi, yozuv esa o'z amalini bajaradi */
  zoom?: boolean;
}) {
  if (imageUrl && zoom) return <ZoomThumb imageUrl={imageUrl} size={size} alt={code} />;
  if (imageUrl) {
    return (
      <img
        src={thumbUrl(imageUrl, size)}
        alt=""
        loading="lazy"
        decoding="async"
        width={PIXELS[size]}
        height={PIXELS[size]}
        className={`${SIZES[size]} shrink-0 border border-line object-cover`}
      />
    );
  }
  if (hex) {
    return (
      <span
        aria-hidden="true"
        className={`${SIZES[size]} shrink-0 border border-ink/20`}
        style={{ backgroundColor: hex }}
      />
    );
  }
  // Rasm ham, rang ham yo'q: neytral mato belgisi (to'qima chiziqlari). Kod harflari ("AT", "05") ko'rsatilmaydi —
  // ular rasm yoki rang deb o'qilib, chalg'itardi (docs/03-details/03-katalog.md).
  return (
    <span
      aria-hidden="true"
      data-thumb="blank"
      className={`${SIZES[size]} grid shrink-0 place-items-center overflow-hidden border border-line bg-page text-edge`}
    >
      <svg viewBox="0 0 24 24" className="size-3/5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <path d="M5 4v16M12 4v16M19 4v16M4 8h16M4 16h16" />
      </svg>
    </span>
  );
}

export function InactiveChip() {
  const { t } = useTranslation();
  return <Chip>{t("common.inactive")}</Chip>;
}

/**
 * Ro'yxat tepasidagi qidiruv maydoni. Yozilgan matn shu yerda turadi va 300 ms tinganda chiqariladi —
 * har harfda butun ro'yxat qayta chizilmaydi. `visibleLabel` — nom maydon ustida ham ko'rinadi.
 */
export function SearchInput({
  value,
  onChange,
  label,
  visibleLabel = false,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  visibleLabel?: boolean;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState(value);
  const latest = useRef(onChange);
  latest.current = onChange;
  // Tashqaridan tozalansa (filtrlarni tozalash) — maydon ham tozalanadi
  useEffect(() => {
    setText(value);
  }, [value]);
  useEffect(() => {
    if (text === value) return;
    const timer = window.setTimeout(() => latest.current(text), 300);
    return () => window.clearTimeout(timer);
  }, [text, value]);

  return (
    <div className="min-w-0 flex-1 basis-60">
      {visibleLabel && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
          {label}
        </label>
      )}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <input
          id={id}
          type="search"
          aria-label={visibleLabel ? undefined : label}
          placeholder={label}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          className={`h-11 w-full rounded-control border border-edge bg-panel pl-9 pr-3 text-[16px] text-ink transition-colors placeholder:text-muted focus:border-indigo ${focusRing}`}
        />
      </div>
    </div>
  );
}

/** "Faolsizlarni ham ko'rsatish" belgisi */
export function ShowInactive({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-[rgb(var(--indigo))]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {t("catalog.show_inactive")}
    </label>
  );
}

export const linkButton = "rounded text-sm text-indigo hover:underline";
