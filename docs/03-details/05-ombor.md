# 05 — Ombor: detallar

Joylar bo'yicha qoldiq, ko'chirish, partiyani yopish, kamomad va ortiqcha.

## Asosiy tushunchalar
- **Qoldiq** har bir (partiya, joy) juftligi bo'yicha **metrda** yuritiladi. Bu yagona aniq raqam.
- **Rulonlar soni** — taxminiy ko'rsatkich: qoldiq metr ÷ partiyaning o'rtacha rulon uzunligi (jami metr ÷ rulonlar soni).
- **Yozilgan metr** — joyga kirgan metr: kirimda (sklad uchun) yoki qabul qilingan ko'chirishda.
- **Kamomad / ortiqcha** — partiya joyda yopilganda tizimda qolgan qoldiq. Musbat = kamomad, manfiy = ortiqcha.

### Misol
```
Kirim:      Skladga 100 rulon, 5000 m
Ko'chirish: Sklad → 1-do'kon: 40 rulon ≈ 2000 m (qabul qilindi)
Sotuv:      1-do'konda 1950 m sotildi
Yopish:     sotuvchi "tugadi" → tizimda 50 m → 1-do'konda 50 m kamomad
Skladda:    60 rulon, 3000 m davom etadi
```

## Sahifalar

### Qoldiq
- Ko'rinish: SKU bo'yicha → ichida partiyalar → har joydagi metr va taxminiy rulon
- Filtr: joy, mato, rang, gul, "kam qoldiq", "manfiy qoldiq", "yo'lda"
- Sotuvchi barcha joylardagi qoldiqni ko'radi — **faqat metr va rulon**, narx va tannarxsiz
- Omborchi faqat o'ziga biriktirilgan skladlar va barcha do'konlarni ko'radi

### Partiya kartochkasi
- Sarlavha: partiya raqami, SKU, kirim sanasi, rulonlar soni, yozilgan metr, kg, koeffitsient
- Joylar bo'yicha: qoldiq metr, holat (faol / yopilgan), kamomad
- **Harakatlar tarixi:** kirim, jo'natish, qabul, har sotuv, qaytarish, yopish, qayta ochish — sana, joy, metr (+/−), xodim, hujjatga havola
- Amallar: etiketka chop etish, yopish / qayta ochish (ruxsatga qarab)

- **Tarix sahifalanadi (2026-10-04):** kartochka oxirgi 30 ta harakat bilan ochiladi, qolgani "Yana ko'rsatish" bilan (avval 200 tadan keyingisi jimgina qirqilardi). Tur filtri: Barchasi · Sotuvlar (sotuv, bekor qilish, qaytarish) · Ko'chirishlar (jo'natish, qabul, bekor qilish) · Boshqa (kirim, tuzatish, yopish, qayta ochish). API: `GET /api/batches/{id}/movements?kind=sales|transfers|other&limit=&offset=` → `{items, total}`; kartochka javobida `movements` (birinchi sahifa) va `movements_total`.

### Ko'chirish yaratish (omborchi, biznes egasi)
| Maydon | Majburiy | Izoh |
|--------|----------|------|
| Qayerdan | ha | joy |
| Qayerga | ha | boshqa joy |
| Qatorlar: partiya (skaner yoki tanlash), rulonlar soni, metr | ha | metr = rulon × o'rtacha uzunlik, qo'lda to'g'rilash mumkin |
| Izoh | yo'q | — |

- Jo'natilgach holat **"Yo'lda"**: metr jo'natuvchi joydan chiqadi, qabul qiluvchi joyga hali kirmaydi.
- Ko'chirish oynasidan etiketkani qayta chop etish mumkin.

### Ko'chirishni qabul qilish
- Kim qabul qiladi: do'konga — shu do'kon sotuvchisi; skladga — shu sklad omborchisi; biznes egasi — har qanday.
- Qabul qiluvchi har qator bo'yicha **haqiqatda kelgan** rulon va metrni tasdiqlaydi yoki o'zgartiradi.
- Farq bo'lsa → izoh majburiy; farq "ko'chirish farqi" sifatida qayd etiladi va biznes egasiga xabar boradi (09).

