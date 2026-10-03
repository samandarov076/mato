import type { CSSProperties, ReactNode } from "react";

/**
 * Brend belgilari. Ranglar bu yerda qat'iy (rejimga bog'liq emas) — bular mato bo'yoqlari:
 * indigo zamin, za'faron, ro'yan qizili, barg yashili.
 */
const DYE = {
  ground: "#23306B",
  deep: "#1A2452",
  ring: "#31418C",
  inner: "#3D4EA0",
  saffron: "#E0B455",
  madder: "#C2505B",
  leaf: "#6FAE8A",
};

/**
 * Adras (ikat) rombi: pog'onali, tik ustunlardan terilgan. Har ustun biroz yuqori-pastga
 * siljigan — ikatda ip bo'yalganda chetlari shunday "yoyilib" chiqadi.
 */
function Diamond({
  cx,
  cy,
  columns,
  fill,
  colW = 9,
  stepH = 13,
  feathered = true,
}: {
  cx: number;
  cy: number;
  columns: number;
  fill: string;
  colW?: number;
  stepH?: number;
  /** Ustunlarni biroz siljitish (ikat effekti). Kichik belgida o'chiriladi — shakl aniq turishi uchun. */
  feathered?: boolean;
}) {
  const bars = [];
  for (let k = -(columns - 1); k <= columns - 1; k++) {
    const half = (columns - Math.abs(k)) * stepH;
    const drift = feathered ? ((Math.abs(k * 37) % 5) - 2) * 1.3 : 0;
    bars.push(
      <rect
        key={k}
        x={cx + k * colW - colW / 2}
        y={cy - half + drift}
        width={colW + 0.4}
        height={half * 2}
        fill={fill}
      />,
    );
  }
  return <>{bars}</>;
}

export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="8" fill={DYE.ground} />
      <Diamond cx={16} cy={16} columns={3} colW={4.4} stepH={3.6} fill={DYE.saffron} feathered={false} />
      <Diamond cx={16} cy={16} columns={1} colW={4.4} stepH={3.6} fill={DYE.madder} feathered={false} />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5 text-[17px] font-semibold tracking-tight text-ink">
      <LogoMark />
      mato-savdo
    </span>
  );
}

/** Mato milki: ilova tepasidagi ingichka rangli chiziq. */
export function Selvedge() {
  return (
    <div
      aria-hidden="true"
      className="h-1 w-full shrink-0"
      style={{
        background: `linear-gradient(90deg, ${DYE.ground} 0 64%, ${DYE.madder} 64% 76%, ${DYE.saffron} 76% 90%, ${DYE.leaf} 90% 100%)`,
      }}
    />
  );
}

const TILE_W = 176;
const TILE_H = 264;

