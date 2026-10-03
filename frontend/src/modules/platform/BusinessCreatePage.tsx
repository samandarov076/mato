import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, PartyPopper } from "lucide-react";
import { ApiError, post } from "@/shared/api/client";
import { useErrorText } from "@/shared/api/errors";
import { feedback } from "@/shared/feedback";
import { Button, ButtonLink } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Confetti } from "@/shared/ui/Confetti";
import { Alert } from "@/shared/ui/feedback";
import { PhoneField, TextField } from "@/shared/ui/fields";
import { BackLink } from "@/shared/ui/list";
import { PageTitle, useDocumentTitle } from "@/shared/ui/PageTitle";
import { formatPhoneFull, SecretBox } from "./parts";

type Created = { id: number; name: string; owner_phone: string; temp_password: string };
type Errors = { name?: string; owner?: string; phone?: string; form?: string };

/** Yangi biznes va uning asosiy egasini yaratish. Natijada vaqtinchalik parol bir marta ko'rsatiladi. */
export function BusinessCreatePage() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  // Natija ekranida sahifa sarlavhasi (PageTitle) yo'q — brauzer sarlavhasi shu yerda qo'yiladi
  useDocumentTitle(created ? t("platform.create.done_title") : undefined);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Errors = {};
    if (name.trim().length < 2) found.name = t("platform.create.too_short");
    if (owner.trim().length < 2) found.owner = t("platform.create.too_short");
    if (phone.length !== 9) found.phone = t("login.phone_incomplete");
    setErrors(found);
    if (Object.keys(found).length > 0) {
      feedback("error");
      return;
    }

    setSaving(true);
    try {
      const result = await post<Created>("/platform/businesses", {
        name: name.trim(),
        owner_full_name: owner.trim(),
        owner_phone: `+998${phone}`,
      });
      void queryClient.invalidateQueries({ queryKey: ["platform"] });
      setCreated(result);
    } catch (error) {
      if (error instanceof ApiError && error.code === "phone_taken") {
        setErrors({ phone: errorText(error) });
      } else {
        setErrors({ form: errorText(error) });
      }
    } finally {
      setSaving(false);
    }
  }

  const back = <BackLink to="/">{t("platform.businesses")}</BackLink>;

  if (created) {
    return (
      <div className="max-w-xl">
        <Confetti />
        {back}
        <Card className="mt-5">
          <div className="text-center">
            <span className="mx-auto grid size-16 animate-pop place-items-center rounded-full bg-leaf-soft text-leaf">
              <PartyPopper className="size-8" aria-hidden="true" />
            </span>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight">{t("platform.create.done_title")}</h1>
            <p className="mt-1 text-lg font-medium text-indigo">{created.name}</p>
            <p className="mx-auto mt-2 max-w-sm text-muted">{t("platform.create.done_text")}</p>
          </div>
          <dl className="mt-6 space-y-4 rounded-control bg-page/70 p-4">
            <div>
              <dt className="mb-1.5 text-sm text-muted">{t("platform.create.phone")}</dt>
              <dd className="text-lg font-medium">{formatPhoneFull(created.owner_phone)}</dd>
            </div>
            <div>
              <dt className="mb-1.5 text-sm text-muted">{t("platform.create.temp_password")}</dt>
              <dd>
                <SecretBox value={created.temp_password} />
              </dd>
            </div>
          </dl>
        </Card>
        {/* Bitta asosiy yo'l: yaratilgan biznesni ochish. Yana qo'shish — ro'yxatdagi tugma orqali */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ButtonLink to={`/businesses/${created.id}`}>{t("platform.create.open")}</ButtonLink>
          <ButtonLink to="/" variant="ghost">
            {t("platform.create.to_list")}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      {back}
      <div className="mt-3">
        <PageTitle icon={Building2} tone="indigo">
          {t("platform.create.title")}
        </PageTitle>
      </div>
      <Card className="mt-5">
        <form onSubmit={submit} noValidate className="space-y-5">
          {errors.form && <Alert focus>{errors.form}</Alert>}
          <TextField
            label={t("platform.create.name")}
            value={name}
            onChange={setName}
            error={errors.name}
            maxLength={100}
            autoFocus
          />
          <TextField
            label={t("platform.create.owner_name")}
            value={owner}
            onChange={setOwner}
            error={errors.owner}
            maxLength={100}
          />
          <PhoneField
            label={t("platform.create.owner_phone")}
            value={phone}
            onChange={setPhone}
            error={errors.phone}
            hint={t("platform.create.hint")}
          />
          <Button type="submit" loading={saving}>
            {t("platform.create.submit")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
