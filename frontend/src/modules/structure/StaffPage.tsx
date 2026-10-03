import { createRef, useRef, useState, type FormEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound, LockKeyhole, MapPin, Pencil, Phone, Plus, Power, RotateCcw, UserPlus, Users } from "lucide-react";
import { useCurrentUser } from "@/modules/auth/AuthProvider";
import { ApiError, api, patch, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Segmented, Toggle } from "@/shared/ui/controls";
import { Avatar } from "@/shared/ui/Avatar";
import { Alert, ConfirmBar, Loading } from "@/shared/ui/feedback";
import { fieldLabel, formatPhone, PasswordField, PhoneField, TextField } from "@/shared/ui/fields";
import { actionClass, Chip, Empty, RowAction, rowClass } from "@/shared/ui/list";
import type { Tone } from "@/shared/ui/tones";
import type { LocationRow } from "./LocationsPage";
import { SecretBox } from "@/shared/ui/SecretBox";

type Role = "owner" | "warehouse" | "seller";

type StaffRow = {
  id: number;
  full_name: string;
  role: Role;
  phone: string | null;
  is_primary_owner: boolean;
  is_active: boolean;
  all_locations: boolean;
  location_ids: number[];
  has_pin: boolean;
};

type Form = {
  id: number | null; // null — yangi xodim
  role: Role;
  fullName: string;
  phone: string;
  password: string;
  pin: string;
  allLocations: boolean;
  locationIds: number[];
};

type Errors = Partial<Record<"fullName" | "phone" | "password" | "pin" | "locations" | "form", string>>;
type PendingAction = { kind: "password" | "pin" | "deactivate"; id: number } | null;

// Rol rangi: ega — indigo, omborchi — feruza (ombor), sotuvchi — yashil (sotuv)
const ROLE_TONE: Record<Role, Tone> = { owner: "indigo", warehouse: "sky", seller: "leaf" };

const EMPTY: Form = {
  id: null,
  role: "seller",
  fullName: "",
  phone: "",
  password: "",
  pin: "",
  allLocations: true,
  locationIds: [],
};

const onlyDigits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

