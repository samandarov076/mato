import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "./client";

/** Xatoni foydalanuvchi tilidagi matnga aylantiradi: server kod qaytaradi, matn tarjima faylida. */
export function useErrorText() {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown): string => {
      const code = error instanceof ApiError ? error.code : "unknown";
      // Blok xabarlarida qancha kutish kerakligi daqiqada ko'rsatiladi
      const seconds = error instanceof ApiError ? (error.retryAfter ?? 0) : 0;
      const minutes = Math.max(1, Math.ceil(seconds / 60));
      // Server qo'shib yuborgan tafsilotlar ham matnga qo'yiladi (masalan: "bu joyda {{available}} m bor")
      const details = error instanceof ApiError ? error.details : {};
      return t(`errors.${code}`, { ...details, defaultValue: t("errors.unknown"), minutes });
    },
    [t],
  );
}
