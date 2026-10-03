# 06 — Sotuv: detallar

Do'kon qurilmasidagi sotuv ekrani, to'lov, qaytarish, bekor qilish. Asosiy mezon — tezlik.

## Sotuv ekrani

### Oqim
1. **Tovar:** skaner — qo'l skaneri (USB/Bluetooth) yoki telefon/planshet **kamerasi** (skaner maydonidagi kamera tugmasi); qidiruv; yoki qo'lda: mato → rang → gul (rasmlar bilan, agar bo'lsa). Tanlangan tovar **katta rasm** bilan ko'rsatiladi — sotuvchi qo'lidagi mato shu ekanini tekshiradi.
   - Skaner/Enter: avval partiya raqami aniq (etiketka), keyin SKU kodi aniq (`M101-03` — gulli `M101-03-G1` emas), keyin qidiruv
   - **Moslashuvchan qidiruv:** so'zlar istalgan tartibda — "qizil atlas", "m101 gul", partiya raqami; apostrof turlari bir xil (`ko'k` = `koʻk` = `kok`)
2. **Partiya:** skanerda — aniq. Qo'lda tanlanganda shu do'konda bir nechta partiya bo'lsa — avtomatik **eng eskisi**; sotuvchi boshqasini tanlay oladi
3. **Miqdor:** metr YOKI kg kiritiladi → ikkinchisi partiya koeffitsienti bo'yicha avtomatik
4. **Narx (1 metr uchun):** biznes egasi yoki omborchi belgilagan narx (katalog / kirim) tovar tanlanishi bilan **o'zi qo'yiladi** (2026-10-03, biznes qarori) — "Tavsiya narx bo'yicha"
   - sotuvchi kerak bo'lsa o'zgartiradi; o'zgartirsa — "Tavsiya narxni qaytarish" tugmasi chiqadi, farq "Narx og'ishi" hisobotida ko'rinadi
   - partiya almashtirilsa, narx o'zgartirilmagan bo'lsa — yangi partiyaning tavsiya narxi qo'yiladi (kg narxi koeffitsientga bog'liq)
   - jami summa avtomatik: metr × narx (do'kon POS'laridagi kabi)
5. **Tez sotish (2026-10-03, biznes qarori):** savat bo'sh bo'lsa, savat ko'rinmaydi — to'lov turi va **"Sotish"** tovar formasining o'zida: bitta tovar bir bosishda sotiladi. Nasiyada "Mijozni tanlash" — qator savatga tushadi va mijoz so'raladi. Qoldiqdan ko'p bo'lsa — qator savatga tushadi va izoh so'raladi. Enter "Yana qo'shish"ni bosadi (tasodifiy Enter sotib yubormaydi).
6. **Yana qo'shish** → xaridor bir nechta tovar olsa: qator savatga tushadi, savat ochiladi, 1-4 takrorlanadi; to'lov turi va **Yakunlash** savat ostida
7. **Natija** → qoldiq kamayadi, ekran yangi sotuvga tayyor (mato tanlovi saqlanadi)

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
- Narxni faqat biznes egasi va omborchi belgilaydi (katalog, kirim); sotuv ekranida u o'zi qo'yiladi.
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
- **Natija noaniq bo'lsa savat qulflanadi (2026-10-03, audit):** savat so'rovdan oldin "yuborildi" deb belgilanadi. Javob kelmasa, vaqt tugasa yoki server 5xx qaytarsa (sotuv yozilgan bo'lishi mumkin) — savat o'zgartirilmaydi, sahifa yangilansa ham qulf turadi va o'sha savat o'sha identifikator bilan qayta yuboriladi. Identifikator faqat server aniq rad etganda (4xx) yoki sotuv tasdiqlanganda yangilanadi. Server: mavjud identifikator bilan kelgan savat saqlangan sotuvdan farq qilsa — 409 "Bu savat avval S-… raqami bilan yozilgan".
- Savat ikki oynada ochiq bo'lsa — ikkalasi bitta savatni ko'rsatadi (biri yuborsa, ikkinchisi ham qulflanadi). Boshqa sotuvchi PIN bilan kirsa, oldingi sotuvchining tasdiqlanmagan sotuvi ekranda eslatma bo'lib ko'rinadi; u o'sha sotuvchi kirgach qayta yuboriladi (sotuv o'z egasining nomiga yoziladi).
- Skaner kodi topilmasa → "Partiya yoki tovar topilmadi", qo'lda tanlashga o'tish.
- **Doimiy kamera skaneri** (ixtiyoriy, qurilmada yoqiladi): sotuv ekranida kamera yoqiq turadi — etiketka ko'rsatilsa tovar o'zi tanlanadi; bir etiketka qayta-qayta qo'shilmaydi; tovar tanlanganda pauza; boshqa oynaga o'tilsa kamera o'chadi. Kadrlar saqlanmaydi va yuborilmaydi.
- Kamera: faqat xavfsiz ulanishda (https) ishlaydi; ruxsat berilmasa yoki kamera yo'q bo'lsa — tushunarli xabar, qo'l skaneri / qidiruv ishlayveradi.
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
