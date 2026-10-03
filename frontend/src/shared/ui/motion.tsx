import { useCallback, useEffect, useRef, type HTMLAttributes, type PointerEvent } from "react";
import { formatNumber } from "@/shared/format";

/** Harakat ko'rsatish mumkinmi: "harakatni kamaytirish" yoqilgan qurilmada (va testlarda) — yo'q. */
function motionAllowed() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 3D og'ish: kartochka sichqoncha turgan tomonga buriladi (`.tilt` klassi bilan birga — index.css).
 * Burchaklar to'g'ridan-to'g'ri elementga yoziladi — React qayta chizmaydi, shuning uchun yengil.
 * O'lcham bir marta (kirganda) o'lchanadi; barmoq bilan ishlaydigan qurilmalarda ishlamaydi.
 */
export function useTilt<T extends HTMLElement>(max = 6) {
  const ref = useRef<T>(null);
  const box = useRef<DOMRect | null>(null);

  const onPointerEnter = useCallback((event: PointerEvent<T>) => {
    if (event.pointerType === "mouse" && ref.current) box.current = ref.current.getBoundingClientRect();
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<T>) => {
      const element = ref.current;
      if (!element || event.pointerType !== "mouse" || !motionAllowed()) return;
      const rect = box.current ?? (box.current = element.getBoundingClientRect());
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      element.style.setProperty("--ry", `${((x - 0.5) * 2 * max).toFixed(2)}deg`);
      element.style.setProperty("--rx", `${((0.5 - y) * 2 * max).toFixed(2)}deg`);
      // Yaltirash dog'i piksel bilan siljiydi (gradient qayta chizilmaydi)
      element.style.setProperty("--gx", `${((x - 0.5) * rect.width).toFixed(0)}px`);
      element.style.setProperty("--gy", `${((y - 0.5) * rect.height).toFixed(0)}px`);
    },
    [max],
  );

  const onPointerLeave = useCallback(() => {
    const element = ref.current;
    box.current = null;
    if (!element) return;
    for (const name of ["--rx", "--ry", "--gx", "--gy"]) element.style.removeProperty(name);
  }, []);

  return { ref, onPointerEnter, onPointerMove, onPointerLeave };
}

/** 3D og'adigan kartochka. `glare` — sichqoncha ortidan yuradigan yaltirash (to'q fonli kartochkalar uchun). */
export function Tilt({
  max = 6,
  glare = false,
  className = "",
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { max?: number; glare?: boolean }) {
  const tilt = useTilt<HTMLDivElement>(max);
  return (
    <div {...rest} {...tilt} className={`tilt ${className}`}>
      {children}
      {glare && (
        <span aria-hidden="true" className="tilt-glare">
          <span className="tilt-glare-spot" />
        </span>
      )}
    </div>
  );
}

const COUNT_MS = 500;

// Barcha hisoblagichlar bitta kadr siklidan yuradi: ekranda 7 ta Stat bo'lsa ham bitta rAF
type Tick = (now: number) => boolean; // false — tugadi, obunadan chiqadi
const tickers = new Set<Tick>();
let frame = 0;
function loop(now: number) {
  frame = 0;
  tickers.forEach((tick) => {
    if (!tick(now)) tickers.delete(tick);
  });
  if (tickers.size) frame = requestAnimationFrame(loop);
}
function subscribe(tick: Tick) {
  tickers.add(tick);
  if (!frame) frame = requestAnimationFrame(loop);
  return () => {
    tickers.delete(tick);
  };
}

/**
 * Son 0 dan (yoki oldingi qiymatdan) yangi qiymatgacha "sanab" chiqadi — ko'rsatkich jonli ko'rinadi.
 * Matn DOM'ga to'g'ridan-to'g'ri yoziladi (har kadrda React qayta chizmaydi).
 * Harakat o'chirilgan bo'lsa yoki oyna yashirin bo'lsa — darhol yakuniy qiymat.
 */
export function CountUp({
  value,
  format = formatNumber,
}: {
  value: number;
  format?: (value: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(motionAllowed() ? 0 : value);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!motionAllowed() || document.hidden) {
      shown.current = value;
      element.textContent = format(value);
      return;
    }
    const from = shown.current;
    const started = performance.now();
    return subscribe((now) => {
      const progress = Math.min(1, (now - started) / COUNT_MS);
      const eased = 1 - (1 - progress) ** 3;
      const next = Math.round(from + (value - from) * eased);
      shown.current = next;
      element.textContent = format(next);
      return progress < 1;
    });
  }, [value, format]);

  return <span ref={ref}>{format(shown.current)}</span>;
}
