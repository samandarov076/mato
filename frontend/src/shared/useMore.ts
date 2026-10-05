import { useState } from "react";

/**
 * Sahifalangan tarix: kartochka birinchi sahifa bilan keladi (`first`), qolgani "Yana ko'rsatish" bilan
 * (`load(offset)`). Kartochka qayta yuklansa (`first` yangilansa) — qo'shimcha sahifalar tashlanadi:
 * ro'yxat yana boshidan, yangi yozuv tepada.
 */
export function useMore<T>(
  first: T[] | undefined,
  total: number | undefined,
  load: (offset: number) => Promise<{ items: T[] }>,
) {
  const [state, setState] = useState<{ base: T[] | undefined; extra: T[] }>({ base: first, extra: [] });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<unknown>(null);
  const extra = state.base === first ? state.extra : [];
  const items = [...(first ?? []), ...extra];

  async function more() {
    setLoading(true);
    setFailed(null);
    try {
      const page = await load(items.length);
      setState({ base: first, extra: [...extra, ...page.items] });
    } catch (error) {
      setFailed(error);
    } finally {
      setLoading(false);
    }
  }
  return { items, hasMore: items.length < (total ?? 0), loading, failed, more };
}
