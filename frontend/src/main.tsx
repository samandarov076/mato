import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import "@fontsource/golos-text/400.css";
import "@fontsource/golos-text/500.css";
import "@fontsource/golos-text/600.css";
import { i18nReady } from "./shared/i18n";
import { installAudioUnlock } from "./shared/feedback";
import { installPwaListeners } from "./shared/pwa";
import { applyUpdateWhenIdle, installDirtyTracking } from "./shared/update";
import { router } from "./app/router";
import { AuthProvider } from "./modules/auth/AuthProvider";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

// Tovushlar faqat foydalanuvchi sahifaga bir marta tekkanidan keyin chiqadi (brauzer qoidasi)
installAudioUnlock();
// "Ilovani o'rnatish" taklifi sahifa ochilishi bilan keladi — React chizilishini kutmasdan ushlab qolinadi
installPwaListeners();

// Formaga yozilgani kuzatiladi — yangilanish ochiq, tahrirlangan formani yo'qotmasin
installDirtyTracking();

// Yangi versiya: har soatda tekshiriladi; kelganda sahifa so'ramasdan qayta yuklanmaydi — faqat oyna
// ko'rinmayotgan va ish yo'q paytda (savat bo'sh, tasdiqlanmagan sotuv yo'q, forma tahrirlanmagan; `shared/update.ts`).
// Aks holda — keyingi qulay paytda yoki ilovaning keyingi ochilishida.
const updateApp = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) window.setInterval(() => void registration.update(), 60 * 60 * 1000);
  },
  onNeedRefresh() {
    applyUpdateWhenIdle(() => void updateApp(true));
  },
});

void i18nReady.then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        </AuthProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