/** Xodimlar: qo'shish, joylarga biriktirish, PIN va parolni yangilash, faolsizlantirish. */
export function StaffPage() {
  const { t } = useTranslation();
  const { user: me } = useCurrentUser();
  const errorText = useErrorText();
  const queryClient = useQueryClient();

  const staff = useQuery({ queryKey: ["users"], queryFn: () => api<StaffRow[]>("/users") });
  const locations = useQuery({
    queryKey: ["locations", "all"],
    queryFn: () => api<LocationRow[]>("/locations?include_inactive=true"),
  });

  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  // Qo'shilgandan keyingi xabar va ro'yxatda ajratib ko'rsatiladigan yangi qator
  const [notice, setNotice] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);
  // "Tahrirlash" bosilganda to'ldirilayotgan yangi xodim formasi bo'lsa — avval so'raladi
  const [pendingEdit, setPendingEdit] = useState<StaffRow | null>(null);
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [showInactive, setShowInactive] = useState(false);
  const [action, setAction] = useState<PendingAction>(null);
  const [actionValue, setActionValue] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [activating, setActivating] = useState<number | null>(null);
  // Ko'rsatilayotgan parol yoki PIN (bir vaqtda bitta xodimniki). value === null — hali saqlanmagan
  const [shown, setShown] = useState<{ id: number; kind: "password" | "pin"; value: string | null } | null>(null);
  const [revealing, setRevealing] = useState<number | null>(null);
  const [revealError, setRevealError] = useState<{ id: number; text: string } | null>(null);

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

  const reload = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["users"] }),
      queryClient.invalidateQueries({ queryKey: ["locations"] }),
    ]);

  const locationName = (id: number) => locations.data?.find((l) => l.id === id)?.name ?? "—";
  const choices = (role: Role) =>
    (locations.data ?? []).filter(
      (l) => l.is_active && l.type === (role === "seller" ? "store" : "warehouse"),
    );
  /** Egalarni faqat asosiy ega boshqaradi; asosiy eganing o'zi bu yerda o'zgartirilmaydi */
  const manageable = (row: StaffRow) =>
    !row.is_primary_owner && (row.role !== "owner" || me.is_primary_owner);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    if (form) setForm({ ...form, [key]: value });
  }

  function showForm(next: Form) {
    setErrors({});
    setNotice(null);
    setPendingEdit(null);
    setForm(next);
    requestAnimationFrame(() => formRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
  }

  function openEdit(row: StaffRow) {
    // Yangi xodim formasi to'ldirila boshlagan bo'lsa — uni indamay yo'qotmaymiz
    if (form && form.id === null && form.fullName.trim() !== "") {
      setPendingEdit(row);
      requestAnimationFrame(() => formRef.current?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
      return;
    }
    showForm({
      ...EMPTY,
      id: row.id,
      role: row.role,
      fullName: row.full_name,
      phone: row.phone ? row.phone.slice(4) : "",
      allLocations: row.all_locations,
      locationIds: row.location_ids,
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    const isNew = form.id === null;
    const needsLogin = form.role !== "seller"; // telefon + parol bilan kiradiganlar
    const found: Errors = {};
    if (form.fullName.trim().length < 2) found.fullName = t("structure.name_short");
    if (needsLogin && form.phone.length !== 9) found.phone = t("login.phone_incomplete");
    if (isNew && needsLogin && form.password.length < 6) found.password = t("password.too_short");
    if (isNew && !needsLogin && form.pin.length !== 4) found.pin = t("structure.staff.pin_invalid");
    if (form.role !== "owner" && !form.allLocations && form.locationIds.length === 0) {
      found.locations = t("structure.staff.locations_required");
    }
    setErrors(found);
    if (Object.keys(found).length > 0) {
      feedback("error");
      return;
    }

    const common = {
      full_name: form.fullName.trim(),
      phone: needsLogin ? `+998${form.phone}` : null,
      all_locations: form.allLocations,
      location_ids: form.allLocations ? [] : form.locationIds,
    };
    setSaving(true);
    try {
      if (isNew) {
        const created = await post<StaffRow | undefined>("/users", {
          ...common,
          role: form.role,
          password: needsLogin ? form.password : null,
          pin: needsLogin ? null : form.pin,
        });
        setCreatedId(created?.id ?? null);
        setNotice(
          form.role === "seller"
            ? t("structure.staff.created", { name: common.full_name })
            : // Tarjima kaliti hali qo'shilmagan bo'lsa — vaqtincha o'zbekcha matn
              t("structure.staff.created_login", {
                name: common.full_name,
                defaultValue: "{{name}} qo'shildi. Telefon raqami va parol bilan kira oladi.",
              }),
        );
      } else {
        await patch(`/users/${form.id}`, common);
      }
      setForm(null);
      await reload();
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "";
      if (code === "phone_taken") setErrors({ phone: errorText(error) });
      else if (code === "pin_taken") setErrors({ pin: errorText(error) });
      else setErrors({ form: errorText(error) });
    } finally {
      setSaving(false);
    }
  }

  /** Xodimning hozirgi paroli yoki PIN'ini serverdan so'raydi (server buni jurnalga yozadi). */
  async function reveal(row: StaffRow) {
    setRevealError(null);
    if (shown?.id === row.id) return setShown(null);
    setAction(null);
    setRevealing(row.id);
    try {
      const secret = await post<{ password: string | null; pin: string | null }>(`/users/${row.id}/reveal`);
      const kind = row.role === "seller" ? "pin" : "password";
      setShown({ id: row.id, kind, value: secret[kind] });
    } catch (error) {
      setRevealError({ id: row.id, text: errorText(error) });
    } finally {
      setRevealing(null);
    }
  }

  function openAction(next: PendingAction) {
    setShown(null); // parol/PIN o'zgarsa, ekrandagi eski qiymat chalg'itmasin
    setAction(next);
    setActionValue("");
    setActionError(null);
  }

  async function runAction(row: StaffRow) {
    if (!action) return;
    if (action.kind === "password" && actionValue.length < 6) {
      feedback("error");
      return setActionError(t("password.too_short"));
    }
    if (action.kind === "pin" && actionValue.length !== 4) {
      feedback("error");
      return setActionError(t("structure.staff.pin_invalid"));
    }
    setActionBusy(true);
    setActionError(null);
    try {
      if (action.kind === "password") await post(`/users/${row.id}/password`, { password: actionValue });
      else if (action.kind === "pin") await post(`/users/${row.id}/pin`, { pin: actionValue });
      else await post(`/users/${row.id}/deactivate`);
      setAction(null);
      await reload();
    } catch (error) {
      setActionError(errorText(error));
    } finally {
      setActionBusy(false);
    }
  }

  async function activate(row: StaffRow) {
    setActivating(row.id);
    try {
      await post(`/users/${row.id}/activate`);
      await reload();
    } catch (error) {
      // Masalan: PIN boshqa sotuvchida band — avval yangi PIN o'rnatiladi
      setAction({ kind: "pin", id: row.id });
      setActionValue("");
      setActionError(errorText(error));
    } finally {
      setActivating(null);
    }
  }

  const roleOptions: { value: Role; label: string }[] = [
    { value: "seller", label: t("roles.seller") },
    { value: "warehouse", label: t("roles.warehouse") },
    ...(me.is_primary_owner ? [{ value: "owner" as Role, label: t("roles.owner") }] : []),
  ];
  const rows = (staff.data ?? []).filter(
    (row) => (showInactive || row.is_active) && (!roleFilter || row.role === roleFilter),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-muted">{t("structure.staff.intro")}</p>
        {form === null && (
          <Button onClick={() => showForm(EMPTY)}>
            <Plus className="size-[18px]" aria-hidden="true" />
            {t("structure.staff.add")}
          </Button>
        )}
      </div>

      {form && (
        <div ref={formRef} className="mt-4 max-w-xl scroll-mt-4">
          <Card
            title={t(form.id === null ? "structure.staff.add" : "structure.staff.edit")}
            icon={form.id === null ? UserPlus : Pencil}
            tone="rose"
          >
            <form onSubmit={save} noValidate className="space-y-5">
              {errors.form && <Alert focus>{errors.form}</Alert>}
              {pendingEdit && (
                <ConfirmBar
                  danger={false}
                  text={t("structure.discard_draft", {
                    name: pendingEdit.full_name,
                    defaultValue: "To'ldirilayotgan forma yopiladi — {{name}} tahrirlansinmi?",
                  })}
                  confirmLabel={t("structure.edit")}
                  onConfirm={() => {
                    const row = pendingEdit;
                    setForm(null);
                    openEdit(row);
                  }}
                  onCancel={() => setPendingEdit(null)}
                />
              )}
              {form.id === null && (
                <div>
                  <p className={fieldLabel}>{t("structure.staff.role")}</p>
                  <Segmented<Role>
                    label={t("structure.staff.role")}
                    value={form.role}
                    onChange={(role) => setForm({ ...form, role, allLocations: true, locationIds: [] })}
                    options={roleOptions}
                  />
                </div>
              )}
              <TextField
                label={t("profile.name")}
                value={form.fullName}
                onChange={(v) => set("fullName", v)}
                error={errors.fullName}
                maxLength={100}
                autoFocus
              />
              {form.role !== "seller" && (
                <PhoneField
                  label={t("login.phone")}
                  value={form.phone}
                  onChange={(v) => set("phone", v)}
                  error={errors.phone}
                />
              )}
              {form.id === null && form.role !== "seller" && (
                <PasswordField
                  label={t("login.password")}
                  value={form.password}
                  onChange={(v) => set("password", v)}
                  error={errors.password}
                  hint={t("structure.staff.password_hint")}
                  autoComplete="new-password"
                />
              )}
              {form.id === null && form.role === "seller" && (
                <TextField
                  label={t("structure.staff.pin")}
                  value={form.pin}
                  onChange={(v) => set("pin", onlyDigits(v, 4))}
                  error={errors.pin}
                  hint={t("structure.staff.pin_hint")}
                  inputMode="numeric"
                  autoComplete="off"
                />
              )}
              {form.role !== "owner" && (
                <div>
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium">
                      {t(form.role === "seller" ? "structure.staff.all_stores" : "structure.staff.all_warehouses")}
                    </p>
                    <Toggle
                      checked={form.allLocations}
                      onChange={(v) => set("allLocations", v)}
                      label={t(form.role === "seller" ? "structure.staff.all_stores" : "structure.staff.all_warehouses")}
                    />
                  </div>
                  {!form.allLocations && (
                    <div className="mt-3 space-y-2">
                      {choices(form.role).length === 0 && (
                        <p className="text-sm text-muted">{t("structure.staff.no_locations")}</p>
                      )}
                      {choices(form.role).map((location) => (
                        <label key={location.id} className="flex min-h-9 cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            className="size-4 accent-[rgb(var(--indigo))]"
                            checked={form.locationIds.includes(location.id)}
                            onChange={(e) =>
                              set(
                                "locationIds",
                                e.target.checked
                                  ? [...form.locationIds, location.id]
                                  : form.locationIds.filter((id) => id !== location.id),
                              )
                            }
                          />
                          <span>{location.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {errors.locations && (
                    <p role="alert" className="mt-2 text-sm text-madder">
                      {errors.locations}
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={saving}>
                  {t("common.save")}
                </Button>
                <Button variant="secondary" onClick={() => (setForm(null), setPendingEdit(null))}>
                  {t("common.cancel")}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {notice && (
        <div className="mt-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <Segmented<Role | "">
          label={t("structure.staff.role")}
          value={roleFilter}
          onChange={setRoleFilter}
          options={[
            { value: "", label: t("common.all") },
            { value: "owner", label: t("structure.staff.owners") },
            { value: "warehouse", label: t("roles.warehouse") },
            { value: "seller", label: t("roles.seller") },
          ]}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[rgb(var(--indigo))]"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          {t("structure.staff.show_inactive")}
        </label>
      </div>

      <section className="mt-4 overflow-hidden rounded-card border border-line bg-panel shadow-card">
        {staff.isLoading && <Loading className="px-5 py-6" />}
        {staff.isError && (
          <div className="p-5">
            <Alert>{errorText(staff.error)}</Alert>
          </div>
        )}
        {staff.isSuccess && rows.length === 0 && (
          <Empty icon={Users} tone="rose">
            {t("structure.staff.empty")}
          </Empty>
        )}
        <ul className="divide-y divide-line">
          {rows.map((row) => {
            const open = action?.id === row.id ? action.kind : null;
            const where =
              row.role === "owner"
                ? null
                : row.all_locations
                  ? t(row.role === "seller" ? "structure.staff.all_stores" : "structure.staff.all_warehouses")
                  : row.location_ids.map(locationName).join(", ");
            // Yangi qo'shilgan qator yashil fonda ajralib turadi; faolsiz qator — kulrang
            const highlight =
              createdId === row.id ? "animate-line-in bg-leaf-soft/60" : row.is_active ? "" : "bg-page/60";
            return (
              <li key={row.id} className={`${rowClass} transition-colors duration-slow ${highlight}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <Avatar name={row.full_name} size="lg" />
                  <div className="min-w-0 flex-1 basis-56">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <p className={`font-medium ${row.is_active ? "" : "text-muted"}`}>{row.full_name}</p>
                      <Chip tone={ROLE_TONE[row.role]}>
                        {t(row.is_primary_owner ? "roles.owner_primary" : `roles.${row.role}`)}
                      </Chip>
                      {!row.is_active && <Chip>{t("structure.inactive")}</Chip>}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                      {row.phone && (
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <Phone className="size-3.5" aria-hidden="true" />
                          +998 {formatPhone(row.phone.slice(4))}
                        </span>
                      )}
                      {row.role === "seller" && (
                        <span className={`inline-flex items-center gap-1.5 ${row.has_pin ? "" : "text-saffron"}`}>
                          <KeyRound className="size-3.5" aria-hidden="true" />
                          {t(row.has_pin ? "structure.staff.pin_set" : "structure.staff.pin_missing")}
                        </span>
                      )}
                      {where && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                          {where}
                        </span>
                      )}
                    </p>
                  </div>

                  {manageable(row) && (
                    <div className="flex flex-wrap gap-2">
                      <RowAction icon={Pencil} onClick={() => openEdit(row)}>
                        {t("structure.edit")}
                      </RowAction>
                      <RowAction
                        icon={shown?.id === row.id ? EyeOff : Eye}
                        disabled={revealing === row.id}
                        aria-expanded={shown?.id === row.id}
                        onClick={() => void reveal(row)}
                      >
                        {shown?.id === row.id
                          ? t("structure.staff.hide")
                          : t(row.role === "seller" ? "structure.staff.show_pin" : "structure.staff.show_password")}
                      </RowAction>
                      {row.role === "seller" ? (
                        <RowAction
                          icon={KeyRound}
                          aria-expanded={open === "pin"}
                          onClick={() => openAction({ kind: "pin", id: row.id })}
                        >
                          {t("structure.staff.change_pin")}
                        </RowAction>
                      ) : (
                        <RowAction
                          icon={LockKeyhole}
                          aria-expanded={open === "password"}
                          onClick={() => openAction({ kind: "password", id: row.id })}
                        >
                          {t("structure.staff.reset_password")}
                        </RowAction>
                      )}
                      {row.is_active ? (
                        // RowAction ref bermaydi; tasdiq yopilganda fokus shu tugmaga qaytishi uchun oddiy tugma
                        <button
                          ref={triggerFor(row.id)}
                          type="button"
                          className={actionClass("danger")}
                          disabled={open === "deactivate"}
                          aria-expanded={open === "deactivate"}
                          onClick={(event) => {
                            feedback("warning", event);
                            openAction({ kind: "deactivate", id: row.id });
                          }}
                        >
                          <Power className="size-3.5 shrink-0" aria-hidden="true" />
                          {t("structure.deactivate")}
                        </button>
                      ) : (
                        <RowAction
                          icon={RotateCcw}
                          tone="success"
                          disabled={activating === row.id}
                          onClick={() => void activate(row)}
                        >
                          {t("structure.activate")}
                        </RowAction>
                      )}
                    </div>
                  )}
                </div>

                {revealError?.id === row.id && (
                  <div className="mt-3 max-w-md sm:ml-16">
                    <Alert>{revealError.text}</Alert>
                  </div>
                )}
                {shown?.id === row.id && (
                  <div className="mt-3 max-w-md space-y-2 rounded-control bg-page p-4 sm:ml-16">
                    {shown.value === null ? (
                      <p className="text-sm">{t("structure.staff.secret_missing")}</p>
                    ) : (
                      <>
                        <p className="text-sm text-muted">
                          {t(shown.kind === "pin" ? "structure.staff.secret_pin" : "structure.staff.secret_password")}
                        </p>
                        <SecretBox value={shown.value} />
                        <p className="text-[13px] text-muted">{t("structure.staff.secret_logged")}</p>
                      </>
                    )}
                  </div>
                )}

                {open === "deactivate" && (
                  <div className="mt-3 max-w-md space-y-3 sm:ml-16">
                    {actionError && <Alert>{actionError}</Alert>}
                    <ConfirmBar
                      text={t("structure.staff.deactivate_confirm", { name: row.full_name })}
                      confirmLabel={t("structure.deactivate_yes")}
                      busy={actionBusy}
                      onConfirm={() => void runAction(row)}
                      onCancel={() => setAction(null)}
                      returnFocusTo={triggerFor(row.id)}
                    />
                  </div>
                )}
                {open && open !== "deactivate" && (
                  <div className="mt-3 max-w-md space-y-3 rounded-control bg-page p-4 sm:ml-16">
                    {actionError && <Alert>{actionError}</Alert>}
                    {open === "password" && (
                      <PasswordField
                        label={t("password.new")}
                        value={actionValue}
                        onChange={setActionValue}
                        hint={t("structure.staff.password_hint")}
                        autoComplete="new-password"
                      />
                    )}
                    {open === "pin" && (
                      <TextField
                        label={t("structure.staff.new_pin")}
                        value={actionValue}
                        onChange={(v) => setActionValue(onlyDigits(v, 4))}
                        hint={t("structure.staff.pin_hint")}
                        inputMode="numeric"
                        autoComplete="off"
                      />
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" loading={actionBusy} onClick={() => void runAction(row)}>
                        {t("common.save")}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setAction(null)}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
