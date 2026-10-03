# 02 — Tuzilma: detallar

Biznes egasi o'z biznesining tuzilmasini kiritadi: do'konlar, skladlar, xodimlar, do'kon qurilmalari.

## Sahifalar

Do'konlar va skladlar interfeysda **alohida bo'limlar**.

### Do'konlar ro'yxati
- Ustunlar: nomi, manzil, telefon, qurilmalar soni, holat
- Do'konda ham tovar qoldig'i bo'ladi (sotilganda kamayadi)

### Do'kon qo'shish / tahrirlash
| Maydon | Majburiy | Tekshiruv |
|--------|----------|-----------|
| Nomi | ha | 2-100 belgi, biznes ichida takrorlanmaydi |
| Manzil | yo'q | — |
| Telefon | yo'q | +998 formati |

### Skladlar ro'yxati
- Ustunlar: nomi, manzil, biriktirilgan omborchilar, holat

### Sklad qo'shish / tahrirlash
| Maydon | Majburiy | Tekshiruv |
|--------|----------|-----------|
| Nomi | ha | 2-100 belgi, biznes ichida takrorlanmaydi |
| Manzil | yo'q | — |

### Xodimlar ro'yxati
- Ustunlar: ism-familiya, rol, ruxsat etilgan joylar, holat
- Filtr: rol, holat

### Xodim qo'shish / tahrirlash
| Maydon | Kimga | Majburiy | Tekshiruv |
|--------|-------|----------|-----------|
| Ism-familiya | hamma | ha | 2-100 belgi |
| Rol | hamma | ha | Sherik-ega (faqat asosiy ega qo'sha oladi) / Omborchi / Sotuvchi |
| Telefon | sherik-ega, omborchi | ha | +998, tizimda takrorlanmaydi |
| Telefon | sotuvchi | yo'q (kerak emas) | — |
| Parol | sherik-ega, omborchi | ha | kamida 6 belgi |
| PIN | sotuvchi | ha | 4 raqam, istalgan kombinatsiya (1111 ham); faol sotuvchilar orasida takrorlanmaydi |
| Do'konlar | sotuvchi | ha | "Barcha do'konlar" yoki tanlanganlari |
| Skladlar | omborchi | ha | "Barcha skladlar" yoki tanlanganlari |

### Do'kon qurilmalari
- Har do'kon bo'yicha bog'langan qurilmalar, bog'langan sana, oxirgi faollik
- Qurilmani uzish

## Biznes qoidalari
- Sotuvchining do'konlarini biznes egasi belgilaydi: barcha do'konlar yoki tanlanganlari. Sotuvchi faqat shu do'konlar qurilmalarida kira oladi; sotuv qurilma bog'langan do'konga yoziladi.
- Do'kon qurilmasida kirish faqat PIN bilan (ism tanlanmaydi). PIN'ni faqat biznes egasi o'rnatadi va o'zgartiradi; band bo'lsa, boshqasini qo'yadi.
- Omborchining skladlarini biznes egasi belgilaydi: barcha skladlar yoki tanlanganlari. Omborchi faqat shu skladlarni ko'radi va ular bilan ishlaydi.
- Do'kon, sklad va xodim o'chirilmaydi — faqat faolsizlantiriladi.
- Qoldig'i bor do'kon yoki skladni faolsizlantirib bo'lmaydi — avval tovar ko'chiriladi.
- Do'kon faolsizlantirilsa, unga bog'langan qurilmalar uziladi.
- Barcha o'zgarishlar jurnalga ("Xodimlar va sozlamalar" kategoriyasi).

## Chekka holatlar
- Sotuvchi faolsizlantirilsa → barcha qurilmalarda darhol chiqariladi.
- Omborchidan sklad olib qo'yilsa → o'sha sklad unga darhol ko'rinmay qoladi.
- Biznes egasi o'zini faolsizlantira olmaydi. Asosiy egani hech kim faolsizlantira olmaydi (faqat platforma egasi almashtiradi).

## Ochiq savollar
- (yo'q)

## AI xulosasi

✅ Qilsa bo'ladi
- Oddiy CRUD sahifalar; "barcha skladlar / tanlanganlari" — bitta belgi va ro'yxat.

⚠️ Qiyin yoki xavfli
- Faqat PIN bilan kirishda PIN noyob bo'lishi kerak; "bu PIN band" xabari boshqa sotuvchining PIN'ini oshkor qiladi va uning nomidan kirishga imkon beradi.
- Do'kon va sklad interfeysda alohida; qoldiq va ko'chirish ikkalasida bir xil ishlashi uchun bazada ular umumiy asosga ega bo'lishi mumkin — bu 5.1 da hal qilinadi, foydalanuvchiga ta'sir qilmaydi.

💡 Takliflar
- Ism tanlash + PIN varianti taklif qilindi; biznes egasi faqat PIN usulini tanladi (qaror PROGRESS.md da).
- PIN'ni faqat biznes egasi o'rnatsa, "PIN band" xabarini faqat u ko'radi va oshkor bo'lish xavfi yo'qoladi.
- Ega xodimning hozirgi parolini yoki PIN'ini ko'ra oladi ("Parolni ko'rish" / "PIN'ni ko'rish"): kimni boshqara olsa, o'shanikini (sherik-egalarnikini — faqat asosiy ega; asosiy eganikini — hech kim). Ro'yxatda ko'rinmaydi — faqat tugma bosilganda; har ko'rish jurnalga yoziladi (00-umumiy).
