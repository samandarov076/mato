/** Jadval — hisobotlar va ko'p ustunli ro'yxatlar (≥768px). Bir xil chiziqlar, sarlavha va katak oraliqlari. */
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode, type ThHTMLAttributes } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp } from "lucide-react";
import { focusRing } from "./tones";

/** Jadval qobig'i: tor ekranda `.rtable` (index.css) qatorlarni kartochkaga aylantiradi */
export function Table({
  head,
  children,
  label,
  flush = false,
  compact = false,
  dense = false,
}: {
  head: ReactNode;
  children: ReactNode;
  /** Ekran o'quvchi uchun jadval nomi */
  label?: string;
  /** Tor ustunda turgan kichik jadval — eng kichik en talab qilinmaydi */
  compact?: boolean;
  /** Ustunlari ko'p jadval: planshetda (768–1023px) matn biroz kichrayadi — yonga surilmasdan sig'adi */
  dense?: boolean;
  /** Tashqi kartochka ichida (ramka va soyasiz) */
  flush?: boolean;
}) {
  const ref = useRef<HTMLTableElement>(null);
  // Telefonda sarlavha qatori yashiriladi — har katakka o'z ustun nomi yozib qo'yiladi (index.css: .rtable)
  useEffect(() => {
    const table = ref.current;
    if (!table) return;
    const labels = [...table.querySelectorAll("thead th")].map((cell) => cell.textContent ?? "");
    for (const row of table.querySelectorAll("tbody tr")) {
      [...row.children].forEach((cell, index) => cell.setAttribute("data-label", labels[index] ?? ""));
    }
    // Telefonda CSS jadvalni kartochkaga aylantiradi (display o'zgaradi) — ARIA rollari jadval ma'nosini saqlab qoladi
    table.setAttribute("role", "table");
    table.querySelectorAll("thead, tbody").forEach((group) => group.setAttribute("role", "rowgroup"));
    table.querySelectorAll("tr").forEach((row) => row.setAttribute("role", "row"));
    table.querySelectorAll("th").forEach((cell) => {
      cell.setAttribute("role", "columnheader");
      if (!cell.hasAttribute("scope")) cell.setAttribute("scope", "col");
    });
    table.querySelectorAll("td").forEach((cell) => cell.setAttribute("role", "cell"));
  });
  return (
    <div className={`overflow-x-auto ${flush ? "" : "rounded-card border border-line bg-panel shadow-card"}`}>
      <table ref={ref} aria-label={label} className={`rtable w-full text-left tabular-nums ${compact ? "" : "md:min-w-[640px]"} ${
          dense ? "md:max-lg:text-sm" : ""
        }`}>
        <thead className="border-b border-line bg-page/60 text-[13px] text-muted">{head}</thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const th = "px-2.5 py-2.5 font-medium first:pl-5 last:pr-5 lg:px-4";
export const td = "px-2.5 py-3 first:pl-5 last:pr-5 lg:px-4";
/** Raqam ustuni: o'ngga tekislangan, qatorda bo'linmaydi */
export const num = "whitespace-nowrap text-right";

/** Ustun sarlavhasi: `scope="col"` — ekran o'quvchi har katakka ustun nomini qo'shib o'qiydi */
export function Th({ className = "", ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={`${th} ${className}`} {...rest} />;
}

/** Bosilsa shu ustun bo'yicha saralaydigan sarlavha; faol ustunda yo'nalish belgisi (`aria-sort`) */
export function SortTh({
  active,
  direction,
  onSort,
  className = "",
  children,
}: {
  active: boolean;
  direction: "asc" | "desc";
  onSort: () => void;
  className?: string;
  children: ReactNode;
}) {
  const Arrow = direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={`${th} ${className}`}
    >
      <button
        type="button"
        onClick={onSort}
        className={`inline-flex items-center gap-1 rounded font-medium hover:text-ink ${focusRing} ${active ? "text-ink" : ""}`}
      >
        {children}
        <Arrow className={`size-3.5 ${active ? "" : "opacity-0"}`} aria-hidden="true" />
      </button>
    </th>
  );
}

/**
 * Butun qatori bosiladigan jadval qatori (kartochkani ochadi). Qator ichidagi havola yoki tugma bosilsa — o'shaning
 * o'zi ishlaydi. Klaviatura: birinchi katakdagi havola orqali (qatorning o'zi fokus olmaydi — Tab ortmaydi).
 */
export function LinkRow({ to, className = "", children }: { to: string; className?: string; children: ReactNode }) {
  const navigate = useNavigate();
  const open = (event: MouseEvent<HTMLTableRowElement> | KeyboardEvent<HTMLTableRowElement>) => {
    if ((event.target as HTMLElement).closest("a, button, input, select, summary")) return;
    if (window.getSelection()?.toString()) return; // matn belgilanayotgan bo'lsa — ochilmaydi
    navigate(to);
  };
  return (
    <tr onClick={open} className={`group cursor-pointer transition-colors hover:bg-page/60 ${className}`}>
      {children}
    </tr>
  );
}
