import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { FabricStack } from "../brand";

/**
 * 3D mato taxlami — WebGL bo'lsa, "harakatni kamaytirish" yoqilmagan bo'lsa va trafik tejash so'ralmagan
 * bo'lsa. Aks holda (yoki chunk yuklanmasa, masalan oflayn) — CSS 3D taxlam (brand.tsx). Sahna alohida
 * bo'lakda: Three.js kirish sahifasidan boshqa joyda yuklanmaydi.
 */
const FabricScene = lazy(() => import("./FabricScene"));

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function wants3D(): boolean {
  if (typeof window === "undefined") return false;
  // Panel faqat keng ekranda ko'rinadi (lg); telefonda Three.js umuman yuklanmasin
  if (!window.matchMedia("(min-width: 1024px)").matches) return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return false;
  return webglAvailable();
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Hero3D({ size = 250 }: { size?: number }) {
  const [enabled] = useState(wants3D);
  const fallback = (
    <div className="flex h-full items-center justify-center">
      <FabricStack size={size} />
    </div>
  );
  if (!enabled) return <div className="min-h-0 flex-1">{fallback}</div>;
  return (
    <>
      {/* Sahna butun panelni egallaydi; oqimdagi bo'sh joy pastdagi kartochkani joyida ushlab turadi */}
      <div className="absolute inset-0">
        <Boundary fallback={<div className="flex h-full flex-col justify-center">{fallback}</div>}>
          <Suspense fallback={<div className="flex h-full flex-col justify-center">{fallback}</div>}>
            <FabricScene />
          </Suspense>
        </Boundary>
      </div>
      <div className="min-h-0 flex-1" aria-hidden="true" />
    </>
  );
}
