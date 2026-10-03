import { useEffect, useState, type CSSProperties } from "react";
import { feedback } from "@/shared/feedback";

// Mato bo'yoqlari: indigo, za'faron, ro'yan, barg, feruza, binafsha
const COLORS = ["#3C4CC4", "#E0B455", "#C2505B", "#4FA878", "#0A8AB0", "#8A52C8"];
const LIFETIME_MS = 4600;

type Piece = {
  left: number;
  size: number;
  round: boolean;
  color: string;
  style: CSSProperties;
};

function makePieces(count: number): Piece[] {
  return Array.from({ length: count }, (_, index) => {
    const size = 6 + Math.random() * 6;
    return {
      left: Math.random() * 100,
      size,
      round: Math.random() > 0.7,
      color: COLORS[index % COLORS.length],
      style: {
        "--drift": `${(Math.random() - 0.5) * 240}px`,
        "--spin": `${(360 + Math.random() * 720) * (Math.random() > 0.5 ? 1 : -1)}deg`,
        "--time": `${2.2 + Math.random() * 1.8}s`,
        "--delay": `${Math.random() * 0.7}s`,
      } as CSSProperties,
    };
  });
}

/**
 * Tabrik effekti: rangli qog'ozchalar tepadan to'kiladi va bir necha soniyada yo'qoladi.
 * Faqat kamdan-kam, quvonchli paytlarda ishlatiladi (masalan, yangi biznes yaratilganda) — kundalik
 * amallarda emas. "Harakatni kamaytirish" yoqilgan qurilmalarda ko'rinmaydi (index.css).
 */
export function Confetti({ pieces = 80 }: { pieces?: number }) {
  const [items] = useState(() => makePieces(pieces));
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    feedback("celebrate");
    const timer = window.setTimeout(() => setFinished(true), LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (finished) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {items.map((piece, index) => (
        <span
          key={index}
          className="absolute top-0 block animate-confetti"
          style={{
            ...piece.style,
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.round ? piece.size : piece.size * 1.8,
            borderRadius: piece.round ? "50%" : 2,
            background: piece.color,
          }}
        />
      ))}
    </div>
  );
}
