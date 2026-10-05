# 07 — Nasiya: detallar

Mijozlar, nasiya sotuvlar, qarz to'lovlari, qarzni hisobdan chiqarish.

## Asosiy tushunchalar
- **Mijoz** biznes bo'yicha umumiy — istalgan do'konda nasiya oladi va istalgan do'konda to'laydi.
- **Qarz** har nasiya sotuvdan alohida paydo bo'ladi; mijozning umumiy qarzi — ularning yig'indisi.
- **Muddat** sotuv sanasidan hisoblanadi; chegarasi biznes sozlamasida (standart 30 kun).

## Sahifalar

### Mijozlar ro'yxati
- Ustunlar: ism, telefon, umumiy qarz, eng eski qarz necha kunlik, oxirgi to'lov sanasi
- Qidiruv: ism, telefon
- Filtr: "qarzdorlar", "muddati o'tganlar" (30+ kun)
- Saralash: qarz summasi, eng eski qarz

### Mijoz qo'shish / tahrirlash
| Maydon | Majburiy | Tekshiruv |
|--------|----------|-----------|
| Ism | ha | 2-100 belgi |
| Telefon | ha | +998 formati, biznes ichida noyob |
| Izoh | yo'q | masalan "tikuv sexi, Chorsu" |

Sotuv ekranidan to'g'ridan-to'g'ri tezkor qo'shish mumkin (ism + telefon).

### Mijoz kartochkasi
- Umumiy qarz, muddati o'tgan qarz
- Nasiya sotuvlar: sana, do'kon, sotuvchi, summa, boshlang'ich to'lov, qolgan qarz, necha kunlik
- To'lovlar tarixi: sana, summa, turi, kim qabul qildi, qaysi qarzlarga yozildi
- Hisobdan chiqarishlar: sana, summa, sabab, kim

- **To'lovlar va hisobdan chiqarishlar tarixi sahifalanadi (2026-10-04):** kartochkada oxirgi 20 tadan ko'rinadi, qolgani "Yana ko'rsatish" bilan (avval to'lovlar 200 tada jimgina qirqilardi, hisobdan chiqarishlarda chegara yo'q edi). API: `GET /api/customers/{id}/payments?limit=&offset=` va `GET /api/customers/{id}/writeoffs?limit=&offset=` → `{items, total}`; kartochka javobida birinchi sahifa va `payments_total`, `writeoffs_total`.

### Nasiya sotuv (06-sotuv ekranida "Nasiya" tanlanganda)
1. Mijoz telefon yoki ism bo'yicha topiladi yoki yangi qo'shiladi
2. Ekranda mijozning hozirgi qarzi ko'rinadi
3. **Boshlang'ich to'lov** (ixtiyoriy): summa + naqd/karta
4. Qarzga yoziladi: jami − boshlang'ich to'lov

### Qarz to'lovini qabul qilish (sotuvchi, biznes egasi)
| Maydon | Majburiy | Tekshiruv |
|--------|----------|-----------|
| Mijoz | ha | — |
| Summa | ha | > 0, umumiy qarzdan oshmaydi |
| Turi | ha | naqd / karta |
| Qaysi qarzga | — | avtomatik eng eskisiga; sotuvchi aniq sotuvni tanlay oladi |

