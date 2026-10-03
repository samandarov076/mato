import { createRef, useRef, useState, type FormEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Phone, Plus, Power, RotateCcw, Store, TabletSmartphone, Users, Warehouse } from "lucide-react";
import { ApiError, api, patch, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Alert, ConfirmBar, Loading } from "@/shared/ui/feedback";
import { formatPhone, PhoneField, TextField } from "@/shared/ui/fields";
import { actionClass, Chip, Empty, IconChip, RowAction } from "@/shared/ui/list";
import { StoreAccess } from "./StoreAccess";
import { Hint } from "@/shared/ui/Hint";

export type LocationRow = {
  id: number;
  type: "store" | "warehouse";
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  devices_count: number;
  /** Do'kon qurilmasini ochadigan login (faqat do'konda) */
  login: string | null;
  staff: string[];
};

type Errors = { name?: string; phone?: string; form?: string };

// Joy kartochkasi — tileClass bilan bir xil chetlar; faolsiz joy kulrang fonda
const tile = "flex flex-col rounded-card border border-line p-4 shadow-card sm:p-5";

/** Do'konlar yoki skladlar ro'yxati: qo'shish, tahrirlash, faolsizlantirish (o'chirish yo'q). */
export function LocationsPage({ type }: { type: "store" | "warehouse" }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const k = (key: string) => t(`structure.${type}.${key}`);

  const locations = useQuery({
    queryKey: ["locations", type, "all"],
    queryFn: () => api<LocationRow[]>(`/locations?type=${type}&include_inactive=true`),
  });

  // Forma: null — yopiq, "new" — yangi, son — tahrirlanayotgan joy
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  // "Tahrirlash" bosilganda to'ldirilayotgan yangi joy formasi bo'lsa — avval so'raladi
  const [pendingEdit, setPendingEdit] = useState<LocationRow | null>(null);

  // Forma ro'yxat tepasida — "Tahrirlash" bosilganda u ko'rinadigan joyga suriladi
  const formRef = useRef<HTMLDivElement>(null);
  // Faolsizlantirish tugmalari: tasdiq yopilganda fokus o'sha tugmaga qaytadi
  const triggers = useRef(new Map<number, RefObject<HTMLButtonElement>>());
  const triggerFor = (id: number) => {
    let ref = triggers.current.get(id);
    if (!ref) {
      ref = createRef<HTMLButtonElement>();
      triggers.current.set(id, ref);
    }
    return ref;
  };

  const reload = () => queryClient.invalidateQueries({ queryKey: ["locations"] });

  function showForm(row: LocationRow | null) {
    setEditing(row ? row.id : "new");
    setName(row?.name ?? "");
    setAddress(row?.address ?? "");
    setPhone(row?.phone ? row.phone.slice(4) : "");
    setErrors({});
    setPendingEdit(null);
    requestAnimationFrame(() => formRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
  }

  function open(row: LocationRow | null) {
    // Yangi joy formasi to'ldirila boshlagan bo'lsa — uni indamay yo'qotmaymiz
    if (row && editing === "new" && name.trim() !== "") {
      setPendingEdit(row);
      requestAnimationFrame(() => formRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
      return;
    }
    showForm(row);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const found: Errors = {};
    if (name.trim().length < 2) found.name = t("structure.name_short");
    if (type === "store" && phone.length > 0 && phone.length !== 9) {
      found.phone = t("login.phone_incomplete");
    }
    setErrors(found);
    if (found.name || found.phone) {
      feedback("error");
      return;
    }

    const body = {
      name: name.trim(),
      address: address.trim() || null,
      phone: type === "store" && phone ? `+998${phone}` : null,
    };
    setSaving(true);
    try {
      if (editing === "new") await post("/locations", { type, ...body });
      else await patch(`/locations/${editing}`, body);
      setEditing(null);
      await reload();
    } catch (error) {
      if (error instanceof ApiError && error.code === "name_taken") {
        setErrors({ name: errorText(error) });
      } else {
        setErrors({ form: errorText(error) });
      }
    } finally {
      setSaving(false);
    }
  }

  // Faollashtirish/faolsizlantirish — so'rov ketayotganda tugma band, xato o'sha kartochkada ko'rinadi
  const toggle = useMutation({
    mutationFn: ({ row, active }: { row: LocationRow; active: boolean }) =>
      post(`/locations/${row.id}/${active ? "activate" : "deactivate"}`),
    onSuccess: () => {
      setConfirmId(null);
      return Promise.all([reload(), queryClient.invalidateQueries({ queryKey: ["devices"] })]);
    },
  });
  const toggleError = (id: number) =>
    toggle.isError && toggle.variables?.row.id === id ? errorText(toggle.error) : null;

  // Do'kon — pul tushadigan joy (yashil), sklad — tovar turadigan joy (feruza)
  const Icon = type === "store" ? Store : Warehouse;
  const tone = type === "store" ? "leaf" : "sky";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Hint id={`locations-${type}`}>{k("intro")}</Hint>
        {editing === null && (
          <Button onClick={() => open(null)}>
            <Plus className="size-[18px]" aria-hidden="true" />
            {k("add")}
          </Button>
        )}
      </div>

      {editing !== null && (
        <div ref={formRef} className="mt-4 max-w-xl scroll-mt-4">
          <Card title={editing === "new" ? k("add") : k("edit")} icon={Icon} tone={tone}>
            <form onSubmit={save} noValidate className="space-y-5">
              {errors.form && <Alert focus>{errors.form}</Alert>}
              {pendingEdit && (
                <ConfirmBar
                  danger={false}
                  text={t("structure.discard_draft", {
                    name: pendingEdit.name,
                    defaultValue: "To'ldirilayotgan forma yopiladi — {{name}} tahrirlansinmi?",
                  })}
                  confirmLabel={t("structure.edit")}
                  onConfirm={() => showForm(pendingEdit)}
                  onCancel={() => setPendingEdit(null)}
                />
              )}
              <TextField
                label={t("structure.name")}
                value={name}
                onChange={setName}
                error={errors.name}
                maxLength={100}
                autoFocus
              />
              <TextField
                label={t("structure.address")}
                value={address}
                onChange={setAddress}
                hint={t("structure.optional")}
                maxLength={200}
              />
              {type === "store" && (
                <PhoneField
                  label={t("structure.phone")}
                  value={phone}
                  onChange={setPhone}
                  error={errors.phone}
                  hint={t("structure.optional")}
                />
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={saving}>
                  {t("common.save")}
                </Button>
                <Button variant="secondary" onClick={() => (setEditing(null), setPendingEdit(null))}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {locations.isLoading && <Loading className="mt-4" />}
      {locations.isError && (
        <div className="mt-4">
          <Alert>{errorText(locations.error)}</Alert>
        </div>
      )}
      {locations.data?.length === 0 && (
        <section className="mt-4 rounded-card border border-line bg-panel shadow-card">
          <Empty icon={Icon} tone={tone}>
            {k("empty")}
          </Empty>
        </section>
      )}

      {/* Har joy — alohida kartochka: nomi, holati, manzili va unga biriktirilganlar bir qarashda ko'rinadi */}
      <ul className="stagger mt-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
        {locations.data?.map((row) => {
          const confirming = confirmId === row.id;
          const busy = toggle.isPending && toggle.variables?.row.id === row.id;
          const error = toggleError(row.id);
          return (
            <li key={row.id} className={`${tile} ${row.is_active ? "bg-panel" : "bg-page/60"}`}>
              <div className="flex items-start gap-3">
                <IconChip icon={Icon} tone={row.is_active ? tone : "neutral"} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-[17px] font-semibold leading-6 ${row.is_active ? "" : "text-muted"}`}>
                    {row.name}
                  </p>
                  <p className="mt-1">
                    <Chip tone={row.is_active ? "leaf" : "neutral"} dot>
                      {t(row.is_active ? "common.active" : "structure.inactive")}
                    </Chip>
                  </p>
                </div>
              </div>

              <ul className="mt-4 space-y-2 text-sm">
                {row.address && (
                  <li className="flex items-start gap-2.5">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="min-w-0">{row.address}</span>
                  </li>
                )}
                {row.phone && (
                  <li className="flex items-center gap-2.5">
                    <Phone className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="whitespace-nowrap">+998 {formatPhone(row.phone.slice(4))}</span>
                  </li>
                )}
                {type === "store" && (
                  <li className="flex items-center gap-2.5">
                    <TabletSmartphone className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    <span>
                      <span className="text-muted">{t("structure.devices")}:</span> {row.devices_count}
                    </span>
                  </li>
                )}
                <li className="flex items-start gap-2.5">
                  <Users className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="text-muted">{k("staff")}:</span> {row.staff.length ? row.staff.join(", ") : "—"}
                  </span>
                </li>
              </ul>

              {type === "store" && row.is_active && (
                <StoreAccess storeId={row.id} login={row.login} onChanged={() => void reload()} />
              )}

              <div className="mt-auto pt-4">
                <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                  <RowAction icon={Pencil} onClick={() => open(row)}>
                    {t("structure.edit")}
                  </RowAction>
                  {row.is_active ? (
                    // RowAction ref bermaydi; tasdiq yopilganda fokus shu tugmaga qaytishi uchun oddiy tugma
                    <button
                      ref={triggerFor(row.id)}
                      type="button"
                      className={actionClass("danger")}
                      disabled={confirming}
                      aria-expanded={confirming}
                      onClick={(event) => {
                        feedback("warning", event);
                        toggle.reset();
                        setConfirmId(row.id);
                      }}
                    >
                      <Power className="size-3.5 shrink-0" aria-hidden="true" />
                      {t("structure.deactivate")}
                    </button>
                  ) : (
                    <RowAction
                      icon={RotateCcw}
                      tone="success"
                      disabled={busy}
                      onClick={() => toggle.mutate({ row, active: true })}
                    >
                      {t("structure.activate")}
                    </RowAction>
                  )}
                </div>
                {error && (
                  <div className="mt-3">
                    <Alert>{error}</Alert>
                  </div>
                )}
                {confirming && (
                  <div className="mt-3">
                    <ConfirmBar
                      text={k("deactivate_confirm")}
                      confirmLabel={t("structure.deactivate_yes")}
                      busy={busy}
                      onConfirm={() => toggle.mutate({ row, active: false })}
                      onCancel={() => setConfirmId(null)}
                      returnFocusTo={triggerFor(row.id)}
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
