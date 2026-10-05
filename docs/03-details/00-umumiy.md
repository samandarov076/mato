# 00 — Umumiy: detallar

Tizimning poydevori: kirish, rollar, ruxsatlar, biznes sozlamalari, interfeys tili, harakatlar jurnali.

## Kirish usullari

Ikki xil kirish bor:

1. **Shaxsiy kirish** — telefon raqami + parol. Biznes egasi va omborchi o'z qurilmalarida shu usulda ishlaydi. SMS ishlatilmaydi.
2. **Do'kon qurilmasi** — har do'konda bitta umumiy qurilma. U ikki usulda ochiladi: (a) **do'kon logini** — biznes egasi har do'konga alohida login va parol beradi (Tuzilma → Do'konlar), planshetda kirish sahifasining "Do'kon" varag'idan shu login bilan ochiladi, egasi planshetga kirmaydi (2026-10-03, biznes qarori); (b) biznes egasi o'z paroli bilan kirib, qurilmani do'konga bog'laydi. Ikkala holda ham keyin sotuvchilar faqat 4 xonali PIN bilan kiradi; har amal shu sotuvchi nomidan yoziladi. Do'kon logini faqat PIN ekranini ochadi — ma'lumotlar PIN'siz ko'rinmaydi.

Sotuvchining PIN'i unga ruxsat berilgan do'konlar qurilmalarida ishlaydi (02-tuzilmada belgilanadi); sotuv qurilma bog'langan do'konga yoziladi.

## Sahifalar

### Kirish
- Ikki varaq: **Xodim** (telefon raqami, parol) va **Do'kon** (do'kon logini, parol → PIN ekrani)
- Til, tovush va tungi rejim tugmalari — har ekranning yuqori o'ng burchagida (kirishdan oldin ham)
- Xato: "Telefon raqami yoki parol noto'g'ri" / "Do'kon logini yoki paroli noto'g'ri" (qaysi biri xatoligi aytilmaydi)
- Urinishlar cheklovi: telefon yoki do'kon logini bo'yicha 15 daqiqada 10 ta xato → 15 daqiqa to'xtatiladi.
  Qo'shimcha, IP bo'yicha: bitta manzildan login, do'kon logini va PIN bo'yicha jami 15 daqiqada 30 ta xato →
  shu IP 15 daqiqa to'xtatiladi (begona raqamni ataylab bloklab qo'yish yo'li yopiladi; docs/07, 6.4)

