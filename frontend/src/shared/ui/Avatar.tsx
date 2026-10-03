import { TONES, type Tone } from "./tones";

const PALETTE: Tone[] = ["indigo", "leaf", "saffron", "sky", "plum", "coral"];
const SIZES = { sm: "size-8 text-[12px]", md: "size-10 text-sm", lg: "size-12 text-base" };

/** "Sardor Usta" → "SU" */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Ism bosh harflari rangli doirada. Rang ismdan kelib chiqadi — bir odam (yoki biznes) har doim bir xil
 * rangda ko'rinadi va ro'yxatda tez topiladi.
 */
export function Avatar({ name, size = "md" }: { name: string; size?: keyof typeof SIZES }) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 997;
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${SIZES[size]} ${TONES[PALETTE[hash % PALETTE.length]].chip}`}
    >
      {initials(name)}
    </span>
  );
}
