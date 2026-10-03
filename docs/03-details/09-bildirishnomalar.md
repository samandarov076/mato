# 09 — Bildirishnomalar: detallar

Tizim ichidagi xabarlar (09) va Telegram bot (10).

**Qurish tartibi:** tizim ichidagi xabarlar (09) asosiy modullar bilan birga quriladi, chunki 05, 06, 07 ularni ishlatadi. Telegram qismi (10-telegram: bot, ulash, darhol xabarlar, kunlik xulosa, zaxira ogohlantirishi) — **eng oxirida**. Ungacha jadvaldagi Telegram ustuni ishlamaydi; xabarlar faqat tizim ichida.

## Xabarlar ro'yxati
| # | Hodisa | Kimga | Tizim ichida | Telegram |
|---|--------|-------|:---:|:---:|
| 1 | Kam qoldiq (SKU chegaradan pastga tushdi) | Egalar | ✅ | kunlik xulosada |
| 2 | Nasiya muddati o'tdi (sozlamadagi kun, standart 30) | Egalar | ✅ | kunlik xulosada |
| 3 | Qaytarish | Egalar | ✅ | — |
| 4 | Qarz hisobdan chiqarildi | Egalar | ✅ | — |
| 5 | Ko'chirish qabulida farq | Egalar | ✅ | darhol |
| 6 | Ko'chirish 24 soatdan beri qabul qilinmagan | Egalar | ✅ | — |
| 7 | Partiya katta kamomad bilan yopildi (10%+) | Egalar | ✅ | darhol |
| 8 | Manfiy qoldiqdan sotildi (izoh bilan) | Egalar | ✅ | — |
| 9 | Ko'chirish keldi — qabul qiling | Qabul qiluvchi (sotuvchi / omborchi) | ✅ | — |
| 10 | Zaxira nusxa olinmadi | Platforma egasi | — | darhol |

## Kunlik xulosa (Telegram) — 10-modul
- Har kuni egalarga bitta xabar; standart vaqt **21:00** (biznes sozlamasida o'zgartiriladi)
- Tarkibi: sana, savdo (o'tgan kunga nisbatan %), tushum, foyda, kam qoldiqdagi tovarlar soni, muddati o'tgan nasiya (mijozlar soni, summa)
- Xabar egasining interfeys tilida

## Sahifalar

### Xabarlar (tizim ichida)
- Yuqori panelda qo'ng'iroqcha belgisi va o'qilmaganlar soni
- Ro'yxat: vaqt, hodisa, qisqa matn, o'qilgan/o'qilmagan
- Xabar bosilsa — tegishli sahifa ochiladi (masalan qaytarish → sotuv kartochkasi)
- "Hammasini o'qilgan qilish"
- Filtr: hodisa turi

### Telegram sozlamalari (har bir ega o'z profilida) — 10-modul
- "Telegram'ni ulash" → bot ochiladi → "Start" → akkaunt bog'lanadi (bir martalik havola orqali)
- Ulangan akkaunt, "Uzish"
- Yoqish/o'chirish: kunlik xulosa, darhol keladigan xabarlar (5, 7)

## Biznes qoidalari
- Bitta umumiy platforma boti.
- Tizim ichidagi xabarlar doim keladi; Telegram'ni har ega o'zi sozlaydi.
- Bir hodisa uchun xabar bir marta yuboriladi (masalan kam qoldiq — chegaradan tushganda bir marta, qayta to'ldirilib yana tushgunicha takrorlanmaydi).
- Xabarlar matn emas, hodisa kodi + ma'lumot sifatida saqlanadi — har kim o'z tilida o'qiydi.
- Faolsizlantirilgan xodim yoki uzilgan Telegram'ga xabar yuborilmaydi.

## Chekka holatlar
- Ega botni bloklab qo'ysa → Telegram avtomatik uzilgan deb belgilanadi, tizim ichida "Telegram uzildi" xabari.
- Telegram vaqtincha ishlamasa → xabar navbatda turadi va keyinroq qayta yuboriladi.
- Kun davomida savdo bo'lmasa → kunlik xulosa baribir yuboriladi ("Bugun savdo bo'lmadi").

## AI xulosasi

✅ Qilsa bo'ladi
- Telegram Bot API bepul va oddiy; havola orqali ulash ega uchun 2 bosish.
- Kunlik xulosa — kam ish bilan katta qiymat.

⚠️ Qiyin yoki xavfli
- Xabarlar ko'payib ketsa e'tibor yo'qoladi — shuning uchun faqat 3 tur Telegram'da darhol keladi.
- Xabarlar fonda (navbat orqali) yuborilishi kerak — sotuv Telegram javobini kutib sekinlashmasligi uchun.
- Kunlik xulosa har biznesning o'z vaqtida — rejalashtiruvchi (scheduler) kerak.

💡 Takliflar
- Kam qoldiq xabari takrorlanmasligi — aks holda har sotuvda yangi xabar keladi.
