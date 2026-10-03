# 04 — Kirim: detallar

Yangi tovarni skladga qabul qilish, partiya yaratish, etiketka chop etish.

## Asosiy tushunchalar
- **Kirim hujjati** — bitta kelgan yuk: sana, sklad, izoh + bir yoki bir nechta qator.
- **Qator = partiya** — bitta SKU (mato + rang + gul) ning shu yukdagi miqdori.
- Bitta kirimda bitta yoki bir nechta partiya bo'lishi mumkin (biznesdan aniqlanadi; tizim ikkalasini ham qo'llaydi).
- Kirim **faqat skladga** qilinadi; do'konga tovar faqat ko'chirish orqali boradi (05-ombor).

## Sahifalar

### Kirimlar ro'yxati
- Ustunlar: sana, sklad, partiyalar soni, jami metr, jami summa*, kim kiritdi
- Filtr: davr, sklad, kim kiritdi
- (*) summa faqat tannarxni ko'ra oladiganlarga

### Kirim yaratish
Hujjat qismi:
| Maydon | Majburiy | Izoh |
|--------|----------|------|
| Sklad | ha | omborchiga biriktirilgan skladlardan |
| Sana | ha | avtomatik bugun |
| Izoh | yo'q | — |

Qator (partiya) qismi:
| Maydon | Majburiy | Tekshiruv / izoh |
|--------|----------|------------------|
| Mato | ha | katalogdan |
| Rang | ha | katalogdan |
| Gul | ha | katalogdan ("gulsiz" varianti bor) |
| Rulonlar soni | ha | butun son ≥ 1 |
| Jami metr (etiketka bo'yicha) | ha | > 0 |
| Jami kg | yo'q | > 0 |
| Koeffitsient (1 kg = X m) | — | matodan avtomatik; metr va kg ikkalasi kiritilsa — metr ÷ kg |
| Tannarx (1 metr uchun, so'm) | ha | ≥ 0; jami summa = metr × tannarx avtomatik |
| Tavsiya narx | — | SKU'ning hozirgi narxi ko'rinadi, shu yerda o'zgartirish mumkin |

- SKU mavjud bo'lmasa — avtomatik yaratiladi (03-katalog).
- "Qator qo'shish" tugmasi bilan bir nechta partiya.
- Saqlashdan oldin jami ko'rinish: partiyalar soni, jami metr, jami summa.

### Kirim kartochkasi
- Hujjat ma'lumotlari va qatorlar
- Har qator uchun: partiya raqami, SKU, rulon, metr, kg, koeffitsient, tannarx
- Etiketka chop etish: bitta qator yoki hammasi; nusxalar soni tanlanadi

## Etiketka
- Tarkibi: shtrix-kod (partiya raqami), sana, mato-kodi, rang-kodi, gul-kodi
- Partiya raqami avtomatik va biznes ichida noyob (masalan P-000123)
- Istalgan payt qayta chop etish mumkin (kirimda, ko'chirishda, yo'qolganda)
- Chop etish brauzer orqali; o'lcham pilotning printeriga moslanadi

## Biznes qoidalari
- Partiyaning "yozilgan metri" = kirimdagi jami metr. Kamomad shu raqamga nisbatan hisoblanadi (05-ombor).
- Tannarx 1 metr uchun so'mda. Qo'shimcha xarajatlar (yo'l kira va h.k.) hozircha hisobga olinmaydi.
- Yetkazib beruvchi yozilmaydi.
- **Tuzatish:** partiyadan hali hech narsa sotilmagan yoki ko'chirilmagan bo'lsa — kiritgan omborchi yoki biznes egasi tahrirlaydi. Harakat bo'lgan bo'lsa — faqat biznes egasi tuzatadi. Har ikki holat jurnalga ("Ombor").
- Kirim o'chirilmaydi; harakatsiz kirimni biznes egasi bekor qila oladi (jurnalga).
- **Takrorlanishdan himoya (2026-10-03, audit):** kirim formasi har yangi kirimga noyob identifikator (`client_uuid`) yuboradi. Javob yo'qolib "Saqlash" qayta bosilsa, kirim ikki marta yozilmaydi (qoldiq ikki barobar kirmaydi) — server avvalgi kirimni qaytaradi. Shu identifikator bilan boshqa mazmun kelsa — 409 "avval boshqa mazmunda saqlangan".

## Chekka holatlar
- Hisoblangan koeffitsient matodagi standartdan 20% dan ko'p farq qilsa → "Metr yoki kg xato kiritilmaganmi?" ogohlantirishi (taqiqlanmaydi).
- Tannarx tavsiya narxdan yuqori bo'lsa → ogohlantirish.
- Bir kirimda bir xil SKU ikki marta → ogohlantirish, birlashtirish taklif qilinadi.
- Etiketka yo'qolsa → kirim yoki partiya kartochkasidan qayta chop etiladi.

## Ochiq savollar
- Bitta kirimda bir nechta partiya bo'ladimi → biznesdan-savollar.md
- (hal qilindi) Omborchi tannarxni kiritadi va faqat kirim sahifalarida ko'radi; foyda va hisobotlar unga yopiq.

## AI xulosasi

✅ Qilsa bo'ladi
- Hujjat + qatorlar — sinalgan usul; bitta va ko'p partiyali kirimni bir xil qo'llaydi.
- Shtrix-kod (Code128) va brauzer orqali chop etish standart.

⚠️ Qiyin yoki xavfli
- Kirimdagi xato (masalan 5000 o'rniga 500 metr) kamomad va foyda hisobini buzadi — koeffitsient tekshiruvi ogohlantirishi buni qisman ushlaydi.
- Omborchi tannarxni ko'radi — qabul qilindi (variant a); foyda unga yopiq.

💡 Takliflar
- Koeffitsient bo'yicha "xato kiritilmaganmi?" ogohlantirishi.
