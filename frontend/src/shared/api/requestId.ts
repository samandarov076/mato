/**
 * Takrorlanishdan himoya: pul yoki qoldiq yozadigan har "yaratish" so'roviga (sotuv, qarz to'lovi, kirim,
 * ko'chirish) noyob identifikator (`client_uuid`) beriladi. Server shu identifikatorni bir marta qabul qiladi —
 * javob yo'qolib tugma qayta bosilsa, yozuv ikki marta yaratilmaydi.
 */
import { useMemo, useRef } from "react";
import { ApiError } from "./client";

/** Tasodifiy identifikator. `crypto.randomUUID` faqat HTTPS'da bor — bo'lmasa o'zimiz yasaymiz. */
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
}

/**
 * Server so'rovni aniq rad etdimi (4xx) — demak yozuv yaratilmagan. Boshqa har qanday xato (javob kelmadi,
 * vaqt tugadi, 5xx) — natija noaniq: yozuv yaratilgan bo'lishi ham mumkin.
 */
export const isRejected = (error: unknown): boolean =>
  error instanceof ApiError && error.status >= 400 && error.status < 500;

/**
 * Formaning joriy so'rov identifikatori. `current()` — yuborishda; `settle()` — natijadan keyin:
 * tasdiqlansa (`settle()`) yoki server aniq rad etsa — keyingi so'rovga yangi identifikator; natija noaniq
 * bo'lsa — o'shanisi qoladi va qayta urinish o'sha yozuvga tegishli bo'ladi.
 * `storageKey` berilsa identifikator qurilmada saqlanadi (qoralamali formalar: sahifa yangilansa ham o'sha).
 */
export function useRequestId(storageKey?: string) {
  const id = useRef<string | null>(null);
  return useMemo(
    () => ({
      current(): string {
        if (id.current === null) {
          let saved: string | null = null;
          try {
            saved = storageKey ? localStorage.getItem(storageKey) : null;
          } catch {
            /* xotira yopiq — identifikator faqat shu sahifada yashaydi */
          }
          id.current = saved ?? newId();
          try {
            if (storageKey && !saved) localStorage.setItem(storageKey, id.current);
          } catch {
            /* xotira to'lgan yoki yopiq */
          }
        }
        return id.current;
      },
      settle(error?: unknown): void {
        if (error !== undefined && !isRejected(error)) return; // noaniq — o'sha identifikator qoladi
        id.current = null;
        try {
          if (storageKey) localStorage.removeItem(storageKey);
        } catch {
          /* xotira yopiq — o'chiradigan narsa ham yo'q */
        }
      },
    }),
    [storageKey],
  );
}
