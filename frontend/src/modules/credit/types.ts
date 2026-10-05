/** Nasiya API'sining shakllari (/api/customers). Pul — butun so'm. */
import { formatPhone } from "@/shared/ui/fields";

/** Mijoz tanlovda: nasiya berishdan oldin hozirgi qarzi ko'rinadi */
export type CustomerBrief = { id: number; name: string; phone: string; debt: number };

export type MoneyMethod = "cash" | "card";

export type CustomerRow = {
  id: number;
  name: string;
  phone: string;
  note: string | null;
  is_active: boolean;
  /** Umumiy qolgan qarz */
  debt: number;
  /** Shundan muddati o'tgani */
  overdue: number;
  /** Eng eski yopilmagan qarz necha kunlik */
  oldest_days: number | null;
  last_payment_at: string | null;
  /** Oxirgi to'lov summasi, so'm */
  last_payment_amount?: number | null;
};

/** `debt_total`, `overdue_total` — filtrga mos mijozlar bo'yicha */
/** Muddat taqsimoti: qarzning qolgani, muddatidan necha kun o'tganiga qarab (so'm) */
export type Aging = { total: number; not_due: number; d1_30: number; d31_60: number; d60_plus: number };

export type CustomerPage = {
  items: CustomerRow[];
  total: number;
  debt_total: number;
  overdue_total: number;
  aging?: Aging;
};

/** Bitta nasiya sotuvning qarzi */
export type DebtRow = {
  id: number;
  sale_id: number;
  sale_number: string;
  created_at: string;
  store: string;
  seller: string;
  sale_total: number;
  initial_payment: number;
  amount: number;
  paid: number;
  written_off: number;
  returned: number;
  remaining: number;
  due_date: string;
  overdue: boolean;
  days: number;
};

export type Payment = {
  id: number;
  created_at: string;
  amount: number;
  method: MoneyMethod;
  user: string;
  store: string;
  /** Qaysi qarzlarga yozildi */
  allocations: { sale_id: number; sale_number: string; amount: number }[];
};

export type Writeoff = {
  id: number;
  created_at: string;
  amount: number;
  reason: string;
  user: string;
  sale_id: number;
  sale_number: string;
};

/** `payments` va `writeoffs` — birinchi sahifa (eng yangilari); `*_total` — jami soni, qolgani alohida so'raladi */
export type CustomerCard = CustomerRow & {
  debts: DebtRow[];
  payments: Payment[];
  payments_total?: number;
  writeoffs: Writeoff[];
  writeoffs_total?: number;
};

export type PaymentCreated = { id: number; amount: number; debt: number };

/** So'rov kalitlari: to'lov, hisobdan chiqarish va nasiya sotuv mijoz ro'yxati va kartochkasini yangilaydi */
export const creditKeys = {
  all: ["credit"] as const,
  search: (text: string) => ["credit", "customers", "search", text] as const,
  list: (filters: string) => ["credit", "customers", "list", filters] as const,
  customer: (id: number) => ["credit", "customer", id] as const,
};

/** "+998901234567" → "+998 90 123 45 67" */
export const phoneText = (phone: string) =>
  /^\+998\d{9}$/.test(phone) ? `+998 ${formatPhone(phone.slice(4))}` : phone;
