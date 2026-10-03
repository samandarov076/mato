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
import { router } from "./app/router";
import { AuthProvider } from "./modules/auth/AuthProvider";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

// Tovushlar faqat foydalanuvchi sahifaga bir marta tekkanidan keyin chiqadi (brauzer qoidasi)
installAudioUnlock();

// Yangi versiya: har soatda tekshiriladi; kelganda — sahifa band bo'lmagan payt (savat bo'sh, ko'rinmayotgan oyna
// yoki keyingi ochilish) yangilanadi. Kod bo'laklari o'zgarganda eski sahifa "oq ekran" bo'lib qolmasin.
const updateApp = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (registration) window.setInterval(() => void registration.update(), 60 * 60 * 1000);
  },
  onNeedRefresh() {
    const apply = () => {
      if (document.visibilityState === "hidden") void updateApp(true);
    };
    document.addEventListener("visibilitychange", apply);
    // Savat bo'sh bo'lsa, foydalanuvchi oynani almashtirganda yangilanadi; aks holda keyingi ochilishda
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
