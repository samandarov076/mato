# Loyiha tavsifi

## Rollar
| Rol | Asosiy vazifalari |
|-----|-------------------|
| Platforma egasi | Bizneslarni qo'shadi/bloklaydi; keyinchalik obunalar |
| Biznes egasi | Barcha rollar huquqlari + do'kon, sklad, xodimlar, narxlar, hisobotlar |
| Omborchi | Partiyalarni kiritadi, etiketka chop etadi, ko'chiradi |
| Sotuvchi | O'z do'konida sotadi, qaytarish, nasiya, qarz to'lovi, partiyani yopadi |

## Asosiy jarayonlar
1. **Ulanish:** platforma egasi biznesni yaratadi → biznes egasi do'kon, sklad, xodimlarni qo'shadi.
2. **Kirim:** omborchi partiyani kiritadi (mato-, rang-, gul-kodi, rulonlar soni, jami metr va kg, tannarx, tavsiya narx, sklad) → etiketka chop etiladi.
3. **Ko'chirish:** partiyaning bir qismi (rulonlarda) joydan joyga o'tkaziladi.
4. **Sotuv:** skaner → kg yoki metr → narx → to'lov (naqd / karta / nasiya).
5. **Qaytarish:** mijoz tovarni qaytaradi → qoldiqqa qaytadi, pul yoki qarz tuzatiladi.
6. **Nasiya to'lovi:** to'liq yoki qisman.
7. **Partiyani yopish:** sotuvchi o'z joyida yopadi → shu joydagi kamomad hisoblanadi.
8. **Bildirishnomalar:** kam qoldiq, 30 kundan oshgan nasiya → biznes egasiga (tizim + Telegram).
9. **Hisobotlar:** biznes egasi davr bo'yicha ko'radi.

## Modullar
| # | Modul | Asosiy vazifasi | Kim ishlatadi |
|---|-------|-----------------|---------------|
| 00 | umumiy | Kirish, rollar va ruxsatlar, biznes sozlamalari | Hamma |
| 01 | platforma-admin | Bizneslarni qo'shish, bloklash | Platforma egasi |
| 02 | tuzilma | Do'konlar, skladlar, xodimlar, joylarga biriktirish | Biznes egasi |
| 03 | katalog | Mato/rang/gul kodlari, SKU, tavsiya narx, kam qoldiq chegarasi | Biznes egasi, Omborchi |
| 04 | kirim | Partiya kiritish, etiketka chop etish | Omborchi |
| 05 | ombor | Joylar bo'yicha qoldiq, ko'chirish, partiyani yopish, kamomadlar | Omborchi, Sotuvchi |
| 06 | sotuv | Sotuv ekrani, to'lov turlari, qaytarish | Sotuvchi |
| 07 | nasiya | Mijozlar, qarzlar, qisman to'lovlar, 30+ kun | Sotuvchi, Biznes egasi |
| 08 | hisobotlar | Savdo, foyda, tushum, soatlik trend, qoldiq, kamomad, narx og'ishi | Biznes egasi |
| 09 | bildirishnomalar | Tizim ichidagi xabarlar (kam qoldiq, nasiya, qaytarish, ko'chirish va h.k.) | Egalar, qabul qiluvchilar |
| 10 | telegram | Telegram bot: darhol xabarlar, kunlik xulosa, zaxira ogohlantirishi — **eng oxirida quriladi** | Egalar, platforma egasi |

## 1-versiyaga kiradi
Yuqoridagi barcha modullar (01-platforma-admin minimal ko'rinishda).

## Keyinroq (1-versiyaga kirmaydi)
- Obuna to'lovlari
- Kassa / smena yopish
- Chek chop etish, fiskal kassa
- Oflayn rejim
- Valyuta (dollar)
- Mijozlar uchun ilova

## Integratsiyalar
- Telegram bot — bildirishnomalar (1-versiya, eng oxirgi modul)
- Telefon kamerasi orqali shtrix-kod skanerlash (1-versiya)
- Etiketka printeri — brauzer orqali chop etish (1-versiya)

## Texnologiya steki
Keyinroq aniqlanadi (eng kechi — 4-bosqichning papka skeletidan oldin).

## Biznesdan aniqlanadigan savollar
- Bitta partiya bir vaqtda bir nechta joyda bo'ladimi? (Hozircha: ha deb loyihalanadi — qoldiq va yopish har joy bo'yicha.)

## AI xulosasi

✅ Qilsa bo'ladi
- Modullar jarayonlardan to'g'ridan-to'g'ri kelib chiqadi, bog'liqlik tartibi to'g'ri.
- Telegram bot, kamera skaner va brauzer orqali chop etish — qo'shimcha xarajatsiz standart yechimlar.

⚠️ Qiyin yoki xavfli
- Hajm: 10 modul yakka dasturchi uchun katta. Eng og'iri 05-ombor va 06-sotuv.
- Telegram bot: har biznesga alohida bot emas, bitta platforma boti — egasi o'z akkauntini bir martalik kod bilan bog'laydi.
- Etiketka printeri: termal printerlar o'lchami har xil — pilotning printerida erta sinash kerak.
- Kamera skaner: yorug'lik kam joyda va ba'zi telefonlarda sekin — qo'lda kod kiritish varianti doim bo'lishi kerak.
- Stek kechiksa, 4-bosqichdagi kod tuzilmasi aniq bo'lmaydi.

💡 Takliflar
- 01-platforma-admin 1-versiyada minimal: bizneslar ro'yxati, qo'shish, bloklash.
- Pilotga chiqish uchun eng kichik to'plam: 00, 02, 03, 04, 05, 06, 07. 08 va 09 ni pilot ishlay boshlagach qo'shish mumkin.