### Ko'chirishlar ro'yxati
- Ustunlar: sana, qayerdan → qayerga, partiyalar soni, metr, holat (yo'lda / qabul qilindi / bekor qilindi), jo'natuvchi, qabul qiluvchi
- Filtr: holat, joy, davr

- **Ko'chirish formasi (2026-10-06):** qo'shilgan partiya ro'yxatning **tepasiga** tushadi va ko'rinib turadi (avval eng pastga tushib, ko'rinmay qolardi); nomzodlar ro'yxati o'z ichida suriladi; keng ekranda nomzodlar chapda, tanlanganlar o'ngda.

### Partiyani yopish (sotuvchi — o'z do'konida; omborchi — o'z skladida; biznes egasi — har qanday)
- Partiya skaner qilinadi yoki tanlanadi → ekranda: yozilgan metr, sotilgan/chiqqan metr, tizimdagi qoldiq
- "Haqiqatda tugadimi?" → tasdiqlash
- Tizimdagi qoldiq kamomad (+) yoki ortiqcha (−) sifatida qayd etiladi, so'mda ham (farq × tannarx)

### Kamomadlar hisoboti (biznes egasi)
- Ustunlar: partiya, SKU, joy, yozilgan metr, chiqqan metr, farq (m va %), farq (so'm), kim yopdi, qachon
- Filtr: davr, joy, xodim, faqat kamomad / faqat ortiqcha
- Ko'chirish farqlari ham shu yerda alohida bo'limda
- Jami sonlar (kam chiqdi, ortiq chiqdi, ko'chirishda) filtrga mos **barcha** qatorlar bo'yicha bazada hisoblanadi; ro'yxatlar 100 tadan, "Yana ko'rsatish" bilan ochiladi. Bosh sahifadagi "Metr farqi" ham shu jamidan (2026-10-03, audit).

## Biznes qoidalari
- **Ko'chirish ikki bosqichli:** jo'natish → qabul. Qabul qilinmaguncha tovar "yo'lda".
- Yo'ldagi ko'chirishni jo'natuvchi yoki biznes egasi bekor qila oladi — metr jo'natuvchi joyga qaytadi.
- **Manfiy qoldiq:** tizimda qoldiq tugagan, lekin haqiqatda mato bor (masalan 50 m o'rniga 52 m chiqdi) — sotuvchi sotishda davom etadi, **izoh yozish majburiy**. Partiya yopilganda manfiy qoldiq "ortiqcha" bo'ladi.
- Partiya har joyda alohida yopiladi. Yopilgan joyda bu partiyani sotib bo'lmaydi.
- **Avto-yopish yo'q (2026-10-06, qayta ko'rib chiqildi):** qoldiq 0 ga tushsa ham partiya o'zi yopilmaydi — tizim 0 ko'rsatsa ham haqiqatda mato qolgan bo'lishi mumkin (ortiqcha), buni faqat odam biladi. (Shu kuni avto-yopish qo'shilib, o'sha kuni olib tashlandi.) O'rniga:
  - **"Tugagan (0 m)" bo'limi** — "Partiyani yopish" sahifasining tepasida: qoldig'i aynan 0 bo'lgan ochiq partiyalar alohida turadi va **bir bosishda** yopiladi (izoh ixtiyoriy, metr farqi 0 — tasdiq so'ralmaydi).
  - **Eslatma:** partiya biror joyda **7 kun** davomida 0 qoldiq bilan ochiq tursa (oxirgi harakatidan beri), o'sha joyning xodimlariga (va egalarga) bitta xabar boradi: "P-000123 «Chorsu»da tugagan — partiyani yoping". Har partiya-joy uchun bir marta (dedup); partiya yopilgach kalit bo'shatiladi — qayta ochilib yana tugasa, yangi xabar keladi. Shu joyga yo'lda kelayotgan ko'chirish bo'lsa eslatilmaydi. Fon ishchisi kuniga bir marta tekshiradi.
- **"Partiyani yopish" sahifasi ko'rinishi (2026-10-06):** bir nechta joyni ko'ra oladigan xodimga (ega, omborchi) — **jadval**: qator — partiya (rasm, raqam, tovar), ustunlar — u ko'ra oladigan joylar, katakda shu joydagi qoldiq va "Yopish" (ruxsati bo'lsa). Sotuvchida bitta do'kon — ro'yxat ko'rinishi, sarlavhada do'kon nomi.
- **Yopish tasdig'ida natija oldindan ko'rinadi:** "Tizimda: 15 m → Metr farqi: 15 m kam chiqdi" (manfiy qoldiqda — "ortiq chiqdi"); egaga — taxminiy summa ham (tannarx bo'yicha; sotuvchi va omborchiga summa ko'rsatilmaydi). Farq 0 bo'lsa — oddiy tasdiq.
- Partiya barcha joylarda yopilgan va yo'lda hech narsa yo'q bo'lsa — butunlay yopilgan hisoblanadi.
- **Qayta ochish:** xato yopilgan partiyani biznes egasi yoki omborchi qayta ochadi; kamomad yozuvi bekor qilinadi. Jurnalga yoziladi.
- Barcha harakatlar jurnalga ("Ombor" kategoriyasi).
- Kam qoldiq chegarasidan pastga tushganda → bildirishnoma (09).
- **Takrorlanishdan himoya (2026-10-03, audit):** ko'chirish yaratish formasi har yangi ko'chirishga noyob identifikator (`client_uuid`) yuboradi. Javob yo'qolib "Jo'natish" qayta bosilsa, ko'chirish ikki marta yozilmaydi (metr ikki marta ayrilmaydi) — server avvalgi ko'chirishni qaytaradi. Shu identifikator bilan boshqa mazmun kelsa — 409.

## Chekka holatlar
- Yopilgan joyga shu partiyadan yangi ko'chirish kelsa → partiya shu joyda avtomatik qayta ochiladi.
- Yo'ldagi tovarli partiyani yopishga urinish → "Yo'lda X m bor, avval qabul qiling".
- Qoldiq 0 dan katta, lekin sotuvchi yopmoqchi → katta kamomad haqida ogohlantirish (masalan 10% dan ko'p bo'lsa).
- Qabul qiluvchi uzoq vaqt qabul qilmasa (masalan 24 soat) → biznes egasiga eslatma.

## Keyinroq
- Inventarizatsiya (to'liq sanash) — pilotda partiyani yopish yetarlimi, sinab ko'riladi.

## AI xulosasi

✅ Qilsa bo'ladi
- Metr — yagona aniq birlik; rulon taxminiy. Hisob sodda va ishonchli.
- Ikki bosqichli ko'chirish yo'lda yo'qolgan tovarni darhol ko'rsatadi.

⚠️ Qiyin yoki xavfli
- Eng murakkab joy — bir vaqtda ko'p amal: ikki sotuvchi bitta partiyani bir paytda sotsa, qoldiq to'g'ri hisoblanishi kerak (bazada tranzaksiyalar va qulflar).
- Qoldiqni "hisoblab" emas, harakatlar tarixidan chiqarish kerak: har kirim, ko'chirish, sotuv, qaytarish, yopish alohida yozuv. Shunda har raqamni tekshirish mumkin.
- Katta kamomadni izoh bilan yashirish mumkin — kamomad hisobotida izoh va xodim doim ko'rinadi.

💡 Takliflar
- Katta kamomad (10%+) da qo'shimcha ogohlantirish.
- Qabul qilinmagan ko'chirish haqida 24 soatdan keyin eslatma.
