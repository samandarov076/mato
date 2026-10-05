import { useEffect, useRef } from "react";

/**
 * Qurilmaga `minutes` daqiqa tegilmasa — qulflaydi (PIN ekraniga qaytaradi).
 * Do'kon qobig'ida (sotuvchi) doim; ega qobig'ida — faqat o'z do'konining planshetida kirgan bo'lsa (`enabled`).
 */
export function useAutoLock(minutes: number, lock: () => void, enabled = true) {
  const lastActivity = useRef(Date.now());
  const fired = useRef(false); // bir marta qulflaydi — har 10 soniyada qayta chaqirmaydi
  useEffect(() => {
    if (!enabled) return;
    lastActivity.current = Date.now();
    fired.current = false;
    const touch = () => {
      lastActivity.current = Date.now();
      fired.current = false;
    };
    const check = () => {
      if (fired.current || Date.now() - lastActivity.current < minutes * 60_000) return;
      fired.current = true;
      lock();
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    // Ekran o'chib-yonganda ham tekshiriladi (planshet uxlab qolgan bo'lishi mumkin)
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, 10_000);
    return () => {
      events.forEach((name) => window.removeEventListener(name, touch));
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [minutes, lock, enabled]);
}
