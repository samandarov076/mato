import {
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { focusRing } from "./tones";

/** Kiritish maydonlari. Matn 16px — telefonda brauzer maydonga "zoom" qilmaydi. */
/** Maydon ustidagi nom — barcha formalarda bir xil */
export const fieldLabel = "mb-1.5 block text-sm font-medium";

const box =
  "flex h-11 w-full items-center rounded-control border bg-panel transition-colors focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-[rgb(var(--panel))]";
const boxOk = "border-edge focus-within:border-indigo focus-within:ring-indigo";
const boxError = "border-madder focus-within:ring-madder";
const input =
  "h-full w-full min-w-0 rounded-control bg-transparent px-3.5 text-[16px] text-ink placeholder:text-muted focus:outline-none disabled:text-muted";

type FieldProps = {
  label: string;
  error?: string | null;
  hint?: string;
};

function Field({
  id,
  label,
  error,
  hint,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-note`} role="alert" className="mt-1.5 text-sm text-madder">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-note`} className="mt-1.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> &
  FieldProps & { value: string; onChange: (value: string) => void };

export function TextField({ label, error, hint, value, onChange, ...rest }: InputProps) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <div className={`${box} ${error ? boxError : boxOk}`}>
        <input
          id={id}
          className={input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-note` : undefined}
          {...rest}
        />
      </div>
    </Field>
  );
}

export function PasswordField({ label, error, hint, value, onChange, ...rest }: InputProps) {
  const id = useId();
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <div className={`${box} ${error ? boxError : boxOk}`}>
        <input
          id={id}
          type={visible ? "text" : "password"}
          className={input}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-note` : undefined}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={t(visible ? "password.hide" : "password.show")}
          aria-pressed={visible}
          className={`mr-1 grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-indigo-soft hover:text-ink [@media(pointer:coarse)]:size-10 ${focusRing}`}
        >
          {visible ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
        </button>
      </div>
    </Field>
  );
}

/** Ko'p qatorli matn (masalan, bloklash sababi) */
export function TextAreaField({
  label,
  error,
  hint,
  value,
  onChange,
  rows = 3,
  maxLength,
}: FieldProps & {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <textarea
        id={id}
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        className={`block w-full rounded-control border bg-panel px-3.5 py-2.5 text-[16px] text-ink transition-colors placeholder:text-muted ${focusRing} ${
          error ? "border-madder focus-visible:ring-madder" : "border-edge focus:border-indigo"
        }`}
      />
    </Field>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> &
  FieldProps & { value: string; onChange: (value: string) => void; children: ReactNode };

export function SelectField({ label, error, hint, value, onChange, children, ...rest }: SelectProps) {
  const id = useId();
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <div className={`${box} relative ${error ? boxError : boxOk}`}>
        <select
          id={id}
          className={`${input} cursor-pointer appearance-none pr-10`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-note` : undefined}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 size-4 text-muted"
          aria-hidden="true"
        />
      </div>
    </Field>
  );
}

/** "901234567" → "90 123 45 67" */
export function formatPhone(digits: string): string {
  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)]
    .filter(Boolean)
    .join(" ");
}

/** O'zbekiston raqami: +998 doim ko'rinib turadi, foydalanuvchi faqat 9 ta raqamni yozadi. */
export function PhoneField({
  label,
  error,
  hint,
  value,
  onChange,
  ...rest
}: Omit<InputProps, "type" | "inputMode" | "placeholder">) {
  const id = useId();
  const handle = (raw: string) => {
    let digits = raw.replace(/\D/g, "");
    // To'liq raqam qo'yilsa (+998 90 ...) — mamlakat kodini olib tashlaymiz
    if (digits.length > 9 && digits.startsWith("998")) digits = digits.slice(3);
    onChange(digits.slice(0, 9));
  };
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      <div className={`${box} ${error ? boxError : boxOk}`}>
        <span className="select-none pl-3.5 text-[16px] text-muted" aria-hidden="true">
          +998
        </span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          placeholder="90 123 45 67"
          className={`${input} pl-2`}
          value={formatPhone(value)}
          onChange={(e) => handle(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-note` : undefined}
          {...rest}
        />
      </div>
    </Field>
  );
}
