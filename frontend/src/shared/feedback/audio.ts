import { getFeedbackPrefs } from "./settings";

/**
 * Interfeys tovushlari — Web Audio bilan joyida sintez qilinadi: fayl yuklanmaydi, oflaynda ham ishlaydi,
 * hajmi nol. Hammasi past va qisqa — kun bo'yi sotuv qiladigan odamni charchatmasin.
 *
 * Fazoviy tovush: tugma ekranning qaysi tomonida bosilgan bo'lsa, tovush ham o'sha tomondan keladi
 * (StereoPanner). Brauzer siyosati: tovush faqat foydalanuvchi sahifaga bir marta tekkanidan keyin
 * chiqadi — `installAudioUnlock()` buni birinchi bosishda ochadi.
 */
export type SoundKind =
  | "tap"
  | "tick"
  | "toggle"
  | "select"
  | "success"
  | "warning"
  | "error"
  | "remove"
  | "scan"
  | "swish"
  | "cash"
  | "celebrate";

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
const lastPlayed = new Map<SoundKind, number>();

const MASTER_GAIN = 0.6;
const MIN_GAP_MS = 35; // bir xil tovush ketma-ket shu oraliqdan tez takrorlanmaydi

function getContext(): Ctx | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    ctx = new Ctor();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(compressor).connect(ctx.destination);
  }
  return ctx;
}

