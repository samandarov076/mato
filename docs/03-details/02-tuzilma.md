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

### Do'kon logini (do'kon kartochkasida)
- Login: 3–32 belgi (lotin harf, raqam, nuqta, chiziqcha), butun tizimda takrorlanmaydi, katta-kichik harf farqsiz
- Parol: kamida 6 belgi; loginni o'zgartirganda bo'sh qolsa — eskisi qoladi
- Amallar: login berish / o'zgartirish, parolni ko'rish (jurnalga yoziladi), loginni o'chirish (tasdiq bilan)
- Login o'chirilsa yoki parol almashsa, avval ochilgan planshetlar ishlayveradi — kerak bo'lsa "Qurilmalar"da uziladi
- Faqat biznes egasi boshqaradi

### Do'kon qurilmalari
- Har do'kon bo'yicha bog'langan qurilmalar, bog'langan sana, oxirgi faollik (do'kon logini bilan ochilganlari ham — nomi "login · sana")
- Qurilmani uzish

## Biznes qoidalari
- Sotuvchining do'konlarini biznes egasi belgilaydi: barcha do'konlar yoki tanlanganlari. Sotuvchi faqat shu do'konlar qurilmalarida kira oladi; sotuv qurilma bog'langan do'konga yoziladi.
- Do'kon qurilmasida kirish faqat PIN bilan (ism tanlanmaydi). PIN'ni faqat biznes egasi o'rnatadi va o'zgartiradi; band bo'lsa, boshqasini qo'yadi.
- PIN'ni tanlab topishdan himoya: bitta qurilmada 5 ta xato → 5 daqiqa; bitta do'konning barcha qurilmalari bo'yicha 15 daqiqada 20 ta xato → do'kon bloklanadi (do'kon logini bilan yangi qurilma ochib, PIN sinashni to'xtatadi).
- **Do'kon bloki takrorlansa muddat o'sadi (2026-10-03, audit):** birinchi blok — 15 daqiqa; oldingi blokdan 24 soat o'tmay ikkinchisi — 1 soat; uchinchi va keyingilari — 24 soat. Oxirgi blokdan keyin 24 soat tinch o'tsa, hisob qaytadan (15 daqiqadan) boshlanadi. To'g'ri PIN bilan kirish do'kon hisobini nolga tushirmaydi (o'z PIN'ini bilgan odam hisobni tozalab, sinashda davom eta olmasin). Har do'kon bloki jurnalga yoziladi va egalarga tizim xabari boradi ("«Chorsu» do'konida PIN ko'p marta xato kiritildi"). Natija: 10 000 ta kombinatsiyadan birinchi sutkada ko'pi bilan 60 ta, keyin sutkasiga 20 ta sinab ko'rish mumkin (avval — ~1900 ta).
- Omborchining skladlarini biznes egasi belgilaydi: barcha skladlar yoki tanlanganlari. Omborchi faqat shu skladlarni ko'radi va ular bilan ishlaydi.
- Do'kon, sklad va xodim o'chirilmaydi — faqat faolsizlantiriladi.
- Qoldig'i bor do'kon yoki skladni faolsizlantirib bo'lmaydi — avval tovar ko'chiriladi.
- Do'kon faolsizlantirilsa, unga bog'langan qurilmalar uziladi.
- Barcha o'zgarishlar jurnalga ("Xodimlar va sozlamalar" kategoriyasi).

## Chekka holatlar
- Sotuvchi faolsizlantirilsa → barcha qurilmalarda darhol chiqariladi.
- **Ega planshetda parol bilan kirsa (2026-10-04):** qurilma o'z biznesining do'koniga bog'langan bo'lsa, eganing sessiyasi
  sotuvchinikidek bo'ladi — qurilmaga bog'lanadi, avto-qulflanadi (sozlamadagi daqiqa; qulf = chiqish → PIN ekrani),
  qurilma uzilsa darhol tugaydi; 30 kunlik shaxsiy sessiya ochilmaydi. Eganing "Yangi sotuv"ida qurilma do'koni
  oldindan tanlangan turadi (o'zgartirish mumkin). Qurilma **boshqa** biznesniki bo'lsa — ega uchun bu oddiy
  brauzer: shaxsiy sessiya, avto-qulf yo'q.
  "Bu qurilma bog'langan" eslatmasi (sariq banner) **hech kimga ko'rsatilmaydi** (2026-10-05, biznes qarori):
  PIN ekraniga qaytish — "Chiqish" tugmasi yoki avto-qulf; qurilmani uzish — Tuzilma → Qurilmalar.
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
