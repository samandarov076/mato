import { code128 } from "@/shared/barcode";

/**
 * Shtrix-kod (Code 128) — vektor ko'rinishda: istalgan o'lchamda chop etilsa ham chiziqlar tiniq chiqadi.
 * Eni ota-elementga moslashadi; ikki chetida skaner uchun bo'sh joy (10 modul) qoldiriladi.
 */
export function Barcode({ value, className = "" }: { value: string; className?: string }) {
  const modules = code128(value);
  const quiet = 10;
  // Ketma-ket kelgan qora modullar bitta to'rtburchak bo'ladi
  const bars: { x: number; width: number }[] = [];
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] !== "1") continue;
    const start = i;
    while (modules[i + 1] === "1") i++;
    bars.push({ x: start + quiet, width: i - start + 1 });
  }
  return (
    <svg
      role="img"
      aria-label={value}
      viewBox={`0 0 ${modules.length + quiet * 2} 10`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width="100%" height="10" fill="#fff" />
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} y="0" width={bar.width} height="10" fill="#000" />
      ))}
    </svg>
  );
}