### Qarzni hisobdan chiqarish (sotuvchi, biznes egasi)
- Summa (to'liq yoki qisman), **sabab majburiy**
- Har hisobdan chiqarish biznes egasiga tizim ichidagi xabar sifatida boradi (09) va jurnalga yoziladi

## Biznes qoidalari
- Qarz limiti yo'q.
- To'lov avtomatik eng eski qarzdan boshlab yopadi.
- Nasiya sotuvni qaytarishda qaytarilgan summa mijoz qarzidan ayriladi (06).
- Nasiya sotuv bekor qilinsa (06) — qarz va boshlang'ich to'lov tiklanadi.
- Mijoz o'chirilmaydi. Qarzi bo'lgan mijoz faolsizlantirilmaydi.
- Sotuvchi mijoz qarzini ko'radi (nasiya berish uchun kerak).
- Biznes sozlamasida nasiya o'chirilgan bo'lsa (00) — bu modul ko'rinmaydi.
- Barcha amallar jurnalga ("Nasiya").
- **Takrorlanishdan himoya (2026-10-03, audit):** to'lov formasi har to'lovga noyob identifikator (`client_uuid`) yuboradi. Javob yo'qolib tugma qayta bosilsa, to'lov ikki marta yozilmaydi — server avvalgi to'lovni qaytaradi. Shu identifikator bilan boshqa summa, to'lov turi yoki mijoz kelsa — 409.

## Muddat taqsimoti (2026-10-04)
Qarz qancha kechikkaniga qarab besh ko'rsatkichga bo'linadi — "Jami qarz" va "Muddati o'tgan" ikki katta karta o'rniga bitta ixcham qator:

| Ko'rsatkich | Qoida (kun = bugun − qarz muddati `due_date`, biznes vaqt mintaqasida) |
|---|---|
| **Jami** | barcha yopilmagan qarzlarning qolgani |
| **Muddati kelmagan** | muddat bugun yoki keyin (kun ≤ 0) |
| **1–30 kun** | muddatidan 1–30 kun o'tgan (30-kun shu yerda) |
| **31–60 kun** | 31–60 kun o'tgan (31-kun va 60-kun shu yerda) |
| **60+ kun** | 61 kun va undan ko'p — qizil rangda |

- Summa qarzning **qolgani** bo'yicha (to'langan, qaytarilgan, hisobdan chiqarilgani ayirilgan); bekor qilingan sotuv qarzi kirmaydi.
- Qayerda: Nasiya sahifasi (beshta kartochka: Jami — katta son va ostida oraliqlar ulushi bitta chiziqda; har oraliq — summa, ulush chizig'i va foizi + mijozlar ro'yxati filtri: Barchasi · Qarzdorlar · Muddati o'tganlar; oraliq (Muddati kelmagan · 1–30 · 31–60 · 60+ kun) paneldagi ko'rsatkich bosilganda tanlanadi — mijozning shu oraliqda qarzi bo'lsa chiqadi, yana bosilsa filtr olinadi; "Jami" — Qarzdorlar; Nasiya hisobotida ko'rsatkich Nasiya sahifasini shu filtr bilan ochadi), bosh sahifadagi nasiya kartasi (qisqa), Nasiya hisoboti (do'kon filtri bilan).
- Bitta yig'ma so'rov bilan hisoblanadi. API: `GET /api/customers` javobida `aging`, `only=not_due|d1_30|d31_60|d60_plus`; `GET /api/reports/dashboard` da `debt_aging`; `GET /api/reports/credit` da `aging`.

## Ruxsatlar
| Amal | Biznes egasi | Omborchi | Sotuvchi |
|------|:---:|:---:|:---:|
| Mijoz qo'shish/tahrirlash | ✅ | — | ✅ |
| Nasiya sotuv, to'lov qabul qilish | ✅ | — | ✅ |
| Qarzni hisobdan chiqarish | ✅ | — | ✅ |

## Chekka holatlar
- Bir xil telefon bilan ikkinchi mijoz → "Bu raqam [ism]ga tegishli", mavjudi taklif qilinadi.
- To'lov qarzdan katta → ruxsat yo'q, "Qarz X so'm".
- Boshlang'ich to'lov jami summaga teng → bu nasiya emas, oddiy sotuv bo'lib yoziladi.

## AI xulosasi

✅ Qilsa bo'ladi
- Har sotuvdan alohida qarz + eng eskisidan yopish — "30 kundan oshgan" ko'rsatkichi aniq ishlaydi.
- Boshlang'ich to'lov mato savdosining haqiqiy amaliyotiga mos.

⚠️ Qiyin yoki xavfli
- Sotuvchi qarzni o'zi hisobdan chiqaradi: mijozdan naqd olib, qarzni "kechirilgan" qilib yozish orqali pulni o'zida qoldirishi mumkin. Bu tizimdagi eng katta firibgarlik imkoniyati.
- Qarz summalari so'mda katta raqamlar — kodda faqat butun sonlar yoki aniq o'nli tur (float emas).

💡 Takliflar
- Har hisobdan chiqarish biznes egasiga tizim xabari sifatida boradi — qabul qilindi.
