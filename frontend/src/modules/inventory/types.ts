/** Ombor API'sining shakllari (/api/stock, /api/batches, /api/transfers). Metr va kg — aniq son (matn). */
import { fromUnits, toUnits } from "@/shared/decimal";

export type Ref = { id: number; name: string };
export type Place = Ref & { type: "store" | "warehouse" };

/** Tovar — narxsiz: bu sahifalarni sotuvchi ham ko'radi */
export type SkuBrief = {
  id: number;
  code: string;
  fabric_name: string;
  color_name: string;
  /** Gulsiz bo'lsa — null */
  pattern_name: string | null;
  hex: string | null;
  image_url: string | null;
};

/** "Xon atlas · Qizil · Lola" */
export const skuNames = (sku: SkuBrief) =>
  [sku.fabric_name, sku.color_name, sku.pattern_name].filter(Boolean).join(" · ");

// ---------- Qoldiq ----------

export type StockCell = { location_id: number; qty_m: string; rolls: number };
export type StockBatch = {
  id: number;
  number: string;
  receipt_date: string;
  stocks: StockCell[];
  in_transit_m: string;
};
export type PlaceTotal = { location_id: number; qty_m: string; low: boolean };
export type StockSku = {
  sku: SkuBrief;
  total_m: string;
  in_transit_m: string;
  threshold: string | null;
  totals: PlaceTotal[];
  batches: StockBatch[];
};
export type StockPage = { items: StockSku[]; total: number; locations: Place[] };

// ---------- Partiya kartochkasi ----------

export type Closure = {
  /** + kam chiqdi, − ortiq chiqdi */
  diff_m: string;
  /** Faqat biznes egasiga */
  diff_amount: number | null;
  note: string | null;
  closed_by: string;
  closed_at: string;
};

export type BatchPlace = {
  location: Place;
  received_m: string;
  qty_m: string;
  rolls: number;
  status: "open" | "closed";
  can_close: boolean;
  can_reopen: boolean;
  closure: Closure | null;
};

export type Movement = {
  id: number;
  created_at: string;
  type: string;
  location: Ref;
  qty_m: string;
  user: string | null;
  ref_type: string | null;
  ref_id: number | null;
  ref_number: string | null;
  note: string | null;
};

export type BatchCard = {
  id: number;
  number: string;
  sku: SkuBrief;
  receipt: { id: number; number: string; receipt_date: string };
  rolls_count: number;
  meters_labeled: string;
  kg: string | null;
  m_per_kg: string | null;
  /** Faqat biznes egasiga */
  cost_per_m: number | null;
  places: BatchPlace[];
  in_transit: { transfer_id: number; number: string; source: Ref; target: Ref; sent_m: string }[];
  /** Birinchi sahifa (eng yangilari); `movements_total` — jami, qolgani `/batches/{id}/movements` dan */
  movements: Movement[];
  movements_total?: number;
};

// ---------- Ko'chirish ----------

export type TransferStatus = "in_transit" | "received" | "cancelled";

export type TransferRow = {
  id: number;
  number: string;
  status: TransferStatus;
  source: Place;
  target: Place;
  lines_count: number;
  sent_m: string;
  received_m: string | null;
  has_diff: boolean;
  sent_by: Ref;
  sent_at: string;
  received_by: Ref | null;
  received_at: string | null;
};

export type TransferPage = { items: TransferRow[]; total: number };

export type TransferLine = {
  id: number;
  batch_id: number;
  batch_number: string;
  sku: SkuBrief;
  sent_rolls: number;
  sent_m: string;
  received_rolls: number | null;
  received_m: string | null;
  /** Partiyaning o'rtacha rulon uzunligi */
  roll_m: string;
};

export type TransferCard = TransferRow & {
  note: string | null;
  receive_note: string | null;
  cancelled_by: Ref | null;
  cancelled_at: string | null;
  lines: TransferLine[];
  can_receive: boolean;
  can_cancel: boolean;
};

export type Sendable = {
  batch_id: number;
  number: string;
  sku: SkuBrief;
  qty_m: string;
  rolls: number;
  roll_m: string;
};

export type TransferOptions = { sources: Place[]; targets: Place[] };

// ---------- Metr farqi ----------

export type ClosureDiff = {
  id: number;
  batch_id: number;
  batch_number: string;
  sku: SkuBrief;
  location: Ref;
  received_m: string;
  out_m: string;
  diff_m: string;
  diff_percent: string | null;
  diff_amount: number;
  closed_by: Ref;
  closed_at: string;
  note: string | null;
};

export type TransferDiff = {
  transfer_id: number;
  number: string;
  batch_id: number;
  batch_number: string;
  sku: SkuBrief;
  source: Ref;
  target: Ref;
  sent_m: string;
  received_m: string;
  diff_m: string;
  diff_amount: number;
  received_by: Ref;
  received_at: string;
  note: string | null;
};

export type Differences = {
  closures: ClosureDiff[];
  transfers: TransferDiff[];
  /** Filtrga mos barcha qatorlar soni (ro'yxatlar sahifalab keladi) */
  closures_total: number;
  transfers_total: number;
  shortage_m: string;
  shortage_amount: number;
  surplus_m: string;
  surplus_amount: number;
  transfer_m: string;
  transfer_amount: number;
};

/** So'rov kalitlari: ombordagi har amal qoldiq, partiya va ko'chirish sahifalarini birga yangilaydi */
export const inventoryKeys = {
  all: ["inventory"] as const,
  stock: (filters: string) => ["inventory", "stock", filters] as const,
  batch: (id: number) => ["inventory", "batch", id] as const,
  transfers: (filters: string) => ["inventory", "transfers", filters] as const,
  transfer: (id: number) => ["inventory", "transfer", id] as const,
  options: ["inventory", "transfer-options"] as const,
  sendable: (location: string, search: string) => ["inventory", "sendable", location, search] as const,
  differences: (filters: string) => ["inventory", "differences", filters] as const,
};

/** Rulon soni o'zgarsa — metr o'rtacha rulon uzunligi bo'yicha: 3 rulon × 50 m = "150" */
export function metersForRolls(rolls: string, rollM: string): string {
  const length = toUnits(rollM, 2);
  if (!/^\d+$/.test(rolls) || length === null) return "";
  return fromUnits(Number(rolls) * length, 2);
}
