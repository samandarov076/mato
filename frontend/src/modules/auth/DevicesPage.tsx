import { createRef, useRef, useState, type FormEvent, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, TabletSmartphone, Unplug } from "lucide-react";
import { api, post, type Store } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { formatDate, formatDateTime } from "@/shared/format";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Alert, ConfirmBar, Loading } from "@/shared/ui/feedback";
import { SelectField, TextField } from "@/shared/ui/fields";
import { useAuth } from "./AuthProvider";
import { actionClass, Empty, IconChip } from "@/shared/ui/list";

type Device = {
  id: number;
  name: string;
  store: Store;
  created_at: string;
  last_seen_at: string | null;
};

type StoreRow = { id: number; name: string };

type Errors = { store?: string; name?: string; form?: string };

/** Do'kon qurilmalari: shu qurilmani do'konga bog'lash va bog'langanlarni uzish. Faqat biznes egasi. */
export function DevicesPage() {
  const { t } = useTranslation();
  const { device: thisDevice, deviceBound, reloadDevice } = useAuth();
  const errorText = useErrorText();
  const queryClient = useQueryClient();

  const devices = useQuery({ queryKey: ["devices"], queryFn: () => api<Device[]>("/devices") });
  const stores = useQuery({
    queryKey: ["locations", "store"],
    queryFn: () => api<StoreRow[]>("/locations?type=store"),
  });

  const [storeId, setStoreId] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [binding, setBinding] = useState(false);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  // "Uzish" tugmalari: tasdiq yopilganda fokus o'sha tugmaga qaytadi
  const triggers = useRef(new Map<number, RefObject<HTMLButtonElement>>());
  const triggerFor = (id: number) => {
    let ref = triggers.current.get(id);
    if (!ref) {
      ref = createRef<HTMLButtonElement>();
      triggers.current.set(id, ref);
    }
    return ref;
  };

  const revoke = useMutation({
    mutationFn: (id: number) => post(`/devices/${id}/revoke`),
    onSettled: () => {
      setConfirmId(null);
      void reloadDevice(); // uzilgan qurilma shu brauzerning o'zi bo'lishi mumkin
      return queryClient.invalidateQueries({ queryKey: ["devices"] });
    },
  });

  async function bind(event: FormEvent) {
    event.preventDefault();
    const found: Errors = {};
    if (!storeId) found.store = t("devices.store_required");
    if (name.trim().length < 2) found.name = t("devices.name_short");
    setErrors(found);
    if (found.store || found.name) {
      feedback("error");
      return;
    }

    setBinding(true);
    try {
      await post("/devices", { store_id: Number(storeId), name: name.trim() });
      await deviceBound(); // egasi bu qurilmadan chiqadi — PIN ekrani ochiladi
    } catch (error) {
      setErrors({ form: errorText(error) });
      setBinding(false);
    }
  }

  const noStores = stores.data?.length === 0;

  return (
    <div>
      {/* Sarlavha "Tuzilma" bo'limida — bu yerda faqat izoh */}
      <p className="max-w-2xl text-muted">{t("devices.intro")}</p>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card title={t("devices.bind_title")} icon={Link2} tone="indigo">
          {noStores ? (
            <Alert tone="info">{t("devices.no_stores")}</Alert>
          ) : (
            <form onSubmit={bind} noValidate className="space-y-5">
              {errors.form && <Alert focus>{errors.form}</Alert>}
              {thisDevice?.bound && (
                <Alert tone="info">
                  {t("devices.already_bound", { store: thisDevice.store?.name })}
                </Alert>
              )}
              <SelectField
                label={t("devices.store")}
                value={storeId}
                onChange={setStoreId}
                error={errors.store}
                disabled={stores.isLoading}
              >
                <option value="">{t("devices.store_placeholder")}</option>
                {stores.data?.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </SelectField>
              <TextField
                label={t("devices.name")}
                value={name}
                onChange={setName}
                error={errors.name}
                placeholder={t("devices.name_placeholder")}
                maxLength={100}
              />
              <p className="rounded-control bg-saffron-soft px-3.5 py-2.5 text-sm text-saffron">
                {t("devices.bind_warning")}
              </p>
              <Button type="submit" loading={binding}>
                {t("devices.bind")}
              </Button>
            </form>
          )}
        </Card>

        <Card title={t("devices.list_title")} icon={TabletSmartphone} tone="rose">
          {devices.isLoading && <Loading />}
          {devices.isError && <Alert>{errorText(devices.error)}</Alert>}
          {revoke.isError && (
            <div className="mb-3">
              <Alert focus>{errorText(revoke.error)}</Alert>
            </div>
          )}
          {devices.data?.length === 0 && (
            <Empty icon={TabletSmartphone} tone="rose">
              {t("devices.empty")}
            </Empty>
          )}

          <ul className="divide-y divide-line">
            {devices.data?.map((item) => {
              const confirming = confirmId === item.id;
              return (
                <li key={item.id} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-start gap-3">
                    <IconChip icon={TabletSmartphone} tone="rose" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.name}</p>
                      <p className="truncate text-sm text-muted">{item.store.name}</p>
                      <p className="mt-1 text-[13px] text-muted">
                        {t("devices.bound_at")}: {formatDate(item.created_at)} ·{" "}
                        {t("devices.last_seen")}:{" "}
                        {item.last_seen_at ? formatDateTime(item.last_seen_at) : t("devices.never")}
                      </p>
                    </div>
                    {/* Tugma tasdiq ochiq paytda ham joyida qoladi (band) — fokus yo'qolmaydi */}
                    <button
                      ref={triggerFor(item.id)}
                      type="button"
                      className={actionClass("danger")}
                      disabled={confirming}
                      aria-expanded={confirming}
                      onClick={(event) => {
                        feedback("warning", event);
                        revoke.reset();
                        setConfirmId(item.id);
                      }}
                    >
                      <Unplug className="size-3.5 shrink-0" aria-hidden="true" />
                      {t("devices.revoke")}
                    </button>
                  </div>
                  {confirming && (
                    <div className="mt-3">
                      <ConfirmBar
                        text={t("devices.revoke_confirm")}
                        confirmLabel={t("devices.revoke_yes")}
                        busy={revoke.isPending}
                        onConfirm={() => revoke.mutate(item.id)}
                        onCancel={() => setConfirmId(null)}
                        returnFocusTo={triggerFor(item.id)}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
