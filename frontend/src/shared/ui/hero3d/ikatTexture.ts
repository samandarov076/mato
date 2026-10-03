import * as THREE from "three";

/**
 * 3D mato uchun teksturalar — canvas'da chiziladi, fayl yuklanmaydi.
 * Adras naqshi brand.tsx dagi SVG bilan bir xil (o'sha ustunli romb mantiqi).
 */
const DYE = {
  ground: "#23306B",
  deep: "#1A2452",
  ring: "#31418C",
  inner: "#3D4EA0",
  saffron: "#E0B455",
  madder: "#C2505B",
  leaf: "#6FAE8A",
};

const TILE_W = 176;
const TILE_H = 264;

function diamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  columns: number,
  fill: string,
  colW = 9,
  stepH = 13,
  feathered = true,
) {
  ctx.fillStyle = fill;
  for (let k = -(columns - 1); k <= columns - 1; k++) {
    const half = (columns - Math.abs(k)) * stepH;
    // Ikat: bo'yalgan ip chetlari biroz "yoyilib" chiqadi — ustunlar yuqori-pastga siljigan
    const drift = feathered ? ((Math.abs(k * 37) % 5) - 2) * 1.3 : 0;
    ctx.fillRect(cx + k * colW - colW / 2, cy - half + drift, colW + 0.4, half * 2);
  }
}

/** Adras naqshi (rang xaritasi) — eng ustki mato uchun */
export function makeIkatTexture(scale = 3): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_W * scale;
  canvas.height = TILE_H * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = DYE.ground;
  ctx.fillRect(0, 0, TILE_W, TILE_H);

  const cx = TILE_W / 2;
  const cy = TILE_H / 2;
  diamond(ctx, cx, cy, 9, DYE.ring);
  diamond(ctx, cx, cy, 7, DYE.ground);
  diamond(ctx, cx, cy, 5, DYE.inner);
  diamond(ctx, cx, cy, 3, DYE.saffron);
  diamond(ctx, cx, cy, 2, DYE.ground);
  diamond(ctx, cx, cy, 1, DYE.madder);
  for (const [x, y] of [
    [0, 0],
    [TILE_W, 0],
    [0, TILE_H],
    [TILE_W, TILE_H],
  ]) {
    diamond(ctx, x, y, 5, DYE.ring);
    diamond(ctx, x, y, 3, DYE.ground);
    diamond(ctx, x, y, 1, DYE.leaf);
  }
  // Tanda iplari — nozik tik chiziqlar, naqsh "to'qilgan" ko'rinadi
  ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
  for (let x = 0; x < TILE_W; x += 3) ctx.fillRect(x, 0, 1, TILE_H);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.1, 1); // mato nisbati 2.4:1.7 — romb cho'zilmasin
  texture.anisotropy = 8;
  return texture;
}

/** To'qima bo'rtmasi (bump): tanda va arqoq iplari — yorug'lik ostida yuza matodek ko'rinadi */
export function makeWeaveBump(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size; i += 4) {
    ctx.fillStyle = "#9c9c9c";
    ctx.fillRect(i, 0, 2, size);
    ctx.fillStyle = "#666666";
    ctx.fillRect(0, i, size, 1);
  }
  // Tolalar: tartibsiz mayda dog'lar (deterministik — har safar bir xil)
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  for (let i = 0; i < size * 6; i++) ctx.fillRect(random() * size, random() * size, 1, 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(28, 20);
  return texture;
}
