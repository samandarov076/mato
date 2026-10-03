# 01 — Platforma admin: detallar

Platforma egasining paneli: bizneslarni qo'shish, bloklash, kuzatish. 1-versiyada minimal.

## Kirish
- Telefon + parol + ikki bosqichli tasdiqlash (Google Authenticator kabi ilova, 6 xonali kod). 2026-10-03 dan
  ixtiyoriy: "Xavfsizlik" sahifasida yoqiladi/o'chiriladi; serverda `PLATFORM_2FA_REQUIRED=true` bo'lsa majburiy
- Ikki bosqichli tasdiqlash yoqilganda 10 ta bir martalik zaxira kod beriladi (telefon yo'qolsa kirish uchun)
- Hozircha platforma admini — faqat bitta (platforma egasi). Rollar tuzilmasi keyinchalik support xodimi qo'shishga tayyor qilib quriladi.

## Sahifalar

### Bizneslar ro'yxati
- Ustunlar: biznes nomi, egasi (ism, telefon), do'konlar soni, xodimlar soni, holat (faol / bloklangan), qo'shilgan sana, oxirgi faollik
- Qidiruv: biznes nomi, egasi telefoni
- Filtr: holat
- Saralash: qo'shilgan sana, oxirgi faollik

### Biznes qo'shish
| Maydon | Majburiy | Tekshiruv |
|--------|----------|-----------|
| Biznes nomi | ha | 2-100 belgi |
| Asosiy egasining ism-familiyasi | ha | 2-100 belgi |
| Asosiy egasining telefoni | ha | +998 formati, tizimda takrorlanmaydi |
| Vaqtinchalik parol | ha | avtomatik yaratiladi, ko'rsatiladi va nusxa olinadi |

Biznes egasi birinchi kirishda parolni o'zgartirishi shart.

### Biznes sahifasi
- Asosiy ma'lumotlar va statistika (do'konlar, xodimlar, oxirgi faollik)
- Bloklash / blokdan chiqarish — sabab majburiy
- Istalgan biznes egasining parolini tiklash (yangi vaqtinchalik parol)
- Biznes egasining hozirgi parolini ko'rish ("Parolni ko'rish") — biznesning o'z jurnaliga yoziladi, ega buni ko'radi (2026-10-02)
- Asosiy egani almashtirish (sherik-egalardan biriga) — sabab majburiy, jurnalga yoziladi
- Bloklash tarixi (kim, qachon, nima sababdan)

## Biznes qoidalari
- Bizneslarni faqat platforma egasi qo'shadi (o'zi ro'yxatdan o'tish — keyinroq, obuna bilan birga).
- Biznes **hech qachon o'chirilmaydi** — faqat bloklanadi.
- Bloklanganda: barcha xodimlar tizimdan chiqariladi va kira olmaydi; ma'lumotlar to'liq saqlanadi; blokdan chiqarilganda hammasi joyida.
- Platforma egasi biznes ichidagi ma'lumotlarga (sotuvlar, tovarlar) kirmaydi.
- Platforma admin amallari alohida jurnalga yoziladi.

## Ma'lumotlar xavfsizligi (zaxira nusxa)
- Har kuni kechasi avtomatik zaxira (do'konlar yopiq vaqtda, masalan 03:00).
- Zaxira **asosiy serverdan tashqarida** saqlanadi (boshqa provayder yoki bulutli saqlash); qo'shimcha ravishda platforma egasining lokal kompyuteriga ham nusxa olinishi mumkin.
- Zaxira shifrlanadi — unda barcha bizneslarning ma'lumotlari bor.
- Saqlash muddati: oxirgi 7 kunlik, 4 haftalik, 12 oylik nusxa.
- Zaxira muvaffaqiyatsiz bo'lsa — platforma egasiga Telegram orqali xabar (10-modul qurilgach; ungacha platforma panelida "Oxirgi zaxira" holati ko'rinadi).
- Oyiga bir marta zaxiradan sinov tiklash.
- Aniq saqlash joyi 5-bosqichda, hosting tanlanganda belgilanadi.

## Chekka holatlar
- Platforma egasi telefonini yo'qotsa → zaxira kodlar bilan kiradi.
- Bloklangan biznes xodimi kirmoqchi bo'lsa → "Hisob vaqtincha to'xtatilgan, administrator bilan bog'laning".
- Biznes egasining telefoni o'zgarsa → platforma egasi yangilaydi.

## Keyinroq
- Support xodimi roli
- Bizneslarning o'zi ro'yxatdan o'tishi, obunalar va to'lovlar
- Support uchun biznes nomidan kirish (jurnalga yoziladigan)

## AI xulosasi

✅ Qilsa bo'ladi
- Kichik modul: 3 sahifa, standart CRUD. 2FA uchun tayyor kutubxonalar bor.

⚠️ Qiyin yoki xavfli
- "Ma'lumot hech qachon yo'qolmaydi" faqat o'chirmaslik bilan ta'minlanmaydi — server buzilsa ham yo'qolmasligi uchun kunlik zaxira va tiklashni sinash shart.
- 2FA: telefon yo'qolsa platformaga kirish yo'qoladi — zaxira kodlar shart.

💡 Takliflar
- "Oxirgi faollik" ustuni — qaysi mijoz tizimni tashlab ketayotganini erta ko'rish uchun.
