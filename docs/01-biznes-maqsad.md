# Biznes maqsadi

**Mahsulot:** Mato savdosi uchun SaaS tizim — har qanday mato sotuvchi o'z do'konlari, skladlari va xodimlarini qo'shib ishlatadi. Do'kon, sklad va xodimlar soni cheklanmagan.

**Pilot mijoz:** 2 do'kon, bir nechta sklad, har do'konda 2-3 sotuvchi. 1-versiya pilot mijoz bilan ishga tushadi; obuna to'lovlari keyinroq qo'shiladi.

**Qanday sotiladi:**
- Metrlab va rulonlab (rulon kg da tortiladi, 1 kg = X metr)
- Ulgurji va chakana, nasiyaga ham
- Valyuta: so'm

**Tovar hisobi — partiya bo'yicha:**
- Bir xil tovar (mato + rang + gul) bir partiyada keladi, masalan 100 rulon
- Partiyaga bitta etiketka: sana, mato-kodi, rang-kodi, gul-kodi
- Sotuvda etiketka skaner qilinadi
- Partiyani sotuvchi yopadi; yopilganda yozilgan jami metr va sotilgan metr solishtiriladi → kamomad qayd etiladi

**Sotuv ekrani:** skaner yoki rang/gul tanlash → kg yoki metr kiritiladi, ikkinchisi avtomatik → tavsiya narx ko'rinadi → sotuvchi haqiqiy narxni yozadi (cheklov yo'q, javobgarlik sotuvchida).

**Hisobotlar (kun/oy filtri bilan):** savdo, foyda, tushum, soatlar bo'yicha trend, qoldiq, 30 kundan oshgan nasiyalar.

**Rollar:** Platforma egasi, Biznes egasi, Sotuvchi
**Platforma:** Web + PWA, barcha qurilmalarda

## AI xulosasi

✅ Qilsa bo'ladi
- Partiya yondashuvi amaliy; kamomad partiya darajasida aniqlanadi.
- SKU (mato + rang + gul) doimiy, partiya unga sana qo'shadi — analitika tovar va partiya bo'yicha.
- Kg ↔ metr koeffitsienti partiya ma'lumotidan hisoblanadi.

⚠️ Qiyin yoki xavfli
- SaaS: multi-tenant arxitektura boshidan; pilot bilan ishga tushirish, obuna keyin.
- Bizneslar ish uslubi har xil → har biznesda sozlamalar (kg da sotish, nasiya va h.k.).
- Foyda uchun kirimda tannarx majburiy.
- Partiyani sotuvchi yopadi → yopilishdagi qoldiq va kim yopgani egasiga ko'rinishi kerak.

❌ Tavsiya etilmaydi
- "Mukammal qilib, keyin sotamiz" — o'rniga pilot bilan chiqish, fikr asosida kengaytirish.

💡 Takliflar
- Savdo (sotilgan summa) va tushum (kassaga tushgan pul) alohida.
- "Tavsiya narxdan og'ish" hisoboti.