/** Birinchi bosish/tugmada audio kontekstni ochadi (brauzer avto-ijroni shunday talab qiladi). */
export function installAudioUnlock(): void {
  if (typeof window === "undefined") return;
  const unlock = () => {
    const context = getContext();
    if (context && context.state === "suspended") void context.resume();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

function noise(context: Ctx): AudioBuffer {
  if (!noiseBuffer) {
    const length = Math.floor(context.sampleRate * 0.5);
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

type Tone = {
  freq: number;
  to?: number;
  type?: OscillatorType;
  at?: number;
  dur: number;
  gain: number;
  attack?: number;
};

function tone(context: Ctx, out: AudioNode, t0: number, { freq, to, type = "sine", at = 0, dur, gain, attack = 0.003 }: Tone) {
  const osc = context.createOscillator();
  const env = context.createGain();
  const start = t0 + at;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(env).connect(out);
  osc.start(start);
  osc.stop(start + dur + 0.03);
}

type Hiss = { at?: number; dur: number; gain: number; from: number; to?: number; q?: number };

/** Filtrlangan shovqin — "tap", "shuv" kabi mexanik tovushlar uchun */
function hiss(context: Ctx, out: AudioNode, t0: number, { at = 0, dur, gain, from, to, q = 0.9 }: Hiss) {
  const src = context.createBufferSource();
  src.buffer = noise(context);
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = q;
  const start = t0 + at;
  filter.frequency.setValueAtTime(from, start);
  if (to) filter.frequency.exponentialRampToValueAtTime(to, start + dur);
  const env = context.createGain();
  env.gain.setValueAtTime(gain, start);
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(env).connect(out);
  src.start(start);
  src.stop(start + dur + 0.03);
}

const SOUNDS: Record<SoundKind, (context: Ctx, out: AudioNode, t: number, on: boolean) => void> = {
  // Yumshoq "tap": qisqa shovqin + juda qisqa ohang
  tap: (c, o, t) => {
    hiss(c, o, t, { dur: 0.035, gain: 0.14, from: 3200, to: 1100 });
    tone(c, o, t, { freq: 1400, dur: 0.028, gain: 0.05 });
  },
  tick: (c, o, t) => tone(c, o, t, { freq: 2600, dur: 0.016, gain: 0.05 }),
  // Yoqilganda yuqoriga, o'chirilganda pastga siljiydigan ikki ohang
  toggle: (c, o, t, on) =>
    tone(c, o, t, { freq: on ? 1100 : 1500, to: on ? 1500 : 1000, type: "triangle", dur: 0.065, gain: 0.07 }),
  select: (c, o, t) => {
    tone(c, o, t, { freq: 740, type: "triangle", dur: 0.05, gain: 0.07 });
    tone(c, o, t, { freq: 1480, at: 0.02, dur: 0.06, gain: 0.04 });
  },
  // Yakunlash qo'ng'irog'i: C6–E6–G6
  success: (c, o, t) => {
    [1046.5, 1318.5, 1568].forEach((freq, i) => tone(c, o, t, { freq, at: i * 0.07, dur: 0.5, gain: 0.11 }));
    tone(c, o, t, { freq: 2093, at: 0.14, dur: 0.6, gain: 0.03 });
  },
  warning: (c, o, t) => {
    tone(c, o, t, { freq: 520, type: "triangle", dur: 0.09, gain: 0.08 });
    tone(c, o, t, { freq: 440, type: "triangle", at: 0.11, dur: 0.12, gain: 0.08 });
  },
  // Past, ikki marta "g'o'ng'illash" — xato
  error: (c, o, t) => {
    tone(c, o, t, { freq: 220, to: 180, type: "triangle", dur: 0.16, gain: 0.1 });
    tone(c, o, t, { freq: 220, to: 180, type: "triangle", at: 0.2, dur: 0.16, gain: 0.1 });
  },
  // Pastga "shuv" — olib tashlash
  remove: (c, o, t) => {
    hiss(c, o, t, { dur: 0.09, gain: 0.1, from: 1800, to: 300 });
    tone(c, o, t, { freq: 300, to: 150, dur: 0.1, gain: 0.05 });
  },
  // Skaner "bip-bop"
  scan: (c, o, t) => {
    tone(c, o, t, { freq: 1760, dur: 0.06, gain: 0.1 });
    tone(c, o, t, { freq: 2217, at: 0.07, dur: 0.08, gain: 0.1 });
  },
  swish: (c, o, t) => hiss(c, o, t, { dur: 0.16, gain: 0.05, from: 600, to: 2400, q: 0.7 }),
  // Tanga "jiring" — pul qabul qilindi
  cash: (c, o, t) => {
    tone(c, o, t, { freq: 2637, dur: 0.08, gain: 0.08 });
    tone(c, o, t, { freq: 3520, at: 0.03, dur: 0.25, gain: 0.07 });
  },
  // Arpejio + akkord — kamdan-kam, quvonchli paytlar uchun
  celebrate: (c, o, t) => {
    [523, 659, 784, 1046, 1318, 1568].forEach((freq, i) =>
      tone(c, o, t, { freq, type: "triangle", at: i * 0.06, dur: 0.45, gain: 0.08 }),
    );
    [1046.5, 1318.5, 1568, 2093].forEach((freq) => tone(c, o, t, { freq, at: 0.42, dur: 0.9, gain: 0.07 }));
  },
};

export type PlayOptions = {
  /** Tovush manbai ekranda qayerda (0 — chap, 1 — o'ng); berilmasa o'rtadan */
  x?: number;
  /** toggle uchun: yoqildimi */
  on?: boolean;
};

/** Tovushni chaladi. Sozlamada o'chirilgan, brauzer qo'llamagan yoki hali ochilmagan bo'lsa — jim. */
export function playSound(kind: SoundKind, { x, on = true }: PlayOptions = {}): boolean {
  if (!getFeedbackPrefs().sound) return false;
  const context = getContext();
  if (!context || !master || context.state !== "running") return false;

  const now = performance.now();
  if (now - (lastPlayed.get(kind) ?? -Infinity) < MIN_GAP_MS) return false;
  lastPlayed.set(kind, now);

  let out: AudioNode = master;
  if (x !== undefined && typeof context.createStereoPanner === "function") {
    const panner = context.createStereoPanner();
    panner.pan.value = Math.max(-0.7, Math.min(0.7, (x - 0.5) * 1.4));
    panner.connect(master);
    out = panner;
  }
  SOUNDS[kind](context, out, context.currentTime, on);
  return true;
}
