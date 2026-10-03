import { useTranslation } from "react-i18next";
import { Chip } from "@/shared/ui/list";

/** Platforma panelidagi biznes — serverdagi ko'rinish (ro'yxat qatori). */
export type BusinessRow = {
  id: number;
  name: string;
  status: "active" | "blocked";
  created_at: string;
  last_activity_at: string | null;
  stores_count: number;
  staff_count: number;
  owner: { full_name: string; phone: string | null } | null;
};

/** Biznes holati — umumiy Chip (nuqta bilan): faol — yashil, bloklangan — qizil */
export function StatusChip({ status }: { status: BusinessRow["status"] }) {
  const { t } = useTranslation();
  return (
    <Chip tone={status === "active" ? "leaf" : "madder"} dot>
      {t(`platform.status.${status}`)}
    </Chip>
  );
}

export { SecretBox } from "@/shared/ui/SecretBox";

export const formatPhoneFull = (phone: string | null) =>
  phone ? `+998 ${phone.slice(4, 6)} ${phone.slice(6, 9)} ${phone.slice(9, 11)} ${phone.slice(11)}` : "—";
