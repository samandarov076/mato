import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows, Environment, Float, Lightformer, RoundedBox } from "@react-three/drei";
import { DepthOfField, EffectComposer, Vignette } from "@react-three/postprocessing";
import { easing } from "maath";
import * as THREE from "three";
import { makeIkatTexture, makeWeaveBump } from "./ikatTexture";

/**
 * Kirish sahifasidagi 3D mato taxlami (WebGL, faqat keng ekranda). Materiallar fizik asosda:
 * sheen — matoning yorug'likni chetlardan qaytarishi, bump — to'qima, soyalar — yo'naltirilgan
 * yorug'lik + kontakt soyasi. Qavatlar tepadan tushib joylashadi, keyin sekin suzadi;
 * sichqoncha harakatiga butun taxlam ozgina buriladi.
 *
 * Bu fayl alohida bo'lak (lazy chunk): Three.js faqat shu sahifaga, faqat kerak bo'lganda yuklanadi.
 */

// Pastdan tepaga: barg, feruza, ro'yan, za'faron, adras (indigo). sheen — chetlardagi yaltirash rangi
const CLOTH = [
  { color: "#4FA878", sheen: "#a6e3c4" },
  { color: "#1C97BC", sheen: "#a4def2" },
  { color: "#C2505B", sheen: "#f3aab1" },
  { color: "#E0B455", sheen: "#fce7b4" },
  { color: "#2a3a80", sheen: "#9aa8e4" },
];
const WIDTH = 2.4;
const THICK = 0.11;
const DEPTH = 1.7;
const GAP = 0.125;
// Haqiqiy taxlam tekis turmaydi: har qavat biroz siljigan va burilgan — [x, z, burilish]
const OFFSETS: [number, number, number][] = [
  [0.04, -0.02, 0.02],
  [-0.03, 0.03, -0.03],
  [0.05, -0.01, 0.012],
  [-0.04, 0.02, -0.02],
  [0, 0, 0.015],
];
const DROP_FROM = 2.2;

function Sheet({
  index,
  map,
  bump,
}: {
  index: number;
  map: THREE.Texture | null;
  bump: THREE.Texture;
}) {
  const ref = useRef<THREE.Group>(null);
  const [ox, oz, ry] = OFFSETS[index];
  const restY = index * GAP;
  const cloth = CLOTH[index];
  const sheenColor = useMemo(() => new THREE.Color(cloth.sheen), [cloth.sheen]);

  useFrame((state, delta) => {
    const group = ref.current;
    if (!group) return;
    // Har qavat o'z navbatida tushadi (0.12 s farq bilan), keyin joyida "nafas oladi"
    const started = state.clock.elapsedTime > 0.2 + index * 0.12;
    const breathe = Math.sin(state.clock.elapsedTime * 0.9 + index * 0.8) * 0.004 * (index + 1);
    easing.damp3(
      group.position,
      [ox, started ? restY + breathe : restY + DROP_FROM, oz],
      started ? 0.34 : 0.001,
      delta,
    );
  });

  return (
    <group ref={ref} position={[ox, restY + DROP_FROM, oz]} rotation-y={ry}>
      <RoundedBox args={[WIDTH, THICK, DEPTH]} radius={0.032} smoothness={5} castShadow receiveShadow>
        <meshPhysicalMaterial
          color={map ? "#ffffff" : cloth.color} // naqshli matoda rang teksturaning o'zida
          map={map ?? undefined}
          bumpMap={bump}
          bumpScale={0.012}
          roughness={0.8}
          metalness={0}
          sheen={1}
          sheenRoughness={0.45}
          sheenColor={sheenColor}
          envMapIntensity={1.3}
        />
      </RoundedBox>
    </group>
  );
}

function Stack() {
  const group = useRef<THREE.Group>(null);
  const textures = useMemo(() => ({ map: makeIkatTexture(), bump: makeWeaveBump() }), []);
  useEffect(
    () => () => {
      textures.map.dispose();
      textures.bump.dispose();
    },
    [textures],
  );

  // Sichqoncha qayerda bo'lsa, taxlam ozgina o'sha tomonga buriladi (parallaks)
  useFrame((state, delta) => {
    if (!group.current) return;
    easing.dampE(group.current.rotation, [state.pointer.y * -0.06, state.pointer.x * 0.22, 0], 0.35, delta);
  });

  return (
    <group ref={group}>
      <Float speed={1.1} rotationIntensity={0.05} floatIntensity={0.25} floatingRange={[-0.02, 0.04]}>
        {CLOTH.map((_, index) => (
          <Sheet key={index} index={index} map={index === CLOTH.length - 1 ? textures.map : null} bump={textures.bump} />
        ))}
      </Float>
    </group>
  );
}

/** Yorug'lik: issiq asosiy manba tepadan-o'ngdan, sovuq to'ldiruvchi chapdan, halqa — chetlarga nur */
function Lights() {
  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight
        position={[3.2, 6, 4]}
        intensity={3}
        color="#fff4e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.02}
        shadow-camera-near={1}
        shadow-camera-far={20}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />
      <Environment resolution={256}>
        <group rotation={[-Math.PI / 3, 0, 0]}>
          <Lightformer form="rect" intensity={4} position={[0, 5, -2]} scale={[8, 3, 1]} color="#fff6e6" />
          <Lightformer form="rect" intensity={2} position={[-5, 2, 3]} scale={[3, 6, 1]} color="#cfe0ff" />
          <Lightformer form="ring" intensity={2.5} position={[6, 3, -3]} scale={3} color="#ffd9a3" />
        </group>
      </Environment>
    </>
  );
}

function usePageVisible() {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    const onChange = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

export default function FabricScene() {
  const visible = usePageVisible();
  const [effects, setEffects] = useState(false);

  return (
    <Canvas
      dpr={[1, 1.5]}
      shadows
      frameloop={visible ? "always" : "never"} // boshqa oynaga o'tilsa — chizish to'xtaydi
      camera={{ position: [0, 3.2, 6.6], fov: 30, near: 0.5, far: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      onCreated={({ camera, gl }) => {
        camera.lookAt(0, 1.1, 0);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.15;
        // Chuqurlik va vinyetka — faqat WebGL2 va o'rtacha piksel zichligida (kuchsiz mashinalarni qiynamaydi)
        setEffects(gl.capabilities.isWebGL2 && window.devicePixelRatio <= 2);
      }}
      className="!absolute inset-0"
    >
      <Lights />
      {/* Taxlam kadrning yuqori qismida — pastda shisha kartochka turadi */}
      <group position={[0, 0.9, 0]}>
        <Stack />
        {/* Yer: yo'naltirilgan soya + yumshoq kontakt soyasi — taxlam "turibdi", "osilib" emas */}
        <mesh receiveShadow rotation-x={-Math.PI / 2} position-y={-0.015}>
          <planeGeometry args={[12, 12]} />
          <shadowMaterial transparent opacity={0.26} />
        </mesh>
        <ContactShadows position={[0, -0.012, 0]} opacity={0.55} scale={8} blur={2.6} far={2.2} resolution={512} />
      </group>
      {effects && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <DepthOfField target={[0, 1.2, 0]} focalLength={0.04} bokehScale={2} height={480} />
          <Vignette offset={0.25} darkness={0.45} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
