# 08 — Hisobotlar: detallar

Biznes egasi uchun hisobotlar. Faqat biznes egalari ko'radi.

## Atamalar
| Ko'rsatkich | Hisoblanishi |
|-------------|--------------|
| **Savdo** | Sotuvlar summasi − qaytarishlar |
| **Tushum** | Kassaga tushgan pul: naqd/karta sotuvlar + boshlang'ich to'lovlar + qarz to'lovlari − qaytarilgan pul. Naqd va karta alohida |
| **Foyda** | Savdo − sotilgan tovar tannarxi (sotilgan metr × partiyaning 1 metr tannarxi) |

- Kamomadlar va hisobdan chiqarilgan qarzlar foydaga qo'shilmaydi — o'z hisobotlarida alohida ko'rinadi.
- Qaytarish **qaytarilgan kunning** savdosidan ayriladi (sotilgan kunnikidan emas).
- Kun chegarasi — Toshkent vaqti bo'yicha (00:00–23:59).

## Umumiy filtrlar (barcha hisobotlarda)
- Davr: bugun, kecha, shu hafta, shu oy, o'tgan oy, ixtiyoriy oraliq
- Do'kon, sotuvchi, mato
- **O'tgan davr bilan taqqoslash:** har ko'rsatkich yonida o'tgan shunday davrga nisbatan o'zgarish (masalan "+15%")
- **Excel'ga yuklab olish** — har hisobotda

## Hisobotlar

### Bosh sahifa (dashboard)
- Kartochkalar: bugungi savdo, tushum, foyda (o'tgan kunga nisbatan %)
- Umumiy nasiya, shundan muddati o'tgan
- Kam qoldiqdagi SKU'lar soni
- Shu oydagi kamomad (so'm)
- Kunlik savdo grafigi (oxirgi 30 kun)

### Savdo, tushum, foyda
- Jadval va grafik: kunlar (yoki oylar) kesimida savdo, tushum (naqd/karta), foyda
- Jami qator

### Soatlar bo'yicha trend
- Soatlar (8:00, 9:00, ...) bo'yicha sotuvlar soni va summasi
- Haftaning kunlari bo'yicha ko'rinish

### Eng ko'p sotilgan tovarlar
- Top 10 / 20: mato, rang, gul yoki SKU bo'yicha
- Ko'rsatkich tanlanadi: metr, savdo summasi yoki foyda

### Qoldiq
- Joylar bo'yicha: metr, taxminiy rulon, tannarx bo'yicha qiymat (so'm)
- Kam qoldiqdagi SKU'lar

### Nasiyalar
- Umumiy qarz, muddati o'tgan qarz
- Mijozlar bo'yicha: qarz, eng eski qarz kuni, oxirgi to'lov
- Davr bo'yicha: berilgan nasiya, qaytgan qarz, hisobdan chiqarilgan

### Kamomadlar
- 05-ombor hujjatidagi hisobot (partiya, joy, farq m/%/so'm, kim yopdi) + ko'chirish farqlari

### Narx og'ishi
- Sotuvlarda tavsiya narx va haqiqiy narx farqi: SKU va sotuvchi bo'yicha, so'm va %

## Keyinroq
- Sotuvchilar kesimidagi alohida savdo hisoboti (filtr orqali hozir ham ko'rish mumkin)

## AI xulosasi

✅ Qilsa bo'ladi
- Barcha hisobotlar oldingi modullarda yig'ilgan ma'lumotdan chiqadi — yangi ma'lumot kiritish kerak emas.
- Excel eksport va taqqoslash standart.

⚠️ Qiyin yoki xavfli
- "Foyda" faqat savdo − tannarx. Kamomad va kechirilgan qarzlar kirmaydi — biznes egasi buni sof foyda deb o'ylamasligi uchun yonida aniq yozilishi va dashboardda kamomad alohida ko'rinishi kerak.
- Foyda kirimdagi tannarx to'g'riligiga bog'liq.
- Ma'lumot ko'paygani sari (oylar, ko'p biznes) hisobotlar sekinlashadi — bazada indekslar va kunlik yig'ma jadvallar kerak bo'ladi.
- Vaqt zonasi: server UTC'da ishlasa, kechki 23:30 dagi sotuv ertangi kunga tushib qolishi mumkin — barcha hisoblar Toshkent vaqtida.

💡 Takliflar
- Dashboardda shu oydagi kamomad kartochkasi — qabul qilinsa, foyda bilan yonma-yon ko'rinadi.
