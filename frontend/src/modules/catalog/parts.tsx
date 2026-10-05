import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Chip } from "@/shared/ui/list";
import { focusRing, TONES, type Tone } from "@/shared/ui/tones";

const PALETTE: Tone[] = ["plum", "indigo", "sky", "leaf", "saffron", "coral", "rose"];

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

/** Tovar belgisi: rasm, bo'lmasa rang namunasi, u ham bo'lmasa — kodning bosh harflari. */
export function Thumb({
  imageUrl,
  hex,
  code,
  size = "md",
}: {
  imageUrl?: string | null;
  hex?: string | null;
  code: string;
  size?: keyof typeof SIZES;
}) {
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
  // Rasm ham, rang ham yo'q: kod bosh harflari rangli katakchada. Rang koddan kelib chiqadi —
  // bir tovar har doim bir xil rangda ko'rinadi va ro'yxatda tez topiladi.
  let hash = 0;
  for (const char of code) hash = (hash * 31 + char.codePointAt(0)!) % 997;
  return (
    <span
      aria-hidden="true"
      className={`${SIZES[size]} chip-3d grid shrink-0 place-items-center overflow-hidden font-semibold uppercase ${TONES[PALETTE[hash % PALETTE.length]].chip}`}
    >
      {/* "B-7" → "B7": belgi ichida tinish belgilari ko'rsatilmaydi */}
      {(code.replace(/[^\p{L}\p{N}]/gu, "") || code).slice(0, 2)}
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
