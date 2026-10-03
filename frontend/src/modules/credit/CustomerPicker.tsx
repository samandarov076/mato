import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus } from "lucide-react";
import { SearchInput } from "@/modules/catalog/parts";
import { ApiError, api, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { formatNumber } from "@/shared/format";
import { Avatar } from "@/shared/ui/Avatar";
import { Button } from "@/shared/ui/Button";
import { Alert, Loading } from "@/shared/ui/feedback";
import { PhoneField, TextField } from "@/shared/ui/fields";
import { focusRing } from "@/shared/ui/tones";
import { creditKeys, phoneText, type CustomerBrief } from "./types";

/** Qarz matni: bor bo'lsa — qizil, yo'q bo'lsa — xira */
function Debt({ amount }: { amount: number }) {
  const { t } = useTranslation();
  return amount > 0 ? (
    <span className="text-madder">{t("credit.customer.debt", { amount: formatNumber(amount) })}</span>
  ) : (
    <span className="text-muted">{t("credit.customer.no_debt")}</span>
  );
}

/**
 * Nasiya uchun mijoz tanlash: ism yoki telefon bo'yicha qidiruv, topilmasa — shu yerning o'zida qo'shish.
 * Tanlashdan oldin mijozning hozirgi qarzi ko'rinadi.
 */
export function CustomerPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: CustomerBrief | null;
  onChange: (customer: CustomerBrief | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  // Qidiruv matni SearchInput ichida kechiktiriladi (300 ms) — bu yerga tayyor qiymat keladi
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const wanted = search.trim();

  const found = useQuery({
    queryKey: creditKeys.search(wanted),
    enabled: value === null && !adding,
    queryFn: () => api<CustomerBrief[]>(`/customers/search?${new URLSearchParams({ q: wanted, limit: "8" })}`),
  });

  function choose(customer: CustomerBrief) {
    setAdding(false);
    setSearch("");
    onChange(customer);
  }

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-control border border-line bg-page/60 px-3.5 py-3">
        <Avatar name={value.name} />
        <div className="min-w-0 flex-1 basis-40">
          <p className="truncate font-medium">{value.name}</p>
          <p className="text-sm text-muted">{phoneText(value.phone)}</p>
          <p className="text-sm">
            <Debt amount={value.debt} />
          </p>
        </div>
        <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onChange(null)}>
          {t("credit.customer.change")}
        </Button>
      </div>
    );
  }

  if (adding) {
    return (
      <NewCustomer
        onCancel={() => setAdding(false)}
        onSaved={(customer) => {
          void queryClient.invalidateQueries({ queryKey: creditKeys.all });
          choose(customer);
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} label={t("credit.customer.search")} />
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <UserPlus className="size-[18px]" aria-hidden="true" />
          {t("credit.customer.add")}
        </Button>
      </div>
      {found.isLoading && <Loading className="mt-3" />}
      {found.isError && (
        <div className="mt-3">
          <Alert>{errorText(found.error)}</Alert>
        </div>
      )}
      {found.isSuccess && found.data.length === 0 && (
        <p role="status" className="mt-3 text-muted">
          {t("credit.customer.not_found")}
        </p>
      )}
      <ul className="mt-2 divide-y divide-line">
        {found.data?.map((customer) => (
          <li key={customer.id}>
            <button
              type="button"
              onClick={(event) => {
                feedback("select", event); // mijoz tanlandi
                choose(customer);
              }}
              className={`pressable flex w-full items-center gap-3 rounded-control px-2 py-2.5 text-left hover:bg-indigo-soft active:bg-indigo-soft ${focusRing}`}
            >
              <Avatar name={customer.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{customer.name}</span>
                <span className="block text-sm text-muted">{phoneText(customer.phone)}</span>
              </span>
              <span className="text-right text-sm tabular-nums">
                <Debt amount={customer.debt} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Yangi mijoz: ism va telefon (mijozlar sahifasida — izoh ham). Telefon boshqa mijozniki bo'lsa —
 * o'sha mijoz taklif qilinadi.
 */
export function NewCustomer({
  onSaved,
  onCancel,
  withNote = false,
}: {
  onSaved: (customer: CustomerBrief) => void;
  onCancel: () => void;
  withNote?: boolean;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<{ id: number; name: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const nameError = checked && name.trim().length < 2 ? t("credit.customer.name_short") : null;
  const phoneError = checked && phone.length !== 9 ? t("login.phone_incomplete") : null;

  async function save(event: FormEvent) {
    event.preventDefault();
    setChecked(true);
    setError(null);
    setExisting(null);
    if (name.trim().length < 2 || phone.length !== 9) return;
    setSaving(true);
    try {
      onSaved(
        await post<CustomerBrief>("/customers", {
          name: name.trim(),
          phone: `+998${phone}`,
          note: note.trim() || null,
        }),
      );
    } catch (failure) {
      const taken = failure instanceof ApiError && failure.code === "customer_phone_taken";
      if (taken && typeof failure.details.customer_id === "number") {
        setExisting({ id: failure.details.customer_id, name: String(failure.details.name) });
      } else {
        setError(errorText(failure));
      }
      setSaving(false);
    }
  }

  /** Telefon egasi bo'lgan mavjud mijozni (qarzi bilan) topib, tanlaydi */
  async function pickExisting() {
    if (!existing) return;
    setSaving(true);
    try {
      const matches = await api<CustomerBrief[]>(`/customers/search?${new URLSearchParams({ q: phone })}`);
      const customer = matches.find((row) => row.id === existing.id);
      if (customer) return onSaved(customer);
      setError(t("credit.customer.not_found"));
    } catch (failure) {
      setError(errorText(failure));
    }
    setSaving(false);
  }

  return (
    <form onSubmit={save} noValidate className="space-y-3">
      {error && <Alert>{error}</Alert>}
      {existing && (
        <div className="flex flex-wrap items-center gap-2 rounded-control bg-saffron-soft px-3.5 py-2.5">
          <p className="min-w-0 flex-1 basis-52 text-sm">{t("credit.customer.taken", { name: existing.name })}</p>
          <Button size="sm" loading={saving} onClick={() => void pickExisting()}>
            {t("credit.customer.use_existing")}
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={t("credit.customer.name")}
          value={name}
          onChange={setName}
          error={nameError}
          maxLength={100}
          autoComplete="off"
          autoFocus
        />
        <PhoneField
          label={t("credit.customer.phone")}
          value={phone}
          onChange={(value) => (setPhone(value), setExisting(null))}
          error={phoneError}
          autoComplete="off"
        />
      </div>
      {withNote && (
        <TextField
          label={t("credit.customer.note")}
          value={note}
          onChange={setNote}
          hint={t("common.optional")}
          placeholder={t("credit.customer.note_placeholder")}
          maxLength={200}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={saving && !existing}>
          {t("credit.customer.save")}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
