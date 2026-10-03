import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, PackageCheck, ScanLine } from "lucide-react";
import { useCurrentUser } from "@/modules/auth/AuthProvider";
import { Thumb } from "@/modules/catalog/parts";
import { api } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { formatDecimal } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Alert, Loading } from "@/shared/ui/feedback";
import { TextField } from "@/shared/ui/fields";
import { Empty, rowClass, SectionHeader } from "@/shared/ui/list";
import { PageTitle } from "@/shared/ui/PageTitle";
import { inventoryKeys, skuNames, type StockPage } from "./types";

/**
 * Partiyani yopish (do'kon qurilmasi): etiketka skaner qilinadi yoki raqam yoziladi → partiya kartochkasi
 * ochiladi, yopish o'sha yerda tasdiqlanadi. Pastda — shu do'kondagi partiyalar, qoldig'i ozi tepada.
 */
export function CloseBatchPage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { store } = useCurrentUser();
  const [number, setNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  // Shu do'kondagi ochiq partiyalar (do'kon noma'lum bo'lsa — barcha joylar)
  const stock = useQuery({
    queryKey: inventoryKeys.stock(`close-${store?.id ?? "all"}`),
    queryFn: () => api<StockPage>(`/stock?limit=200${store ? `&location_id=${store.id}` : ""}`),
  });
  const here = (stock.data?.items ?? [])
    .flatMap((item) =>
      item.batches.flatMap((batch) =>
        batch.stocks
          .filter((cell) => !store || cell.location_id === store.id)
          .map((cell) => ({ batch, sku: item.sku, qty: cell.qty_m, rolls: cell.rolls })),
      ),
    )
    .sort((a, b) => Number(a.qty) - Number(b.qty));

  async function find(event: FormEvent) {
    event.preventDefault();
    const wanted = number.trim();
    if (!wanted) return;
    setSearching(true);
    setError(null);
    try {
      // Skaner Enter yuboradi — raqam topilsa, kartochka darhol ochiladi; "ortga" shu sahifaga qaytaradi
      const { id } = await api<{ id: number }>(`/batches/by-number/${encodeURIComponent(wanted)}`);
      navigate(`/batches/${id}`, { state: { from: "/close" } });
    } catch (failure) {
      setError(errorText(failure));
      setSearching(false);
    }
  }

  return (
    <div>
      <PageTitle icon={PackageCheck} tone="plum">
        {t("inventory.close.title")}
      </PageTitle>
      <p className="mt-2 max-w-2xl text-muted">{t("inventory.close.intro")}</p>

      <Card className="mt-5 max-w-xl">
        <form onSubmit={find} noValidate className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <TextField
              label={t("inventory.close.number")}
              value={number}
              onChange={(value) => (setNumber(value), setError(null))}
              error={error}
              placeholder="P-000123"
              autoComplete="off"
              autoFocus
            />
          </div>
          <Button type="submit" loading={searching} className={error ? "mb-[26px]" : ""}>
            <ScanLine className="size-[18px]" aria-hidden="true" />
            {t("inventory.close.find")}
          </Button>
        </form>
      </Card>

      <section className="mt-5 overflow-hidden rounded-card border border-line bg-panel shadow-card">
        <SectionHeader>
          {store ? t("inventory.close.here", { place: store.name }) : t("inventory.close.everywhere")}
        </SectionHeader>
        {stock.isLoading && <Loading className="px-4 py-6 sm:px-5" />}
        {stock.isError && (
          <div className="p-5">
            <Alert>{errorText(stock.error)}</Alert>
          </div>
        )}
        {stock.isSuccess && here.length === 0 && (
          <Empty icon={PackageCheck} tone="sky">
            {t("inventory.close.nothing")}
          </Empty>
        )}
        <ul className="divide-y divide-line">
          {here.map(({ batch, sku, qty, rolls }) => (
            <li key={`${batch.id}-${sku.id}`}>
              <Link
                to={`/batches/${batch.id}`}
                state={{ from: "/close" }}
                className={`pressable group flex items-center gap-3 transition-colors hover:bg-page/60 active:bg-page sm:gap-4 ${rowClass}`}
              >
                <Thumb imageUrl={sku.image_url} hex={sku.hex} code={sku.code} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium group-hover:text-indigo">{batch.number}</span>
                  <span className="block truncate text-sm text-muted">
                    {sku.code} · {skuNames(sku)}
                  </span>
                </span>
                <span className={`shrink-0 text-right tabular-nums ${Number(qty) < 0 ? "text-madder" : ""}`}>
                  <span className="whitespace-nowrap font-semibold">{formatDecimal(qty)} m</span>
                  <span className="block whitespace-nowrap text-[13px] text-muted">
                    {t("inventory.rolls_about", { count: rolls })}
                  </span>
                </span>
                <ChevronRight
                  className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
