import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // Portlar loyiha ildizidagi .env dan (kompyuterda 8000/5173 band bo'lishi mumkin)
  const env = loadEnv(mode, "..", ["BACKEND_PORT", "FRONTEND_PORT"]);
  const backendPort = env.BACKEND_PORT || "8000";
  const frontendPort = Number(env.FRONTEND_PORT || 5173);

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        injectRegister: null,
        includeAssets: ["icons/*.png"],
        manifest: {
          name: "mato-savdo",
          short_name: "mato-savdo",
          description: "Mato savdosi: sklad, sotuv, nasiya, hisobotlar",
          lang: "uz",
          start_url: "/",
          display: "standalone",
          background_color: "#F6F7FB",
          theme_color: "#23306B",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          // API javoblari keshlanmaydi — qoldiq va narx doim serverdan
          navigateFallbackDenylist: [/^\/api\//],
          // Shriftlar va belgilar ham oldindan keshlanadi — oflaynda matn almashmaydi
          globPatterns: ["**/*.{js,css,html,woff2,png,svg,webmanifest}"],
          // 3D sahna (Three.js) katta va faqat keng ekranli kirish sahifasida kerak — oldindan yuklanmaydi
          globIgnores: ["**/three-*.js"],
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              // Tovar rasmlari o'zgarmas (yangi rasm — yangi nom): bir marta yuklanadi
              urlPattern: ({ url }) => url.pathname.startsWith("/api/media/"),
              handler: "CacheFirst",
              options: {
                cacheName: "media",
                expiration: { maxEntries: 500, maxAgeSeconds: 30 * 24 * 3600 },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
    // tsconfig.json dagi "@/*" bilan bir xil
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    build: {
      // Arzon planshetlardagi eski Chrome/WebView ham ochsin (??= kabi yangi sintaksis tushiriladi)
      target: ["chrome80", "safari13", "firefox78"],
      rollupOptions: {
        output: {
          // Kutubxonalar alohida bo'laklarda — ilova kodi o'zgarganda qayta yuklanmaydi
          manualChunks(id) {
            if (!id.includes("node_modules/")) return undefined;
            if (/node_modules\/(three|@react-three|postprocessing|maath|three-stdlib|@monogrid|camera-controls|detect-gpu|stats-gl|meshline|troika|hls\.js|zustand|suspend-react|its-fine|@use-gesture|react-use-measure|glsl-noise|@babel\/runtime)\//.test(id)) return "three";
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
            if (/node_modules\/(react-router|react-router-dom|@remix-run)\//.test(id)) return "router";
            if (/node_modules\/@tanstack\//.test(id)) return "query";
            if (/node_modules\/(i18next|react-i18next|i18next-browser-languagedetector)\//.test(id)) return "i18n";
            return undefined;
          },
        },
      },
    },
    // Vitest: komponent testlari brauzersiz (jsdom) ishlaydi — `npm test`
    test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"], css: false },
    server: {
      port: frontendPort,
      strictPort: true,
      proxy: { "/api": `http://localhost:${backendPort}` },
    },
  };
});
