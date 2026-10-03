# 06 — Sotuv: detallar

Do'kon qurilmasidagi sotuv ekrani, to'lov, qaytarish, bekor qilish. Asosiy mezon — tezlik.

## Sotuv ekrani

### Oqim
1. **Tovar:** skaner (partiya darhol topiladi) yoki qo'lda: mato → rang → gul (rasmlar bilan, agar bo'lsa)
2. **Partiya:** skanerda — aniq. Qo'lda tanlanganda shu do'konda bir nechta partiya bo'lsa — avtomatik **eng eskisi**; sotuvchi boshqasini tanlay oladi
3. **Miqdor:** metr YOKI kg kiritiladi → ikkinchisi partiya koeffitsienti bo'yicha avtomatik
4. **Narx (1 metr uchun):** tavsiya narx ko'rinadi
   - "Tavsiya narx" tugmasi bosilsa — shu narx qo'yiladi
   - yoki sotuvchi o'z narxini yozadi
   - jami summa avtomatik: metr × narx (do'kon POS'laridagi kabi)
5. **Savatga** → xaridor bir nechta tovar olsa, 1-4 takrorlanadi
6. **To'lov turi:** naqd / karta / nasiya (nasiya — 07-modul, mijoz tanlanadi)
7. **Yakunlash** → qoldiq kamayadi, ekran yangi sotuvga tayyor

### Ekran tuzilishi (eskiz tasdiqlangan ko'rinish)
- Bitta ustun: yuqorida tovar kiritish qatori (skaner/tovar, metr, kg, 1 metr narxi + tavsiya tugmasi, "Qo'shish")
- Ostida kiritilgan tovarlar **ro'yxat** bo'lib tushadi
- Eng pastda: jami summa, to'lov turi (naqd / karta / nasiya), "Yakunlash"
- Pastki menyu: Sotuv, Bugungi sotuvlarim, Mijozlar, Qoldiq, Ko'chirishlar, Partiyani yopish

### Savat (ro'yxat)
- Har qator: tartib raqami, SKU, partiya, metr, kg, 1 metr narxi, summa
- Qatorni tahrirlash va o'chirish (yakunlashdan oldin)
- Pastda: jami summa, to'lov turi, "Yakunlash"

### Ekranda doim
- Sotuvchi ism-familiyasi, qulf tugmasi (00-modul)
- "Bugungi sotuvlarim" — sotuvchining bugungi sotuvlari ro'yxati

## Sotuvlar ro'yxati (biznes egasi)
- Ustunlar: sana-vaqt, do'kon, sotuvchi, mijoz (nasiya bo'lsa), summa, to'lov turi, holat (yakunlangan / qisman qaytarilgan / bekor qilingan)
- Filtr: davr, do'kon, sotuvchi, to'lov turi, holat
- Qidiruv: sotuv raqami, mijoz

## Sotuv kartochkasi
- Sarlavha: sotuv raqami, sana-vaqt, do'kon, sotuvchi, mijoz
- Qatorlar: SKU, partiya, metr, kg, tavsiya narx, haqiqiy narx, jami
- To'lov: turi, boshlang'ich to'lov, qarz
- Qaytarishlar tarixi
- Amallar: Qaytarish, Bekor qilish (ruxsatga qarab)

## Narx
- Sotuvchi uchun narx doim **1 metr** uchun. SKU narxi kg da bo'lsa, partiya koeffitsienti bo'yicha metrga o'girib ko'rsatiladi.
- Narx chegarasi yo'q (javobgarlik sotuvchida).
- Har qatorda **tavsiya narx ham, haqiqiy narx ham** saqlanadi — "narx og'ishi" hisoboti uchun (08).
- Tavsiya narx yo'q bo'lsa — "Tavsiya narx yo'q", sotuvchi o'zi yozadi.

## To'lov
- Turlari: naqd, karta, nasiya. Boshqa turlar va aralash to'lov — hozircha yo'q.

## Qaytarish (sotuvchi o'zi qiladi)
1. Asl sotuv topiladi: sana, sotuvchi yoki mijoz bo'yicha qidiruv
2. Qaytariladigan qator va metr tanlanadi (sotilgandan ko'p emas, avval qaytarilganni hisobga olib)
3. Qaytariladigan summa avtomatik: metr × sotilgan narx
4. Pul qaytarish: naqd yoki karta; asl sotuv nasiya bo'lsa — mijoz qarzidan ayriladi
5. Metr **shu do'kondagi** o'sha partiya qoldig'iga qaytadi; partiya shu joyda yopilgan bo'lsa — avtomatik qayta ochiladi
- Muddat cheklovi yo'q.
- Har qaytarish biznes egasiga tizim ichidagi xabar sifatida boradi va jurnalga yoziladi.
- Asl sotuvsiz qaytarish mumkin emas.

## Sotuvni bekor qilish (xato kiritilgan)
- Sotuvchi o'z sotuvini **10 daqiqa ichida** bekor qiladi; keyin — faqat biznes egasi.
- Bekor qilinganda qoldiq va nasiya avtomatik tiklanadi.
- Sabab yozish majburiy.

## Biznes qoidalari
- Manfiy qoldiqqa tushadigan sotuvda izoh majburiy (05-ombor).
- Yopilgan partiyadan sotib bo'lmaydi.
- Sotuv qurilma bog'langan do'konga va PIN bilan kirgan sotuvchiga yoziladi.
- Barcha sotuv, qaytarish, bekor qilish jurnalga ("Sotuv").
- Internet kerak (oflayn rejim yo'q).

## Chekka holatlar
- Internet sotuv paytida uzilsa → savat qurilmada saqlanib qoladi, ulanish tiklangach qayta yuboriladi; bitta sotuv ikki marta yozilmasligi kafolatlanadi.
- Skaner kodi topilmasa → "Partiya topilmadi", qo'lda tanlashga o'tish.
- Skaner qilingan partiya shu do'konda yo'q (boshqa joyda) → "Bu partiya shu do'konda yo'q".
- Avto-qulflash savat to'la paytda → savat saqlanadi, faqat shu sotuvchi PIN'i bilan davom etadi.
- Koeffitsient yo'q partiyada kg kiritilsa → "Bu partiya uchun kg ↔ metr belgilanmagan, metrda kiriting".

## AI xulosasi

✅ Qilsa bo'ladi
- Do'kon POS'lariga o'xshash oqim — sotuvchilar uchun tanish.
- Skaner + tavsiya narx tugmasi bilan bitta tovarni ~4 bosishda sotish mumkin.
- Tavsiya va haqiqiy narxni birga saqlash — qo'shimcha ishsiz kuchli tahlil.

⚠️ Qiyin yoki xavfli
- Qaytarishni sotuvchi o'zi, muddatsiz va pul bilan qiladi — soxta qaytarish orqali kassadan pul olish mumkin. Asl sotuvga bog'lanish va miqdor chegarasi buni qisman to'sadi.
- Internet uzilishida bir sotuvning ikki marta yozilishi — kodda maxsus himoya (har sotuvga noyob identifikator) kerak.
- Qo'lda tanlashda noto'g'ri partiya kamomadni buzadi — skanerdan foydalanishni rag'batlantirish kerak.

💡 Takliflar
- Har qaytarish biznes egasiga tizim ichidagi xabarlarda (09) va jurnalda ko'rinadi — Telegram orqali emas (biznes egasi qarori).
