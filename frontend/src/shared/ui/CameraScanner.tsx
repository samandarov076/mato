import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Camera, ScanLine, X } from "lucide-react";
import { feedback } from "@/shared/feedback";
import { setAutoScan } from "./AutoScanner";
import { focusRing } from "./tones";

export type Failure = "insecure" | "denied" | "no_camera" | "failed";
export type Controls = { stop: () => void };
/** environment — orqa kamera (telefon qo'lda); user — old kamera (peshtaxtada turgan planshet) */
export type Facing = "environment" | "user";

// Etiketka — Code128; zavod shtrix-kodi — EAN-13; QR — kelajak uchun
const FORMATS = ["code_128", "ean_13", "qr_code"];

/** Tanlangan kamera, yuqori sifat va doimiy avtofokus (qo'llasa) — ingichka chiziqlar tiniq chiqsin */
function cameraConstraints(facing: Facing): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      facingMode: { ideal: facing },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      // TS lug'atida yo'q, lekin Chrome/Android tushunadi; tushunmagan brauzer e'tiborsiz qoldiradi
      advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
    },
  };
}

// Shape Detection API (TS lug'atida hali yo'q) — faqat kerakli qismi
type NativeDetector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type DetectorClass = {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats: () => Promise<string[]>;
};

async function nativeDetector(): Promise<NativeDetector | null> {
  const Detector = (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const supported = await Detector.getSupportedFormats();
    if (!supported.includes("code_128")) return null;
    return new Detector({ formats: FORMATS.filter((format) => supported.includes(format)) });
  } catch {
    return null;
  }
}

async function startCamera(element: HTMLVideoElement, facing: Facing): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(facing));
  element.srcObject = stream;
  await element.play();
  return stream;
}

/** Brauzerning o'z o'quvchisi: kadrni ~8 marta/soniya tekshiradi */
async function scanNative(
  detector: NativeDetector,
  element: HTMLVideoElement,
  facing: Facing,
  found: (code: string) => void,
) {
  const stream = await startCamera(element, facing);
  let active = true;
  const loop = async () => {
    while (active) {
      try {
        const [hit] = await detector.detect(element);
        if (hit?.rawValue) found(hit.rawValue);
      } catch {
        /* kadr hali tayyor emas — keyingisi */
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  };
  void loop();
  return {
    stop() {
      active = false;
      stream.getTracks().forEach((track) => track.stop());
    },
  } satisfies Controls;
}

/** zxing (iPhone Safari va BarcodeDetector'siz brauzerlar) — "qattiqroq urinish" rejimida */
async function scanZxing(element: HTMLVideoElement, facing: Facing, found: (code: string) => void): Promise<Controls> {
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.EAN_13, BarcodeFormat.QR_CODE]);
  hints.set(DecodeHintType.TRY_HARDER, true); // qiya yoki xira kadrda ham — sekinroq, lekin ishonchliroq
  const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100 });
  return reader.decodeFromConstraints(cameraConstraints(facing), element, (result) => {
    if (result) found(result.getText());
  });
}

/**
 * Kamerani yoqib, kod o'qishni boshlaydi: har topilgan kod `found` ga keladi (to'xtatish — `stop()`).
 * Brauzerning o'z o'quvchisi bo'lsa (Chrome: Mac, Android, Windows) — u, bo'lmasa — zxing (iPhone Safari).
 * Kamera faqat xavfsiz ulanishda (https yoki localhost) ishlaydi — aks holda xato.
 */
export async function startScanner(
  element: HTMLVideoElement,
  facing: Facing,
  found: (code: string) => void,
): Promise<Controls> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new DOMException("insecure", "SecurityError");
  }
  const native = await nativeDetector();
  return native ? scanNative(native, element, facing, found) : scanZxing(element, facing, found);
}

/** Kamera xatosi → foydalanuvchiga tushunarli sabab */
export function failureOf(error: unknown): Failure {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return "insecure";
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "no_camera";
  return "failed";
}

