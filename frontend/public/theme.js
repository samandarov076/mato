// Tanlangan rejim sahifa chizilishidan oldin qo'llanadi — yorug' fon "lip" etib ko'rinmaydi.
// Alohida fayl (inline emas): ishlab chiqarishda CSP `script-src 'self'` (deploy/Caddyfile).
try {
  var theme = localStorage.getItem("mato.theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch (e) {}
