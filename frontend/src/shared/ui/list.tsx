import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { feedback } from "@/shared/feedback";
import { Button } from "./Button";
import { TONES, type Tone } from "./tones";

/**
 * Ro'yxat va kartochkalarning umumiy qismlari: amal tugmasi, rangli yorliq, belgi katakchasi,
 * "fakt" (nom + qiymat), bo'sh holat, qator va bo'lim sarlavhasi klasslari.
 * Barcha bo'limlar bir xil ko'rinishi uchun shu yerdan olinadi.
 */

/** Ro'yxat qatori (belgi md bilan); `rowClassCompact` — belgi sm bo'lgan zich qatorlar (tarix, jurnal) */
export const rowClass = "reveal px-4 py-3.5 sm:px-5";
export const rowClassCompact = "reveal px-4 py-3 sm:px-5";

/** Panel ichidagi bo'lim sarlavhasi chizig'i — qatorlar bilan bir xil chetlardan */
export const sectionStrip =
  "border-b border-line bg-page/60 px-4 py-2.5 text-[13px] font-medium text-muted sm:px-5";

export function SectionHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`${sectionStrip} ${className}`}>{children}</h2>;
}

type ActionTone = "default" | "danger" | "success";

const ACTION_TONES: Record<ActionTone, string> = {
  default: "hover:border-indigo hover:bg-indigo-soft hover:text-indigo active:bg-indigo-soft",
  danger: "hover:border-madder hover:bg-madder-soft hover:text-madder active:bg-madder-soft",
  success: "hover:border-leaf hover:bg-leaf-soft hover:text-leaf active:bg-leaf-soft",
};

/**
 * Qatordagi ikkinchi darajali amal ko'rinishi — tugma ham, havola ham shu klassni oladi.
 * Sensorli ekranda balandroq (44px) — barmoq bilan bemalol bosiladi.
 */
export function actionClass(tone: ActionTone = "default") {
  return `pressable inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-panel px-2.5 text-[13px] font-medium text-ink disabled:pointer-events-none disabled:opacity-50 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-3 ${ACTION_TONES[tone]}`;
}

/** Qatordagi amal: belgi + nom (Tahrirlash, Faolsizlantirish ...). Xavfli amal ustiga borganda qizaradi. */
export function RowAction({
  icon: Icon,
  tone = "default",
  className = "",
  children,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon; tone?: ActionTone }) {
  return (
    <button
      type="button"
      {...rest}
      className={`${actionClass(tone)} ${className}`}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        feedback(tone === "danger" ? "warning" : "tap", event);
        onClick?.(event);
      }}
    >
      {Icon && <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Rangli yorliq: holat, rol, tur. */
export function Chip({
  tone = "neutral",
  icon: Icon,
  dot = false,
  className = "",
  children,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  /** Matn oldida rangli nuqta (holat uchun) */
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium leading-4 ${TONES[tone].chip} ${className}`}
    >
      {dot && <span aria-hidden="true" className={`size-1.5 rounded-full ${TONES[tone].solid}`} />}
      {Icon && <Icon className="size-3" aria-hidden="true" />}
      {children}
    </span>
  );
}

// Belgi katakchalari o'lchovi: 32 / 40 / 44 (sahifa sarlavhasi) / 48
const CHIP_SIZES = {
  sm: ["size-8 rounded-lg", "size-4"],
  md: ["size-10 rounded-xl", "size-5"],
  title: ["size-11 rounded-xl", "size-[22px]"],
  lg: ["size-12 rounded-2xl", "size-6"],
} as const;

/** Bo'rtib turgan rangli belgi katakchasi. */
export function IconChip({
  icon: Icon,
  tone = "indigo",
  size = "md",
  className = "",
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: keyof typeof CHIP_SIZES;
  className?: string;
}) {
  const [box, glyph] = CHIP_SIZES[size];
  return (
    <span aria-hidden="true" className={`chip-3d grid shrink-0 place-items-center ${box} ${TONES[tone].chip} ${className}`}>
      <Icon className={glyph} />
    </span>
  );
}

/** Fakt: kichik belgi, nom va qiymat (kartochka tepasidagi "Sana / Sklad / Jami" kabi). */
export function Fact({
  icon,
  tone = "neutral",
  label,
  children,
  sub,
}: {
  icon: LucideIcon;
  tone?: Tone;
  label: string;
  children: ReactNode;
  /** Qiymat ostidagi mayda izoh */
  sub?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <IconChip icon={icon} tone={tone} size="sm" className="mt-0.5" />
      <div className="min-w-0">
        <dt className="text-[13px] text-muted">{label}</dt>
        <dd className="font-medium">{children}</dd>
        {sub && <dd className="text-[13px] text-muted">{sub}</dd>}
      </div>
    </div>
  );
}

/** Ma'lumot jadvali: har qatorda chapda nom, o'ngda qiymat (kartochkadagi "Sana / Do'kon / Jami" kabi). */
export function InfoTable({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <dl className={`divide-y divide-line ${className}`}>{children}</dl>;
}

/** `InfoTable` qatori. `strong` — asosiy ko'rsatkich (masalan "Jami"): kattaroq va qalinroq. */
export function InfoRow({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <dt className={`shrink-0 text-muted ${strong ? "" : "text-sm"}`}>{label}</dt>
      <dd className={`min-w-0 break-words text-right tabular-nums ${strong ? "text-lg font-semibold" : "font-medium"}`}>
        {children}
      </dd>
    </div>
  );
}

/** Bo'sh holat: belgi, tushuntirish va (bo'lsa) birinchi qadam tugmasi. */
export function Empty({
  icon: Icon,
  tone = "neutral",
  children,
  action,
}: {
  icon: LucideIcon;
  tone?: Tone;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
      <span aria-hidden="true" className={`grid size-14 place-items-center rounded-2xl ${TONES[tone].chip}`}>
        <Icon className="size-7" />
      </span>
      <p className="max-w-sm text-muted">{children}</p>
      {action}
    </div>
  );
}

/** "Yana ko'rsatish" — barcha sahifalangan ro'yxatlarda bir xil */
export function LoadMore({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3">
      <Button variant="secondary" size="sm" loading={loading} onClick={onClick}>
        {t("common.load_more")}
      </Button>
    </div>
  );
}

/** Kartochka sahifasining tepasidagi "ortga" havolasi */
export function BackLink({ children, className = "", ...rest }: LinkProps) {
  return (
    <Link
      className={`inline-flex min-h-9 items-center gap-1.5 text-sm text-indigo hover:underline ${className}`}
      {...rest}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}
