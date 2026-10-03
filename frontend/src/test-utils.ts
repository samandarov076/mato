/** Test yordamchilari. */

/**
 * Ekran kengligini taqlid qiladi (`useWide` va boshqa `min-width` so'rovlari uchun). jsdom'da `matchMedia` yo'q —
 * chaqirilmasa hamma narsa tor ekran (telefon) ko'rinishida chiziladi. `null` — asl holatga qaytaradi.
 */
export function setScreenWidth(width: number | null): void {
  if (width === null) {
    // @ts-expect-error jsdom'da bu xususiyat yo'q — o'chirib qo'yamiz
    delete window.matchMedia;
    return;
  }
  window.matchMedia = ((query: string) => {
    const min = /\(min-width:\s*(\d+)px\)/.exec(query);
    return {
      media: query,
      matches: min ? Number(min[1]) <= width : false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  }) as typeof window.matchMedia;
}