/**
 * Telefon yoki planshet kamerasi bilan shtrix-kod o'qish (etiketka — Code128; SKU yoki QR ham bo'lishi mumkin).
 * Kutubxona (zxing) faqat tugma bosilganda yuklanadi — sotuv ekrani og'irlashmaydi. Kamera faqat xavfsiz
 * ulanishda (https yoki localhost) ishlaydi — brauzer qoidasi. Kod topilishi bilan oyna yopiladi va kod
 * qo'l skaneri yuborgandek qaytariladi.
 */
export function CameraScanButton({
  onDetected,
  className = "",
}: {
  onDetected: (code: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => button.current?.focus());
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={t("scanner.open")}
        title={t("scanner.open")}
        onClick={(event) => {
          feedback("tap", event);
          setOpen(true);
        }}
        className={`pressable grid size-10 place-items-center rounded-control text-muted hover:bg-indigo-soft hover:text-ink ${focusRing} ${className}`}
      >
        <Camera className="size-5" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <ScannerDialog
            onClose={close}
            onDetected={(code) => {
              setOpen(false);
              onDetected(code);
            }}
          />,
          document.body,
        )}
    </>
  );
}

function ScannerDialog({ onClose, onDetected }: { onClose: () => void; onDetected: (code: string) => void }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [ready, setReady] = useState(false);
  // Yangi callback har chizishda keladi — kamera qayta ishga tushmasligi uchun ref orqali
  const detected = useRef(onDetected);
  detected.current = onDetected;

  useEffect(() => {
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let stopped = false;
    let controls: Controls | null = null;
    const found = (code: string) => {
      if (stopped || !code.trim()) return;
      stopped = true;
      controls?.stop();
      detected.current(code.trim());
    };

    void (async () => {
      try {
        const element = video.current;
        if (!element) return;
        controls = await startScanner(element, "environment", found);
        if (stopped) controls.stop(); // oyna kamera yoqilguncha yopilgan bo'lsa
        else setReady(true);
      } catch (error) {
        if (!stopped) setFailure(failureOf(error));
      }
    })();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="scanner-title"
      className="fixed inset-0 z-50 flex animate-fade flex-col bg-black text-white"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <p id="scanner-title" className="min-w-0 flex-1 font-medium">
          {t("scanner.title")}
        </p>
        <button
          ref={closeButton}
          type="button"
          onClick={onClose}
          aria-label={t("scanner.close")}
          className="pressable grid size-11 place-items-center rounded-full bg-white/15 hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <X className="size-6" aria-hidden="true" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={video} className="absolute inset-0 size-full object-cover" muted playsInline />
        {/* Ramka: shtrix-kod shu yerga to'g'rilanadi; atrofi qoraytirilgan, o'rtada qizil "lazer" chizig'i */}
        {!failure && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="flex h-[34%] w-[82%] max-w-md items-center rounded-2xl border-[3px] border-white shadow-[0_0_0_200vmax_rgb(0_0_0/0.45)]">
              {ready && <div className="mx-3 h-0.5 flex-1 animate-pulse bg-[rgb(var(--madder))]" />}
            </div>
          </div>
        )}
        {(failure || !ready) && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <p role={failure ? "alert" : "status"} className="max-w-sm text-[17px] leading-relaxed">
              {failure ? t(`scanner.${failure}`) : t("scanner.starting")}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-3 px-4 py-4 text-center">
        <p className="text-sm text-white">{t("scanner.hint")}</p>
        {/* Doimiy rejim: kamera sotuv ekranida yoqiq turadi — har safar tugma bosish shart emas */}
        <button
          type="button"
          onClick={() => {
            setAutoScan({ on: true });
            onClose();
          }}
          className="pressable inline-flex min-h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-medium text-white hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <ScanLine className="size-4" aria-hidden="true" />
          {t("scanner.auto_enable")}
        </button>
      </div>
    </div>
  );
}
