import { createRef, useRef, useState, type RefObject } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CalendarDays, Crown, Eye, EyeOff, History, KeyRound, Phone, ShieldAlert, Store, UserRound, Users } from "lucide-react";
import { api, patch, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { formatDate, formatDateTime } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Alert, ConfirmBar, Loading } from "@/shared/ui/feedback";
import { PhoneField, TextAreaField } from "@/shared/ui/fields";
import { PageTitle } from "@/shared/ui/PageTitle";
import { RenameField } from "@/shared/ui/RenameField";
import { Stat, statGrid } from "@/shared/ui/Stat";
import { formatPhoneFull, SecretBox, StatusChip, type BusinessRow } from "./parts";
import { Avatar } from "@/shared/ui/Avatar";
import { actionClass, BackLink, Chip, RowAction } from "@/shared/ui/list";

type Owner = {
  id: number;
  full_name: string;
  phone: string | null;
  is_primary_owner: boolean;
  is_active: boolean;
};
type StatusEvent = { id: number; action: string; reason: string; created_at: string };
type Detail = BusinessRow & { owners: Owner[]; events: StatusEvent[] };

/** Egaga nisbatan ochilgan amal paneli */
type Panel = { kind: "reset" | "phone" | "primary"; ownerId: number } | null;

const MIN_REASON = 3;

