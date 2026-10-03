import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, VideoOff } from "lucide-react";
import { type Controls, type Facing, type Failure, failureOf, startScanner } from "./CameraScanner";
import { RowAction } from "./list";

/**
 * Doimiy kamera skaneri (sotuv ekrani): kamera yoqiq turadi, etiketka ko'rsatilishi bilan kod o'qiladi —
 * qo'l skaneri kabi. Sozlama qurilmada saqlanadi (`mato.autoscan`): planshetda bir marta yoqiladi.
 *
 * Butunlay ko'rinmas qilib bo'lmaydi: brauzer "kamera ishlayapti" belgisini o'zi ko'rsatadi, iPhone esa
 * ko'rinmaydigan kamerani to'xtatadi — shuning uchun kichik oyna bor (sotuvchi etiketkani to'g'ri tutadi).
 * Kadrlar faqat qurilmaning o'zida tekshiriladi, hech qayerga yuborilmaydi va saqlanmaydi.
 */
export type AutoScanPrefs = { on: boolean; facing: Facing };

const KEY = "mato.autoscan";
const DEFAULTS: AutoScanPrefs = { on: false, facing: "environment" };
let prefs: AutoScanPrefs = load();
const listeners = new Set<() => void>();

function load(): AutoScanPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<AutoScanPrefs> | null;
    return {
      on: saved?.on === true,
      facing: saved?.facing === "user" ? "user" : "environment",
    };
  } catch {
    return DEFAULTS;
  }
}

export function setAutoScan(patch: Partial<AutoScanPrefs>): void {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* xotira yopiq (maxfiy rejim) — sozlama faqat shu sahifa uchun */
  }
  listeners.forEach((listener) => listener());
}

export function useAutoScan(): AutoScanPrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => prefs,
    () => DEFAULTS,
  );
}

/**
 * Bitta etiketka kamera oldida turib qolsa, har kadrda qayta o'qiladi — shu kod `windowMs` davomida
 * ko'rinmay tursagina yana qabul qilinadi. Boshqa kod darhol o'tadi.
 */
export function createDeduper(windowMs = 2500) {
  let last = "";
  let seenAt = -Infinity;
  return (code: string, now: number = performance.now()): boolean => {
    const repeat = code === last && now - seenAt < windowMs;
    last = code;
    seenAt = now;
    return !repeat;
  };
}

/** Sahifa ko'rinmasa (boshqa oyna, qurilma qulflandi) — kamera o'chadi: batareya va qizish */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

/**
 * Sotuv formasining tepasidagi jonli oyna. `paused` — tovar tanlangan (metr va narx yozilmoqda): oyna
 * yig'iladi, kamera esa yoqiq qoladi — keyingi xaridorga qayta ishga tushirish kutilmaydi.
 */
export function AutoScanStrip({ paused, onCode }: { paused: boolean; onCode: (code: string) => void }) {
  const { t } = useTranslation();
  const { on, facing } = useAutoScan();
  const visible = usePageVisible();
  const video = useRef<HTMLVideoElement>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [ready, setReady] = useState(false);
  // Har chizishdagi yangi qiymatlar — kamerani qayta ishga tushirmasdan
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    if (!on || !visible) return;
    const element = video.current;
    if (!element) return;
    let stopped = false;
    let controls: Controls | null = null;
    const fresh = createDeduper();
    setFailure(null);
    setReady(false);

    void (async () => {
      try {
        controls = await startScanner(element, facing, (raw) => {
          const code = raw.trim();
          if (stopped || !code) return;
          // Pauzada ham "ko'rildi" deb belgilanadi: sotuvdan keyin kamera oldida qolgan etiketka
          // o'zi qayta tanlanib qolmasin — olib qo'yilib, yana ko'rsatilgandagina qabul qilinadi
          const isNew = fresh(code);
          if (pausedRef.current || !isNew) return;
          onCodeRef.current(code);
        });
        if (stopped) controls.stop();
        else setReady(true);
      } catch (error) {
        if (!stopped) setFailure(failureOf(error));
      }
    })();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [on, facing, visible]);

  if (!on) return null;

  return (
    // Tovar tanlanganda ko'zdan yashiriladi, lekin o'lchami saqlanadi (shaffof, oqimdan tashqarida): brauzer
    // chizilmaydigan (1 px, display:none) videoning kadrlarini yangilamaydi — skaner etiketka hali kamera
    // oldidami-yo'qmi bilmay qoladi va sotuvdan keyin o'sha tovarni qayta tanlab yuboradi
    <div
      className={
        paused
          ? "pointer-events-none absolute left-0 top-0 flex items-center gap-3 p-2 opacity-0"
          : "mb-4 flex items-center gap-3 rounded-control border border-line bg-page p-2 pr-3"
      }
      aria-hidden={paused || undefined}
      {...(paused ? ({ inert: "" } as unknown as Record<string, string>) : {})}
    >
      <div className="relative h-[72px] w-24 shrink-0 overflow-hidden rounded-lg bg-black">
        {/* Old kamerada ko'zgu ko'rinishi — sotuvchiga tabiiy; o'qishga ta'sir qilmaydi */}
        <video
          ref={video}
          muted
          playsInline
          className={`size-full object-cover ${facing === "user" ? "-scale-x-100" : ""}`}
        />
        {ready && !failure && (
          <span className="absolute left-1.5 top-1.5 size-2 animate-pulse rounded-full bg-[rgb(var(--madder))]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p role="status" className={`text-sm ${failure ? "text-madder" : "text-muted"}`}>
          {failure ? t(`scanner.${failure}`) : t(ready ? "scanner.auto_ready" : "scanner.starting")}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          <RowAction
            icon={RefreshCw}
            onClick={() => setAutoScan({ facing: facing === "user" ? "environment" : "user" })}
          >
            {t(facing === "user" ? "scanner.use_back" : "scanner.use_front")}
          </RowAction>
          <RowAction icon={VideoOff} onClick={() => setAutoScan({ on: false })}>
            {t("scanner.auto_off")}
          </RowAction>
        </div>
      </div>
    </div>
  );
}
