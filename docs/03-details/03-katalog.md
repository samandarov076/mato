# 03 — Katalog: detallar

Matolar, ranglar, gullar, SKU va tavsiya narxlar.

## Tuzilma

```
Mato (mato-kodi)
 ├── Ranglar (rang-kodi)
 └── Gullar (gul-kodi)
        ↓
SKU = mato + rang + gul
        ↓
Partiya = SKU + sana (04-kirim)
```

## Kodlar
- Mato-, rang- va gul-kodlarini biznes o'zi yaratadi: raqam, harf, belgi — istalgan ko'rinishda.
- Har kod o'z turi ichida biznes bo'yicha noyob (ikki matoda bir xil mato-kodi bo'lmaydi).
- Gulsiz mato uchun "gulsiz" varianti bo'ladi.

## Sahifalar

### Matolar ro'yxati
- Ustunlar: mato-kodi, nomi, eni, tarkibi, SKU soni, holat
- Qidiruv: kod, nom · Filtr: holat

### Mato qo'shish / tahrirlash
| Maydon | Majburiy | Tekshiruv |
|--------|----------|-----------|
| Mato-kodi | ha | 1-30 belgi, biznes ichida noyob |
| Nomi | ha | 2-100 belgi |
| Eni (sm) | yo'q | > 0 |
| Tarkibi | yo'q | matn |
| Rasm | yo'q | rasm fayli |
| Standart koeffitsient (1 kg = X metr) | yo'q | > 0 |

### Ranglar va gullar
- Ro'yxat: kod, nom, namuna/rasm (ixtiyoriy), holat
- **SKU'ning o'z rasmi (2026-10-06, foydalanuvchi qarori):** har SKU (mato + rang + gul) ga alohida rasm qo'yiladi — "Atlas · Qizil · Lola" bir rasm, "Atlas · Oq · Lola" boshqa rasm. SKU ro'yxatida tahrirlashda yuklanadi (`skus.image_url`). Tovar rasmi tartibi hamma joyda: **SKU rasmi → gul → rang** → rang namunasi → kod harflari. **Mato rasmi tovarlarga o'tmaydi** (aks holda bir matoning barcha ranglari bir xil rasm bilan chiqadi) — u faqat mato tanlash chipida va Matolar ro'yxatida ko'rinadi.
- **Rasmni kattalashtirish:** rasm bosilsa to'liq ekranda ochiladi (Esc yoki tashqarisini bosish yopadi) — kichik rasmlarda ham: sotuvdagi tanlov chiplari va to'r, katalog ro'yxatlari, qoldiq, partiya kartochkasi. Tanlov tugmasida rasm alohida bosiladi: rasm — kattalashtiradi, yozuv — tanlaydi.
- **Bitta qatorda rasm bir marta (2026-10-06):** qator yoki plitkada faqat eng aniq rasm ko'rsatiladi (SKU → gul → rang); tarkib qismlari (mato, rang, gul) yonida rasm takrorlanmaydi.
- **Harf-belgi yo'q (2026-10-06):** rasm bo'lmasa — rang namunasi (hex); u ham bo'lmasa — neytral mato belgisi. "AT", "05" kabi kod harflari hech qayerda chiqmaydi.
- Qo'shish/tahrirlash: kod (noyob), nom, rasm
- Ro'yxat matolar uchun umumiymi yoki har matoning o'zinikimi — biznesdan aniqlanadi (biznesdan-savollar.md, 2-savol)

### SKU ro'yxati
- Ustunlar: SKU kodi (mato-rang-gul), tavsiya narx, narx birligi (kg/metr), kam qoldiq chegarasi, holat
- Filtr: mato, rang, gul, "narxi belgilanmagan"
- **Ommaviy narx:** bir nechta SKU tanlanadi (masalan bitta matoning barcha ranglari) → narx bir yo'la qo'yiladi yoki o'zgartiriladi
- Har SKU'da narxni alohida o'zgartirish mumkin

### SKU kartochkasi
- Tavsiya narx va birligi (kg yoki metr)
- Kam qoldiq chegarasi (bo'sh bo'lsa — biznes sozlamasidagi standart)
- Narx tarixi: sana, eski → yangi, kim o'zgartirdi

## Biznes qoidalari
- **Kg ↔ metr koeffitsienti** matoda bir marta belgilanadi. Kirimda partiyaga avtomatik qo'yiladi; partiyada boshqacha bo'lsa, omborchi o'sha partiya uchun o'zgartiradi.
- **SKU kirimda avtomatik yaratiladi:** omborchi partiya kiritishda mato, rang, gulni tanlaydi; bunday SKU bo'lmasa — tizim yaratadi. Oldindan barcha kombinatsiyalarni yaratish shart emas.
- **Tavsiya narx har SKU uchun bitta** (ulgurji/chakana farqlanmaydi). Narx partiyaga emas, SKU'ga bog'liq: bir marta kiritiladi va keyingi partiyalarda ham o'zgarmasdan qoladi; kerak bo'lsa biznes egasi yoki omborchi o'zgartiradi (katalogda yoki kirim paytida).
- **Narx kg yoki metrda belgilanadi**; ikkinchisi sotuv paytida avtomatik ekvivalent sifatida ko'rsatiladi. Ekvivalent sotilayotgan partiyaning kg ↔ metr koeffitsienti bo'yicha hisoblanadi.
- Narxi belgilanmagan SKU ham sotiladi — sotuvchi narxni o'zi yozadi, ekranda "tavsiya narx yo'q" ko'rinadi.
- Mato, rang, gul, SKU o'chirilmaydi — faqat faolsizlantiriladi. Faolsiz SKU yangi kirimda tanlanmaydi, lekin qoldig'i sotilaveradi.
- Nom o'zgartirilsa, eski sotuvlar tarixida o'sha paytdagi nom saqlanadi.
- Narx o'zgarishlari jurnalga ("Narx" kategoriyasi) va SKU narx tarixiga yoziladi.
- Sotuvchi tavsiya narxlarni ko'radi, tannarxni ko'rmaydi.

## Ruxsatlar
- Ko'rish va o'zgartirish: biznes egalari, omborchi
- Ko'rish (faqat sotuv ekrani orqali): sotuvchi

## Chekka holatlar
- Bir xil kod bilan ikkinchi mato kiritilsa → "Bu kod band".
- Matoda ham, partiyada ham koeffitsient yo'q → kg ↔ metr ekvivalenti ko'rsatilmaydi, sotuvchi ogohlantiriladi.

## Ochiq savollar
- Ranglar/gullar umumiymi, rasm kerakmi → biznesdan-savollar.md

## AI xulosasi

✅ Qilsa bo'ladi
- Erkin kodlar, avtomatik SKU, SKU bo'yicha bitta tavsiya narx — standart va sodda.
- Mato → SKU → partiya zanjiri hisobotlarni har darajada ko'rish imkonini beradi.

⚠️ Qiyin yoki xavfli
- Narx har SKU'da alohida: 1 mato × 15 rang × 10 gul = 150 SKU. Bittalab kiritish og'ir — ommaviy narx o'rnatish shart (qo'shildi).
- Kg narxning metr ekvivalenti partiyaga bog'liq: bitta SKU ikki partiyada turli metr narxiga ega bo'lishi mumkin. Bu to'g'ri xatti-harakat, lekin sotuvchiga tushunarli ko'rsatilishi kerak.
- Kodlar erkin bo'lgani uchun xato kiritish oson (M101 va M-101 ikki xil mato bo'lib qoladi). Kod kiritishda o'xshash kodlar ko'rsatiladi.

💡 Takliflar
- Rang va gul rasmlari sotuv ekranida tanlashni ancha tezlashtiradi.
