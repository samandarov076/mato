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

### Partiyani yopish (sotuvchi — o'z do'konida; omborchi — o'z skladida; biznes egasi — har qanday)
- Partiya skaner qilinadi yoki tanlanadi → ekranda: yozilgan metr, sotilgan/chiqqan metr, tizimdagi qoldiq
- "Haqiqatda tugadimi?" → tasdiqlash
- Tizimdagi qoldiq kamomad (+) yoki ortiqcha (−) sifatida qayd etiladi, so'mda ham (farq × tannarx)

### Kamomadlar hisoboti (biznes egasi)
- Ustunlar: partiya, SKU, joy, yozilgan metr, chiqqan metr, farq (m va %), farq (so'm), kim yopdi, qachon
- Filtr: davr, joy, xodim, faqat kamomad / faqat ortiqcha
- Ko'chirish farqlari ham shu yerda alohida bo'limda

## Biznes qoidalari
- **Ko'chirish ikki bosqichli:** jo'natish → qabul. Qabul qilinmaguncha tovar "yo'lda".
- Yo'ldagi ko'chirishni jo'natuvchi yoki biznes egasi bekor qila oladi — metr jo'natuvchi joyga qaytadi.
- **Manfiy qoldiq:** tizimda qoldiq tugagan, lekin haqiqatda mato bor (masalan 50 m o'rniga 52 m chiqdi) — sotuvchi sotishda davom etadi, **izoh yozish majburiy**. Partiya yopilganda manfiy qoldiq "ortiqcha" bo'ladi.
- Partiya har joyda alohida yopiladi. Yopilgan joyda bu partiyani sotib bo'lmaydi.
- Partiya barcha joylarda yopilgan va yo'lda hech narsa yo'q bo'lsa — butunlay yopilgan hisoblanadi.
- **Qayta ochish:** xato yopilgan partiyani biznes egasi yoki omborchi qayta ochadi; kamomad yozuvi bekor qilinadi. Jurnalga yoziladi.
- Barcha harakatlar jurnalga ("Ombor" kategoriyasi).
- Kam qoldiq chegarasidan pastga tushganda → bildirishnoma (09).

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