/** Biznes sahifasi: holat, egalar, bloklash, tarix. Biznesning ichki ma'lumotlari bu yerda ko'rinmaydi. */
export function BusinessPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const url = `/platform/businesses/${id}`;
  const business = useQuery({ queryKey: ["platform", "business", id], queryFn: () => api<Detail>(url) });

  const [panel, setPanel] = useState<Panel>(null);
  const [reason, setReason] = useState("");
  const [phone, setPhone] = useState("");
  const [panelError, setPanelError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState<{ ownerId: number; value: string } | null>(null);
  // Ko'rsatilayotgan hozirgi parol. value === null — hali saqlanmagan
  const [seen, setSeen] = useState<{ ownerId: number; value: string | null } | null>(null);
  const [seeing, setSeeing] = useState<number | null>(null);
  const [seeError, setSeeError] = useState<{ ownerId: number; text: string } | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  // "Parolni tiklash" tugmalari: tasdiq yopilganda fokus o'sha tugmaga qaytadi
  const triggers = useRef(new Map<number, RefObject<HTMLButtonElement>>());
  const triggerFor = (ownerId: number) => {
    let ref = triggers.current.get(ownerId);
    if (!ref) {
      ref = createRef<HTMLButtonElement>();
      triggers.current.set(ownerId, ref);
    }
    return ref;
  };

  const reload = () => queryClient.invalidateQueries({ queryKey: ["platform"] });

  /** Eganing hozirgi parolini so'raydi (server buni biznes jurnaliga yozadi). */
  async function reveal(owner: Owner) {
    setSeeError(null);
    if (seen?.ownerId === owner.id) return setSeen(null);
    setSeeing(owner.id);
    try {
      const result = await post<{ password: string | null }>(`${url}/owners/${owner.id}/reveal-password`);
      setSeen({ ownerId: owner.id, value: result.password });
    } catch (error) {
      setSeeError({ ownerId: owner.id, text: errorText(error) });
    } finally {
      setSeeing(null);
    }
  }

  function open(next: Panel) {
    setSeen(null); // parol o'zgarsa, ekrandagi eski qiymat chalg'itmasin
    setPanel(next);
    setReason("");
    setPhone("");
    setPanelError(null);
  }

  /** Amalni bajaradi; muvaffaqiyatli bo'lsa panelni yopib, ma'lumotni yangilaydi. */
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setPanelError(null);
    try {
      await action();
      setPanel(null);
      await reload();
    } catch (error) {
      setPanelError(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  const resetPassword = (owner: Owner) =>
    run(async () => {
      const result = await post<{ temp_password: string }>(
        `${url}/owners/${owner.id}/reset-password`,
      );
      setNewPassword({ ownerId: owner.id, value: result.temp_password });
    });

  const savePhone = (owner: Owner) => {
    if (phone.length !== 9) {
      feedback("error");
      return setPanelError(t("login.phone_incomplete"));
    }
    return run(async () => {
      await patch(`${url}/owners/${owner.id}`, { phone: `+998${phone}` });
    });
  };

  const makePrimary = (owner: Owner) => {
    if (reason.trim().length < MIN_REASON) {
      feedback("error");
      return setPanelError(t("platform.card.reason_required"));
    }
    return run(async () => {
      await post(`${url}/primary-owner`, { user_id: owner.id, reason: reason.trim() });
    });
  };

  async function changeStatus(action: "block" | "unblock") {
    if (statusReason.trim().length < MIN_REASON) {
      feedback("error");
      setStatusError(t("platform.card.reason_required"));
      return;
    }
    setStatusBusy(true);
    setStatusError(null);
    try {
      await post(`${url}/${action}`, { reason: statusReason.trim() });
      setStatusReason("");
      await reload();
    } catch (error) {
      setStatusError(errorText(error));
    } finally {
      setStatusBusy(false);
    }
  }

  const back = <BackLink to="/">{t("platform.card.back")}</BackLink>;

  // Yuklanish, xato va ma'lumot — bir xil tepa oraliq: sahifa sakramaydi
  if (business.isError) {
    return (
      <div>
        {back}
        <div className="mt-5">
          <Alert>{errorText(business.error)}</Alert>
        </div>
      </div>
    );
  }
  if (!business.data) {
    return (
      <div>
        {back}
        <Loading className="mt-5" />
      </div>
    );
  }

  const data = business.data;
  const blocked = data.status === "blocked";

  return (
    <div>
      {back}
      <div className="mt-3">
        <PageTitle title={data.name} leading={<Avatar name={data.name} size="lg" />}>
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {data.name}
            <StatusChip status={data.status} />
          </span>
        </PageTitle>
      </div>

      {/* Biznes nomi — platforma egasi o'zgartiradi (biznes jurnaliga yoziladi) */}
      <Card className="mt-5">
        <RenameField
          label={t("platform.card.business_name")}
          value={data.name}
          onSave={async (name) => {
            await patch(url, { name });
            await reload();
          }}
        />
      </Card>

      <div className={`${statGrid} mt-5 lg:grid-cols-4`}>
        <Stat icon={Store} accent="leaf" label={t("platform.card.stats_stores")} value={data.stores_count} />
        <Stat icon={Users} accent="rose" label={t("platform.card.stats_staff")} value={data.staff_count} />
        <Stat
          icon={CalendarDays}
          accent="sky"
          label={t("platform.card.stats_created")}
          value={formatDate(data.created_at)}
        />
        <Stat
          icon={Activity}
          accent="coral"
          label={t("platform.card.stats_activity")}
          value={data.last_activity_at ? formatDateTime(data.last_activity_at) : t("platform.no_activity")}
        />
      </div>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <Card title={t("platform.card.owners")} icon={UserRound} tone="indigo">
          <ul className="divide-y divide-line">
            {data.owners.map((owner) => {
              const active = panel?.ownerId === owner.id ? panel.kind : null;
              return (
                <li key={owner.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <Avatar name={owner.full_name} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <p className="font-medium">{owner.full_name}</p>
                        <Chip tone={owner.is_primary_owner ? "indigo" : "neutral"}>
                          {t(owner.is_primary_owner ? "platform.card.primary" : "platform.card.co_owner")}
                        </Chip>
                        {!owner.is_active && <Chip>{t("platform.card.inactive")}</Chip>}
                      </div>
                      <p className="text-sm text-muted">{formatPhoneFull(owner.phone)}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <RowAction
                      icon={seen?.ownerId === owner.id ? EyeOff : Eye}
                      disabled={seeing === owner.id}
                      aria-expanded={seen?.ownerId === owner.id}
                      onClick={() => void reveal(owner)}
                    >
                      {t(seen?.ownerId === owner.id ? "platform.card.hide_password" : "platform.card.show_password")}
                    </RowAction>
                    {/* RowAction ref bermaydi; tasdiq yopilganda fokus shu tugmaga qaytishi uchun oddiy tugma */}
                    <button
                      ref={triggerFor(owner.id)}
                      type="button"
                      className={actionClass()}
                      disabled={active === "reset"}
                      aria-expanded={active === "reset"}
                      onClick={(event) => {
                        feedback("tap", event);
                        open({ kind: "reset", ownerId: owner.id });
                      }}
                    >
                      <KeyRound className="size-3.5 shrink-0" aria-hidden="true" />
                      {t("platform.card.reset")}
                    </button>
                    <RowAction
                      icon={Phone}
                      aria-expanded={active === "phone"}
                      onClick={() => open({ kind: "phone", ownerId: owner.id })}
                    >
                      {t("platform.card.change_phone")}
                    </RowAction>
                    {!owner.is_primary_owner && owner.is_active && (
                      <RowAction
                        icon={Crown}
                        aria-expanded={active === "primary"}
                        onClick={() => open({ kind: "primary", ownerId: owner.id })}
                      >
                        {t("platform.card.make_primary")}
                      </RowAction>
                    )}
                  </div>

                  {seeError?.ownerId === owner.id && (
                    <div className="mt-3">
                      <Alert>{seeError.text}</Alert>
                    </div>
                  )}
                  {seen?.ownerId === owner.id && (
                    <div className="mt-3 space-y-2 rounded-control bg-page p-4">
                      {seen.value === null ? (
                        <p className="text-sm">{t("platform.card.password_missing")}</p>
                      ) : (
                        <>
                          <p className="text-sm text-muted">{t("platform.card.password_now")}</p>
                          <SecretBox value={seen.value} />
                          <p className="text-[13px] text-muted">{t("platform.card.password_logged")}</p>
                        </>
                      )}
                    </div>
                  )}

                  {newPassword?.ownerId === owner.id && (
                    <div className="mt-3">
                      <p className="mb-2 text-sm text-muted">{t("platform.card.reset_done")}</p>
                      <SecretBox value={newPassword.value} />
                    </div>
                  )}

                  {active === "reset" && (
                    <div className="mt-3 space-y-3">
                      {panelError && <Alert>{panelError}</Alert>}
                      <ConfirmBar
                        text={t("platform.card.reset_confirm", { name: owner.full_name })}
                        confirmLabel={t("platform.card.reset_yes")}
                        busy={busy}
                        onConfirm={() => void resetPassword(owner)}
                        onCancel={() => setPanel(null)}
                        returnFocusTo={triggerFor(owner.id)}
                      />
                    </div>
                  )}
                  {active && active !== "reset" && (
                    <div className="mt-3 space-y-3 rounded-control bg-page p-4">
                      {panelError && <Alert>{panelError}</Alert>}
                      {active === "phone" && (
                        <PhoneField label={t("platform.card.new_phone")} value={phone} onChange={setPhone} />
                      )}
                      {active === "primary" && (
                        <>
                          <p className="text-sm">{t("platform.card.make_primary_text", { name: owner.full_name })}</p>
                          <TextAreaField label={t("platform.card.reason")} value={reason} onChange={setReason} rows={2} maxLength={500} />
                        </>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          loading={busy}
                          onClick={() => void (active === "phone" ? savePhone(owner) : makePrimary(owner))}
                        >
                          {/* Tasdiq tugmasi amalning o'zini aytadi: "Asosiy ega qilish" */}
                          {t(active === "phone" ? "common.save" : "platform.card.make_primary")}
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setPanel(null)}>
                          {t("common.cancel")}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card title={t("platform.card.status_title")} icon={ShieldAlert} tone={blocked ? "madder" : "saffron"}>
            <p className="text-muted">
              {t(blocked ? "platform.card.unblock_text" : "platform.card.block_text")}
            </p>
            <div className="mt-4 space-y-4">
              <TextAreaField
                label={t("platform.card.reason")}
                value={statusReason}
                onChange={setStatusReason}
                error={statusError}
                rows={2}
                maxLength={500}
              />
              <Button
                variant={blocked ? "primary" : "danger"}
                loading={statusBusy}
                onClick={() => void changeStatus(blocked ? "unblock" : "block")}
              >
                {t(blocked ? "platform.card.unblock" : "platform.card.block")}
              </Button>
            </div>
          </Card>

          <Card title={t("platform.card.history")} icon={History} tone="neutral">
            {data.events.length === 0 ? (
              <p className="text-muted">{t("platform.card.history_empty")}</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.events.map((event) => (
                  <li key={event.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="font-medium">{t(`platform.card.actions.${event.action}`)}</p>
                    <p className="text-sm">{event.reason}</p>
                    <p className="mt-0.5 text-[13px] text-muted">{formatDateTime(event.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
