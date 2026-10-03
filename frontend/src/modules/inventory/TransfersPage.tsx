import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ArrowLeftRight, ArrowRight, ChevronRight, Plus } from "lucide-react";
import { useCurrentUser } from "@/modules/auth/AuthProvider";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDateTime, formatDecimal } from "@/shared/format";
import { ButtonLink } from "@/shared/ui/Button";
import { Segmented } from "@/shared/ui/controls";
import { Alert, Loading } from "@/shared/ui/feedback";
import { Chip, Empty, IconChip, LoadMore, rowClass } from "@/shared/ui/list";
import type { Tone } from "@/shared/ui/tones";
import { InventoryHeader } from "./InventoryHeader";
import { inventoryKeys, type TransferPage, type TransferRow, type TransferStatus } from "./types";

const PAGE_SIZE = 50;

/** Holat belgisi: yo'lda — e'tibor talab qiladi; farq bilan qabul qilingan — alohida ko'rinadi. */
export function TransferStatusChip({ status, hasDiff }: { status: TransferStatus; hasDiff: boolean }) {
  const { t } = useTranslation();
  const tone: Tone =
    status === "in_transit" ? "saffron" : status === "cancelled" ? "neutral" : hasDiff ? "madder" : "leaf";
  return (
    <Chip tone={tone} dot>
      {t(status === "received" && hasDiff ? "inventory.transfer.status.received_diff" : `inventory.transfer.status.${status}`)}
    </Chip>
  );
}

/** Ko'chirishlar ro'yxati: qabul kutayotganlari tepada. */
export function TransfersPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const { user } = useCurrentUser();
  const [status, setStatus] = useState<TransferStatus | "">("");

  const transfers = useInfiniteQuery({
    queryKey: inventoryKeys.transfers(status),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(pageParam) });
      if (status) query.set("status", status);
      return api<TransferPage>(`/transfers?${query}`);
    },
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((total, page) => total + page.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const rows = transfers.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div>
      <InventoryHeader
        title={t("inventory.tab_transfers")}
        action={
          // Ko'chirishni biznes egasi va omborchi yaratadi; sotuvchi faqat qabul qiladi
          user.role !== "seller" && (
            <ButtonLink to="/transfers/new">
              <Plus className="size-[18px]" aria-hidden="true" />
              {t("inventory.transfer.create")}
            </ButtonLink>
          )
        }
      />
      <p className="mt-6 max-w-2xl text-muted">{t("inventory.transfer.intro")}</p>

      <div className="mt-5 overflow-x-auto">
        <Segmented<TransferStatus | "">
          label={t("inventory.transfer.status_filter")}
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: t("common.all") },
            { value: "in_transit", label: t("inventory.transfer.status.in_transit") },
            { value: "received", label: t("inventory.transfer.status.received") },
            { value: "cancelled", label: t("inventory.transfer.status.cancelled") },
          ]}
        />
      </div>

      <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel shadow-card">
        {transfers.isLoading && <Loading className="px-4 py-6 sm:px-5" />}
        {transfers.isError && (
          <div className="p-5">
            <Alert>{errorText(transfers.error)}</Alert>
          </div>
        )}
        {transfers.isSuccess && rows.length === 0 && (
          <Empty icon={ArrowLeftRight} tone="coral">
            {t(status ? "inventory.transfer.empty_filtered" : "inventory.transfer.empty")}
          </Empty>
        )}
        <ul className="divide-y divide-line">
          {rows.map((row) => (
            <TransferLine key={row.id} row={row} />
          ))}
        </ul>
      </section>

      {transfers.hasNextPage && (
        <LoadMore loading={transfers.isFetchingNextPage} onClick={() => void transfers.fetchNextPage()} />
      )}
    </div>
  );
}

function TransferLine({ row }: { row: TransferRow }) {
  const { t } = useTranslation();
  return (
    <li className={row.status === "cancelled" ? "bg-page/60" : ""}>
      <Link
        to={`/transfers/${row.id}`}
        className={`pressable group flex items-center gap-3 transition-colors hover:bg-page/60 active:bg-page sm:gap-4 ${rowClass}`}
      >
        {/* Bekor qilingan ko'chirish rangsiz — ro'yxatda ko'zga tashlanmaydi */}
        <IconChip icon={ArrowLeftRight} tone={row.status === "cancelled" ? "neutral" : "coral"} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium group-hover:text-indigo">{row.number}</span>
            <TransferStatusChip status={row.status} hasDiff={row.has_diff} />
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2">
            {row.source.name}
            <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
            {row.target.name}
          </span>
          <span className="mt-0.5 block text-sm text-muted">
            {t("receiving.batches_count", { count: row.lines_count })} · {formatDecimal(row.sent_m)} m ·{" "}
            {row.sent_by.name}, {formatDateTime(row.sent_at)}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
      </Link>
    </li>
  );
}