/** Kirish sahifasining o'ng tomoni: indigo zamindagi adras naqshi. */
export function IkatPanel({ className = "", children }: { className?: string; children?: ReactNode }) {
  const corners: [number, number][] = [
    [0, 0],
    [TILE_W, 0],
    [0, TILE_H],
    [TILE_W, TILE_H],
  ];
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: DYE.ground }}>
      <svg className="absolute inset-0 size-full" aria-hidden="true">
        <defs>
          <pattern
            id="ikat"
            width={TILE_W}
            height={TILE_H}
            patternUnits="userSpaceOnUse"
            patternTransform="scale(1.3)"
          >
            <Diamond cx={TILE_W / 2} cy={TILE_H / 2} columns={9} fill={DYE.ring} />
            <Diamond cx={TILE_W / 2} cy={TILE_H / 2} columns={7} fill={DYE.ground} />
            <Diamond cx={TILE_W / 2} cy={TILE_H / 2} columns={5} fill={DYE.inner} />
            <Diamond cx={TILE_W / 2} cy={TILE_H / 2} columns={3} fill={DYE.saffron} />
            <Diamond cx={TILE_W / 2} cy={TILE_H / 2} columns={2} fill={DYE.ground} />
            <Diamond cx={TILE_W / 2} cy={TILE_H / 2} columns={1} fill={DYE.madder} />
            {corners.map(([x, y]) => (
              <g key={`${x}-${y}`}>
                <Diamond cx={x} cy={y} columns={5} fill={DYE.ring} />
                <Diamond cx={x} cy={y} columns={3} fill={DYE.ground} />
                <Diamond cx={x} cy={y} columns={1} fill={DYE.leaf} />
              </g>
            ))}
          </pattern>
          {/* Tanda iplari: juda nozik tik chiziqlar — naqsh "to'qilgan" ko'rinadi */}
          <pattern id="warp" width="3" height="3" patternUnits="userSpaceOnUse">
            <rect width="1" height="3" fill="#000" opacity="0.14" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ikat)" />
        <rect width="100%" height="100%" fill="url(#warp)" />
      </svg>
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to top, ${DYE.deep} 0%, ${DYE.deep}E6 22%, ${DYE.deep}00 58%)`,
        }}
      />
      <div className="relative flex h-full flex-col justify-end gap-6 p-12 xl:p-16">{children}</div>
    </div>
  );
}

/** Taxlamdagi matolar, pastdan tepaga: har birining usti va yon (qalinlik) rangi. Eng ustkisi — adras. */
const CLOTH = [
  { top: "#4FA878", side: "#2F7A53" },
  { top: "#1C97BC", side: "#0F6A86" },
  { top: DYE.madder, side: "#8E3540" },
  { top: DYE.saffron, side: "#B08A35" },
  { top: DYE.ground, side: DYE.deep },
];

/** Qalinlik: soya qatlamlari ekranda pastga qarab teriladi — mato "plita"dek ko'rinadi. */
function slab(color: string, depth: number) {
  return Array.from({ length: depth }, (_, k) => `${(-0.84 * (k + 1)).toFixed(2)}px ${k + 1}px 0 ${color}`).join(", ");
}

/**
 * 3D mato taxlami: buklangan matolar ustma-ust, burchakdan ko'rinadi. Ochilganda qavatlar tepadan tushib
 * joylashadi, keyin sekin ko'tarilib-tushib turadi. Bezak — ekran o'quvchilari uchun yashirin.
 */
export function FabricStack({
  size = 220,
  layers = CLOTH.length,
  className = "",
  still = false,
}: {
  /** Bitta matoning eni (px); butun rasm shundan ~1.3 baravar joy oladi */
  size?: number;
  layers?: number;
  className?: string;
  /** Faqat tushib joylashadi, keyin qimirlamaydi (kun bo'yi ochiq turadigan sahifalar uchun) */
  still?: boolean;
}) {
  const sheets = CLOTH.slice(CLOTH.length - layers);
  const gap = size * 0.11;
  const depth = Math.max(3, Math.round(size * 0.035));
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none shrink-0 ${className}`}
      style={{ width: size * 1.3, height: size * 1.3, perspective: size * 6 }}
    >
      <div
        className={`fabric-scene relative mx-auto ${still ? "" : "animate-sway"}`}
        style={{ width: size, height: size * 0.72, marginTop: size * 0.55 }}
      >
        <span
          className="absolute inset-0 block"
          style={{
            transform: `translateZ(${-gap}px) translate(-6%, 10%)`,
            background: "rgb(8 10 28 / 0.5)",
            filter: `blur(${size * 0.09}px)`,
            borderRadius: size * 0.08,
          }}
        />
        {sheets.map((sheet, index) => (
          <span
            key={sheet.top}
            className={`fabric-sheet absolute inset-0 block overflow-hidden ${still ? "animate-sheet-still" : "animate-sheet"}`}
            style={
              {
                "--z": `${index * gap}px`,
                "--lift": `${(index + 1) * size * 0.022}px`,
                "--delay": `${index * 0.12}s`,
                "--drop": `${size * 0.8}px`,
                borderRadius: size * 0.06,
                boxShadow: slab(sheet.side, depth),
                // Buklangan chet yorug'roq + nozik to'qima chiziqlari
                background: `linear-gradient(90deg, rgb(255 255 255 / 0.22), rgb(255 255 255 / 0) 34%), repeating-linear-gradient(0deg, rgb(0 0 0 / 0.07) 0 1px, rgb(0 0 0 / 0) 1px 4px), ${sheet.top}`,
              } as CSSProperties
            }
          >
            {index === sheets.length - 1 && (
              <svg viewBox="0 0 100 72" className="size-full">
                <Diamond cx={50} cy={36} columns={5} colW={6} stepH={5.6} fill={DYE.ring} />
                <Diamond cx={50} cy={36} columns={4} colW={6} stepH={5.6} fill={DYE.saffron} />
                <Diamond cx={50} cy={36} columns={2} colW={6} stepH={5.6} fill={DYE.ground} />
                <Diamond cx={50} cy={36} columns={1} colW={6} stepH={5.6} fill={DYE.madder} />
                {[8, 92].map((x) =>
                  [6, 66].map((y) => (
                    <Diamond key={`${x}-${y}`} cx={x} cy={y} columns={2} colW={5} stepH={4.4} fill={DYE.leaf} feathered={false} />
                  )),
                )}
              </svg>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