### Qurilmani do'konga bog'lash (faqat biznes egasi)
- Do'konni tanlash → qurilma nomi (masalan "1-do'kon kassasi") → bog'lash
- Bog'langan qurilmalar ro'yxati, har birini uzish mumkin (qurilma yo'qolsa)

### PIN ekrani (do'kon qurilmasida)
- Do'kon nomi, raqamli klaviatura, 4 xonali PIN
- Kirgach ekran yuqorisida doim sotuvchining ism-familiyasi ko'rinib turadi
- Yonida qulf tugmasi — bosilsa darhol PIN ekraniga qaytadi
- Avto-qulflash: qurilmaga tegilmasa standart 30 daqiqadan keyin; vaqtni biznes egasi o'zgartiradi

### Profil
- Ism (o'zi o'zgartiradi, asosiy ega ham; jurnalga yoziladi — 2026-10-03), telefon (o'zgarmaydi), til
- Parolni o'zgartirish (eski parol so'raladi)
- (PIN'ni faqat biznes egasi o'rnatadi va o'zgartiradi — 02-tuzilma)

### Biznes sozlamalari (faqat biznes egasi)
- **Biznes nomi** — sahifa tepasida, o'zgartirsa bo'ladi (2–100 belgi; jurnalga yoziladi). Platforma egasi ham biznes kartochkasida o'zgartira oladi.

| Sozlama | Turi | Standart qiymat |
|---------|------|-----------------|
| Kg da sotish | yoqish/o'chirish | yoqilgan |
| Nasiya | yoqish/o'chirish | yoqilgan |
| Nasiya muddati | kun | 30 |
| Kam qoldiq standart chegarasi | metr | — |
| Narxni yaxlitlash | 1 / 100 / 1 000 so'm | 1 000 |
| Do'kon qurilmasini avto-qulflash | daqiqa (harakatsizlik) | 30 |

### Harakatlar jurnali (faqat biznes egasi)
- Ustunlar: vaqt, xodim, joy (do'kon/sklad), kategoriya, hodisa, eski → yangi qiymat
- Filtr: davr, xodim, joy, kategoriya
- Kategoriyalar: Kirish · Sotuv · Ombor · Narx · Nasiya · Xodimlar va sozlamalar
- Standart ko'rinish — **kirish-chiqishsiz** (2026-10-03, UI ko'rib chiqish): "kirdi / chiqdi / qulfladi" yozuvlari ko'p va muhim hodisalarni ko'mib yuboradi, shuning uchun kategoriya filtri "Kirish-chiqishsiz" bilan ochiladi; "Barchasi" yoki "Kirish" tanlansa ko'rinadi. API: `GET /api/audit-logs?exclude_category=login`. Davr — tayyor tugmalar bilan (Bugun · Kecha · Shu hafta · Shu oy · Ixtiyoriy oraliq).
- Yozuvlarni hech kim tahrirlay yoki o'chira olmaydi

## Formalar va tekshiruvlar
| Maydon | Qoida |
|--------|-------|
| Telefon | +998 XX XXX XX XX formati; tizimda takrorlanmaydi |
| Parol | kamida 6 belgi |
| PIN | 4 raqam; istalgan kombinatsiya; faol sotuvchilar orasida takrorlanmaydi |

## Rollar va ruxsatlar
Qat'iy belgilangan rollar (sozlanadigan ruxsatlar — keyinroq).

Biznesda bir nechta ega bo'lishi mumkin:
- **Asosiy ega** — bitta; platforma egasi biznesni yaratganda belgilaydi; faqat platforma egasi orqali almashtiriladi.
- **Sherik-ega** — asosiy ega qo'shadi; barcha ishlarda asosiy ega bilan teng, faqat boshqa egalarni boshqara olmaydi.

| Amal | Biznes egasi | Omborchi | Sotuvchi |
|------|:---:|:---:|:---:|
| Boshqa egalarni qo'shish/faolsizlantirish | ✅ faqat asosiy ega | — | — |
| Do'kon, sklad, xodim qo'shish | ✅ | — | — |
| Katalog va tavsiya narxlar | ✅ | ✅ | — |
| Partiya kiritish, etiketka | ✅ | ✅ | — |
| Ko'chirish | ✅ | ✅ | — |
| Sotuv, qaytarish | ✅ | — | ✅ o'z do'konida |
| Nasiya berish, qarz to'lovini olish | ✅ | — | ✅ |
| Partiyani yopish | ✅ | ✅ | ✅ o'z joyida |
| Tannarxni kiritish va kirimda ko'rish | ✅ | ✅ | — |
| Foyda, hisobotlardagi tannarx | ✅ | — | — |
| Hisobotlar, jurnal, sozlamalar | ✅ | — | — |

Platforma egasi biznes ichidagi ma'lumotlarga kirmaydi — faqat bizneslarni boshqaradi (01-modul).

## Biznes qoidalari
- Tannarx sotuvchiga, foyda sotuvchi va omborchiga **server tomonida** yashiriladi (faqat interfeysda emas). Omborchi tannarxni faqat kirim sahifalarida ko'radi.
- Xodim o'chirilmaydi, faqat faolsizlantiriladi — tarixdagi sotuvlari saqlanadi. Faolsizlantirilganda barcha sessiyalari tugaydi.
- Biznes bloklansa, uning barcha xodimlari tizimdan chiqariladi.
- **Sessiya tokeni almashadi (2026-10-03, audit):** uzoq muddatli token (cookie) har yangilashda yangisiga almashtiriladi; eskisi 60 soniyadan keyin yaroqsiz (shu vaqt ichida boshqa ochiq oynalar o'sha yangi tokenni oladi — sessiya uzilmaydi).
- **Qulf darhol ishlaydi (2026-10-03, audit):** qulf tugmasi va avto-qulflash server javobini kutmaydi. Internet yo'q bo'lib chiqish so'rovi yetib bormasa, qurilmada "qulflangan" belgisi qoladi: sahifa qayta ochilsa ham sessiya tiklanmaydi (PIN so'raladi), chiqish so'rovi esa ulanish tiklangach qayta yuboriladi.
- **Foydalanuvchi almashganda keshdagi ma'lumot tozalanadi** — sessiya o'zi tugaganda ham (faqat "Chiqish" bosilganda emas): egadan qolgan tannarx va foyda keyingi xodimga ko'rinmaydi.
- **Ilova yangilanishi ishni yo'qotmaydi (2026-10-03, audit):** yangi versiya faqat oyna ko'rinmayotgan va ish yo'q paytda qo'llanadi — savat bo'sh, tasdiqlanmagan sotuv yo'q, kirim/ko'chirish qoralamasi yo'q, ochiq formaga hech narsa yozilmagan. Aks holda keyingi qulay paytda yoki ilovaning keyingi ochilishida.
- **Sirlar alohida kalitlarda:** `SECRET_KEY` — tokenlar va PIN qidiruvi; `CREDENTIALS_KEY` — ko'rinadigan parol/PIN. `APP_ENV=dev` dan boshqa muhitda `CREDENTIALS_KEY` bo'sh yoki `SECRET_KEY` bilan bir xil bo'lsa, ilova ishga tushmaydi.
- Interfeys 3 tilda; xodimlar kiritgan ma'lumotlar (tovar nomlari va h.k.) tarjima qilinmaydi.
- Jurnalda hodisa matn emas, kod sifatida saqlanadi — har kim uni o'z tilida ko'radi.

## Chekka holatlar
- PIN 5 marta xato kiritilsa → shu qurilmada 5 daqiqa bloklanadi, jurnalga yoziladi. Do'kon bo'yicha (barcha qurilmalari) 15 daqiqada 20 ta xato → do'kon bloki: 15 daqiqa → 1 soat → 24 soat (takrorlansa o'sadi), egalarga tizim xabari — tafsiloti 02-tuzilmada.
- Xodim parolni unutsa → biznes egasi yangilaydi. Biznes egasi unutsa → platforma egasi tiklaydi.
- **Parol va PIN'ni ko'rish (2026-10-02, biznes qarori):** biznes egasi o'zi boshqara oladigan xodimning hozirgi paroli yoki PIN'ini ko'ra oladi (Tuzilma → Xodimlar → "Parolni ko'rish" / "PIN'ni ko'rish"); platforma egasi — biznes egalarining parolini (biznes kartochkasi). Asosiy eganing parolini biznes ichida hech kim ko'rmaydi; platforma egasining o'z paroli hech kimga ko'rsatilmaydi. Har ko'rish jurnalga yoziladi (`user.secret_viewed`, `password.viewed_by_platform`). Buning uchun parol va PIN xeshdan tashqari shifrlangan holda ham saqlanadi (kalit — `CREDENTIALS_KEY`); bu imkoniyatdan oldin o'rnatilgan parol xodim keyingi safar kirganda saqlanadi.
- Do'kon qurilmasi yo'qolsa → biznes egasi uni uzadi, qurilma darhol ishlamay qoladi.
- Bitta xodim bir vaqtda bir nechta qurilmada — ruxsat etiladi.

## Ochiq savollar
- (yopildi — 02-tuzilmada hal qilindi)

## AI xulosasi

✅ Qilsa bo'ladi
- Umumiy qurilma + shaxsiy PIN — savdo nuqtalarida sinalgan standart usul.
- 3 til va kategoriyali jurnal 1-modulda qo'yilsa, keyingi modullar ularni tayyor ishlatadi.

⚠️ Qiyin yoki xavfli
- PIN boshqa sotuvchiga ma'lum bo'lsa, jurnal noto'g'ri odamni ko'rsatadi. Sotuvchi so'rasa, biznes egasi PIN'ni darhol almashtiradi.
- 3 til: barcha matnlar birinchi kundan tarjima fayllari orqali; sana va son formatlari ham tilga mos.

💡 Takliflar
- Avto-qulflash vaqti sozlanadi (standart 30 daqiqa) + qo'lda qulflash tugmasi — qabul qilindi.
