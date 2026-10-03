# 00 — Umumiy: detallar

Tizimning poydevori: kirish, rollar, ruxsatlar, biznes sozlamalari, interfeys tili, harakatlar jurnali.

## Kirish usullari

Ikki xil kirish bor:

1. **Shaxsiy kirish** — telefon raqami + parol. Biznes egasi va omborchi o'z qurilmalarida shu usulda ishlaydi. SMS ishlatilmaydi.
2. **Do'kon qurilmasi** — har do'konda bitta umumiy qurilma. Biznes egasi uni bir marta o'z paroli bilan ochib, do'konga bog'laydi. Keyin sotuvchilar faqat 4 xonali PIN bilan kiradi; har amal shu sotuvchi nomidan yoziladi.

Sotuvchining PIN'i unga ruxsat berilgan do'konlar qurilmalarida ishlaydi (02-tuzilmada belgilanadi); sotuv qurilma bog'langan do'konga yoziladi.

## Sahifalar

### Kirish
- Maydonlar: telefon raqami, parol
- Til tanlash: O'zbekcha (lotin) / English / Русский
- Xato: "Telefon raqami yoki parol noto'g'ri" (qaysi biri xatoligi aytilmaydi)

### Qurilmani do'konga bog'lash (faqat biznes egasi)
- Do'konni tanlash → qurilma nomi (masalan "1-do'kon kassasi") → bog'lash
- Bog'langan qurilmalar ro'yxati, har birini uzish mumkin (qurilma yo'qolsa)

### PIN ekrani (do'kon qurilmasida)
- Do'kon nomi, raqamli klaviatura, 4 xonali PIN
- Kirgach ekran yuqorisida doim sotuvchining ism-familiyasi ko'rinib turadi
- Yonida qulf tugmasi — bosilsa darhol PIN ekraniga qaytadi
- Avto-qulflash: qurilmaga tegilmasa standart 30 daqiqadan keyin; vaqtni biznes egasi o'zgartiradi

### Profil
- Ism, telefon (o'zgarmaydi), til
- Parolni o'zgartirish (eski parol so'raladi)
- (PIN'ni faqat biznes egasi o'rnatadi va o'zgartiradi — 02-tuzilma)

### Biznes sozlamalari (faqat biznes egasi)
| Sozlama | Turi | Standart qiymat |
|---------|------|-----------------|
| Kg da sotish | yoqish/o'chirish | yoqilgan |
| Nasiya | yoqish/o'chirish | yoqilgan |
| Nasiya muddati | kun | 30 |
| Kam qoldiq standart chegarasi | metr | — |
| Narxni yaxlitlash | 1 / 100 / 1 000 so'm | 1 000 |
| Do'kon qurilmasini avto-qulflash | daqiqa (harakatsizlik) | 30 |

### Harakatlar jurnali (faqat biznes egasi)
- Ustunlar: vaqt, xodim, joy (do'kon/sklad), kategoriya, hodisa, eski → yangi qiymat
- Filtr: davr, xodim, joy, kategoriya
- Kategoriyalar: Kirish · Sotuv · Ombor · Narx · Nasiya · Xodimlar va sozlamalar
- Yozuvlarni hech kim tahrirlay yoki o'chira olmaydi

## Formalar va tekshiruvlar
| Maydon | Qoida |
|--------|-------|
| Telefon | +998 XX XXX XX XX formati; tizimda takrorlanmaydi |
| Parol | kamida 6 belgi |
| PIN | 4 raqam; istalgan kombinatsiya; faol sotuvchilar orasida takrorlanmaydi |

## Rollar va ruxsatlar
Qat'iy belgilangan rollar (sozlanadigan ruxsatlar — keyinroq).

Biznesda bir nechta ega bo'lishi mumkin:
- **Asosiy ega** — bitta; platforma egasi biznesni yaratganda belgilaydi; faqat platforma egasi orqali almashtiriladi.
- **Sherik-ega** — asosiy ega qo'shadi; barcha ishlarda asosiy ega bilan teng, faqat boshqa egalarni boshqara olmaydi.

| Amal | Biznes egasi | Omborchi | Sotuvchi |
|------|:---:|:---:|:---:|
| Boshqa egalarni qo'shish/faolsizlantirish | ✅ faqat asosiy ega | — | — |
| Do'kon, sklad, xodim qo'shish | ✅ | — | — |
| Katalog va tavsiya narxlar | ✅ | ✅ | — |
| Partiya kiritish, etiketka | ✅ | ✅ | — |
| Ko'chirish | ✅ | ✅ | — |
| Sotuv, qaytarish | ✅ | — | ✅ o'z do'konida |
| Nasiya berish, qarz to'lovini olish | ✅ | — | ✅ |
| Partiyani yopish | ✅ | ✅ | ✅ o'z joyida |
| Tannarxni kiritish va kirimda ko'rish | ✅ | ✅ | — |
| Foyda, hisobotlardagi tannarx | ✅ | — | — |
| Hisobotlar, jurnal, sozlamalar | ✅ | — | — |

Platforma egasi biznes ichidagi ma'lumotlarga kirmaydi — faqat bizneslarni boshqaradi (01-modul).

## Biznes qoidalari
- Tannarx sotuvchiga, foyda sotuvchi va omborchiga **server tomonida** yashiriladi (faqat interfeysda emas). Omborchi tannarxni faqat kirim sahifalarida ko'radi.
- Xodim o'chirilmaydi, faqat faolsizlantiriladi — tarixdagi sotuvlari saqlanadi. Faolsizlantirilganda barcha sessiyalari tugaydi.
- Biznes bloklansa, uning barcha xodimlari tizimdan chiqariladi.
- Interfeys 3 tilda; xodimlar kiritgan ma'lumotlar (tovar nomlari va h.k.) tarjima qilinmaydi.
- Jurnalda hodisa matn emas, kod sifatida saqlanadi — har kim uni o'z tilida ko'radi.

## Chekka holatlar
- PIN 5 marta xato kiritilsa → shu qurilmada 5 daqiqa bloklanadi, jurnalga yoziladi.
- Xodim parolni unutsa → biznes egasi yangilaydi. Biznes egasi unutsa → platforma egasi tiklaydi.
- **Parol va PIN'ni ko'rish (2026-10-02, biznes qarori):** biznes egasi o'zi boshqara oladigan xodimning hozirgi paroli yoki PIN'ini ko'ra oladi (Tuzilma → Xodimlar → "Parolni ko'rish" / "PIN'ni ko'rish"); platforma egasi — biznes egalarining parolini (biznes kartochkasi). Asosiy eganing parolini biznes ichida hech kim ko'rmaydi; platforma egasining o'z paroli hech kimga ko'rsatilmaydi. Har ko'rish jurnalga yoziladi (`user.secret_viewed`, `password.viewed_by_platform`). Buning uchun parol va PIN xeshdan tashqari shifrlangan holda ham saqlanadi (kalit — `CREDENTIALS_KEY`); bu imkoniyatdan oldin o'rnatilgan parol xodim keyingi safar kirganda saqlanadi.
- Do'kon qurilmasi yo'qolsa → biznes egasi uni uzadi, qurilma darhol ishlamay qoladi.
- Bitta xodim bir vaqtda bir nechta qurilmada — ruxsat etiladi.

## Ochiq savollar
- (yopildi — 02-tuzilmada hal qilindi)

## AI xulosasi

✅ Qilsa bo'ladi
- Umumiy qurilma + shaxsiy PIN — savdo nuqtalarida sinalgan standart usul.
- 3 til va kategoriyali jurnal 1-modulda qo'yilsa, keyingi modullar ularni tayyor ishlatadi.

⚠️ Qiyin yoki xavfli
- PIN boshqa sotuvchiga ma'lum bo'lsa, jurnal noto'g'ri odamni ko'rsatadi. Sotuvchi so'rasa, biznes egasi PIN'ni darhol almashtiradi.
- 3 til: barcha matnlar birinchi kundan tarjima fayllari orqali; sana va son formatlari ham tilga mos.

💡 Takliflar
- Avto-qulflash vaqti sozlanadi (standart 30 daqiqa) + qo'lda qulflash tugmasi — qabul qilindi.
