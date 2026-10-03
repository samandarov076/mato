# Loyiha holati

**Loyiha:** mato-savdo — mato sotuvchilar uchun SaaS (sklad, sotuv, nasiya, analitika)
**Hujjatlar tili:** o'zbekcha
**Oxirgi yangilanish:** 2026-10-02

## Bosqichlar
| # | Bosqich | Holat |
|---|---------|-------|
| 1 | Biznes maqsadi | ✅ |
| 2 | Loyiha tavsifi | ✅ |
| 3 | Detallar | ✅ (00-09) |
| 4 | Skelet | ✅ |
| 5 | Baza va kod | ✅ 5.2 · barcha modullar (00–10) yozildi; 10-telegram jonli sinovni kutmoqda |

## Hozirgi joy
Bosqich 5.2 · **barcha modullar (00–10) yozildi.** Qolgan ishlar:
1. **10-telegram jonli sinovi** — bot tokeni kerak (@BotFather → `.env` ga `TELEGRAM_BOT_TOKEN`); kod soxta Telegram bilan test qilingan.
2. **Git** — foydalanuvchi aytganda (`git init`, birinchi commit).
3. **Ishga tushirish (hosting)** — server, HTTPS, fon ishchisi xizmat sifatida, zaxira nusxa, doimiy rasm ombori; "Texnik qarz" ro'yxatidagi ishga tushirishdan oldingi bandlar.
4. **Pilot** — `docs/biznesdan-savollar.md` dagi ochiq savollar.

Har modulning tafsiloti o'z papkasida: `modules/<NN-modul>/README.md`.

## Modullar (5-bosqich)
| # | Modul | Holat | Izoh |
|---|-------|-------|------|
| 00 | core | ✅ | Kirish (parol va PIN), do'kon qurilmalari, profil, biznes sozlamalari, jurnal, 3 til, kunduzgi/tungi rejim. 82 backend + 12 frontend testi. Tafsilot: `modules/00-core/README.md` |
| 01 | platform-admin | ✅ | Ikki bosqichli kirish (ilova + zaxira kodlar), bizneslar ro'yxati, qo'shish, bloklash, ega parolini tiklash, asosiy egani almashtirish. Jami 98 backend + 15 frontend testi. Tafsilot: `modules/01-platform-admin/README.md` |
| 02 | structure | ✅ | "Tuzilma" bo'limi: do'konlar, skladlar, xodimlar (joylarga biriktirish, PIN, parol), qurilmalar. Jami 120 backend + 19 frontend testi. Tafsilot: `modules/02-structure/README.md` |
| 03 | catalog | ✅ | "Katalog" bo'limi: matolar, ranglar, gullar, SKU, tavsiya narx (yakka va ommaviy), narx tarixi, rasm yuklash. Jami 150 backend + 26 frontend testi. Tafsilot: `modules/03-catalog/README.md` |
| 04 | receiving | ✅ | Kirimlar: hujjat + partiyalar, skladga qoldiq, tuzatish, bekor qilish, etiketka (shtrix-kod). Jami 176 backend + 36 frontend testi. Tafsilot: `modules/04-receiving/README.md` |
| 05 | inventory | ✅ | "Ombor" bo'limi: qoldiq, partiya kartochkasi, ko'chirish (jo'natish → qabul), partiyani yopish, metr farqi hisoboti; sotuvchi qobig'ida Qoldiq / Ko'chirishlar / Partiyani yopish. Jami 204 backend + 41 frontend testi. Tafsilot: `modules/05-inventory/README.md` |
| 09 | notifications | ✅ | Tizim ichidagi xabarlar: qo'ng'iroqcha, Xabarlar sahifasi, real vaqt (SSE); ombor hodisalari ulangan (ko'chirish keldi, farq, 24 soat kutish, katta metr farqi, kam qoldiq). Jami 218 backend + 48 frontend testi. Tafsilot: `modules/09-notifications/README.md` |
| 06 | sales | ✅ | Sotuv ekrani (skaner / qo'lda tanlash, metr ↔ kg, tavsiya narx, savat), naqd / karta / nasiya (mijozni tez qo'shish), sotuvlar ro'yxati, kartochka, qaytarish, bekor qilish; takror yozilishdan himoya. Jami 245 backend + 66 frontend testi. Tafsilot: `modules/06-sales/README.md` |
| 07 | credit | ✅ | "Nasiya" bo'limi: mijozlar (qarz, muddati o'tgani), mijoz kartochkasi, qarz to'lovi (eng eski qarzdan), hisobdan chiqarish (sababi bilan, egaga xabar), muddati o'tgan qarz xabari. Jami 255 backend + 73 frontend testi. Tafsilot: `modules/07-credit/README.md` |
| 08 | reports | ✅ | Bosh sahifa (dashboard) va hisobotlar: savdo / tushum / foyda, soatlar, top tovarlar, qoldiq qiymati, nasiya, narx og'ishi; filtrlar, o'tgan davr bilan taqqoslash, Excel. Jami 267 backend + 83 frontend testi. Tafsilot: `modules/08-reports/README.md` |
| 10 | telegram | ✅ | Bot: ulash (bir martalik havola), darhol xabarlar (ko'chirish farqi, katta metr farqi), kunlik xulosa (sozlamadagi soatda), profilda sozlamalar. Jami 279 backend + 87 frontend testi. **Haqiqiy bot bilan sinalmagan — token kerak.** Tafsilot: `modules/10-telegram/README.md` |

## Qabul qilingan qarorlar
- 2026-10-01 Mahsulot SaaS (multi-tenant) — ko'plab mato sotuvchilarga sotiladi.
- 2026-10-01 1-versiya pilot mijoz bilan; obuna to'lovlari keyin.
- 2026-10-01 Tovar partiya bo'yicha hisoblanadi (har rulon emas) — rulonga alohida etiketka amaliy emas.
- 2026-10-01 Partiyani sotuvchi yopadi; kamomad yopilganda hisoblanadi.
- 2026-10-01 Sotuv narxiga cheklov yo'q — javobgarlik sotuvchida.
- 2026-10-01 Valyuta: so'm.
- 2026-10-01 Omborchi roli qo'shildi; biznes egasi barcha huquqlarga ega.
- 2026-10-01 Qoldiq va partiya yopish har joy bo'yicha alohida (biznesdan tasdiqlanguncha).
- 2026-10-01 Qaytarish 1-versiyada; chek kerak emas; kassa yopish keyinroq.
- 2026-10-01 Bildirishnomalar tizim ichida + Telegram bot.
- 2026-10-01 Kirish: telefon + parol (SMS yo'q); do'kon qurilmasida sotuvchilar 4 xonali PIN bilan.
- 2026-10-01 Interfeys 3 tilda: uz (lotin), en, ru.
- 2026-10-01 Do'kon qurilmasi: ism-familiya doim ko'rinadi, qulf tugmasi, avto-qulflash 30 daq (sozlanadi).
- 2026-10-01 Harakatlar jurnali kategoriyalar bo'yicha; o'zgartirib bo'lmaydi.
- 2026-10-01 Rollar qat'iy (4 ta); sotuvchi tannarxni ko'rmaydi.
- 2026-10-01 Bizneslarni faqat platforma egasi qo'shadi; platforma admini 2FA bilan.
- 2026-10-01 Biznes hech qachon o'chirilmaydi, faqat bloklanadi; kunlik zaxira nusxa.
- 2026-10-01 Do'kon va sklad interfeysda alohida; do'konda ham qoldiq bor.
- 2026-10-01 Sotuvchining do'konlari tanlanadi (barchasi yoki tanlanganlari); sotuvchiga telefon shart emas.
- 2026-10-01 Do'kon qurilmasida faqat PIN bilan kirish (ism tanlanmaydi); istalgan PIN ruxsat, faol sotuvchilar orasida noyob. Xavf: "PIN band" xabari boshqa sotuvchi PIN'ini oshkor qilishi mumkin — yechim: PIN'ni faqat biznes egasi o'rnatadi.
- 2026-10-01 Bir nechta biznes egasi: bitta asosiy ega + sherik-egalar (teng huquq, faqat egalarni boshqara olmaydi). Asosiy egani faqat platforma egasi almashtiradi.
- 2026-10-01 Katalog: kodlar erkin (biznes o'zi yaratadi); SKU kirimda avtomatik; tavsiya narx har SKU uchun bitta (ulgurji/chakana yo'q), keyingi partiyalarda saqlanadi; narx kg yoki metrda, ekvivalent avtomatik; koeffitsient matoda standart, partiyada o'zgartiriladi; ommaviy narx qo'yish/o'zgartirish.
- 2026-10-01 Kirim faqat skladga; tannarx 1 metr uchun; yetkazib beruvchi yozilmaydi; harakatsiz kirim tahrirlanadi, harakatli — faqat ega.
- 2026-10-01 Omborchi tannarxni kiritadi va kirimda ko'radi; foyda unga yopiq.
- 2026-10-01 Qoldiq metrda (rulon taxminiy); ko'chirish ikki bosqichli (jo'natish → qabul); manfiy qoldiqda izoh bilan sotish; partiyani qayta ochish — ega yoki omborchi; sotuvchi boshqa joylar qoldig'ini ko'radi; inventarizatsiya keyin.
- 2026-10-01 Sotuv: narx 1 metr uchun, jami avtomatik; tavsiya narx tugmasi; qo'lda tanlashda eng eski partiya; to'lov — naqd/karta/nasiya; qaytarishni sotuvchi qiladi, pul qaytadi, muddatsiz; sotuvchi 10 daqiqa ichida bekor qiladi; qaytarishlar egaga tizim xabari + jurnal (Telegram emas).
- 2026-10-01 Nasiya: boshlang'ich to'lov bor; to'lov eng eski qarzga; limit yo'q; mijoz telefoni majburiy; qarzni hisobdan chiqarishni sotuvchi ham qiladi (egaga tizim xabari).
- 2026-10-01 Hisobotlar: foyda = savdo − tannarx (bitta); Excel eksport; o'tgan davr bilan taqqoslash; top tovarlar; sotuvchilar kesimi hisoboti keyin.
- 2026-10-01 Bildirishnomalar: 10 hodisa; Telegram — darhol faqat 5, 7, 10; kunlik xulosa 21:00; har ega Telegram'ni o'zi sozlaydi.
- 2026-10-01 Telegram bot alohida 10-modul, eng oxirida quriladi; tizim ichidagi xabarlar (09) asosiy modullar bilan birga.
- 2026-10-01 Sahifalar xaritasi tasdiqlandi; qo'shildi: sotuvlar ro'yxati, sotuv kartochkasi (06), partiya kartochkasi (05).
- 2026-10-01 Sotuv ekrani: bitta ustun — kiritish qatori, ostida ro'yxat, pastda to'lov.
- 2026-10-01 Barcha eskizlar tasdiqlandi (docs/04-eskizlar.md). Kod yozish CLAUDE.md qoidalari bo'yicha.
- 2026-10-01 Interfeysda "kamomad" o'rniga "Metr farqi" (kam chiqdi / ortiq chiqdi) — docs/atamalar.md.
- 2026-10-01 Stek: FastAPI + SQLAlchemy 2 + Alembic, PostgreSQL (+RLS), Redis + navbat, SSE (real vaqt), React + TypeScript + Vite (PWA), Tailwind, i18next, Docker Compose.
- 2026-10-01 Barcha papka nomlari inglizcha (modules/00-core ..., docs/03-details, docs/sketches).
- 2026-10-02 Baza sxemasi tasdiqlandi (32 jadval, ikki qatlamli qoldiq, RLS har jadvalda, sessions, counters, due_date).
- 2026-10-01 Omborchi skladlarini biznes egasi belgilaydi (barchasi yoki tanlanganlari).
- 2026-10-02 Bazaga ikki rol bilan ulanamiz: `mato_app` (RLS ta'sir qiladi — biznes ichidagi hamma so'rov, `tenant_session`) va jadvallar egasi (`system_session` — faqat migratsiya, kirishdagi qidiruv, platforma paneli). Sabab: jadval egasi va superuser RLS'ni chetlab o'tadi, bitta rol bilan RLS ishlamas edi.
- 2026-10-02 PIN `users.pin_lookup` da HMAC(SECRET_KEY) sifatida saqlanadi (sxemadagi `pin_hash` o'rniga): faqat PIN bilan kirishda sotuvchini PIN bo'yicha topish va noyoblikni tekshirish kerak, bcrypt bilan buning iloji yo'q.
- 2026-10-02 `locations` jadvali 1-migratsiyaga kiritildi (qurilmalar va jurnal unga bog'lanadi); do'kon/sklad sahifalari 02-structure da qoladi.
- 2026-10-02 Ilova roliga DELETE berilmaydi (istisno: `user_locations`); biznes o'z holati va nomini o'zgartira olmaydi — faqat sozlamalarni (ustun darajasidagi huquq).
- 2026-10-02 Lokal portlar `.env` orqali sozlanadi (`DB_PORT`, `REDIS_PORT`, `BACKEND_PORT`, `FRONTEND_PORT`) — shu kompyuterda 5432/8000/5173 boshqa loyihalar bilan band.
- 2026-10-02 1-migratsiya tasdiqlandi.
- 2026-10-02 Sessiya: qisqa muddatli token (30 daq) brauzer xotirasida, uzoq muddatli token (30 kun, har faollikda uzayadi) httpOnly cookie'da. Har so'rovda sessiya bazadan tekshiriladi — xodim faolsizlantirilsa yoki biznes bloklansa darhol chiqariladi.
- 2026-10-02 Kirish xatolari: telefon yoki parol xato — bitta umumiy xabar; parol to'g'ri bo'lsa-yu hisob faolsiz bo'lsa — "Hisobingiz faolsizlantirilgan"; biznes bloklangan bo'lsa — hujjatdagi xabar.
- 2026-10-02 Parol almashtirilganda foydalanuvchining boshqa qurilmalardagi sessiyalari tugaydi; yangi parol eskisi bilan bir xil bo'lishi mumkin emas.
- 2026-10-02 Platforma egasi oddiy kirish orqali kira olmaydi — uning kirishi (2FA bilan) 01-modulda quriladi.
- 2026-10-02 Dizayn: eskizdagi ranglar (indigo, ro'yan, za'faron, barg) + tungi rejim; kirish sahifasida adras naqshi, ilova tepasida "mato milki" chizig'i; shrift Golos Text. Hali qurilmagan bo'limlar menyuda "tez orada" belgisi bilan ko'rinadi.
- 2026-10-02 3- va 6-qadamlar (kirish backend'i, kirish sahifasi, qobiq, profil, dizayn) tasdiqlandi.
- 2026-10-02 Kirishda cheklov: bitta telefon raqamiga 15 daqiqada 10 ta xato urinish → 15 daqiqaga to'xtatiladi (blok paytida to'g'ri parol ham o'tmaydi). Hisoblagichlar Redis'da.
- 2026-10-02 Qurilmani bog'lash shu qurilmaning o'zida qilinadi; bog'langach egasining shaxsiy sessiyasi unda tugaydi — qurilmada faqat PIN qoladi. Shu brauzer qayta bog'lansa, eski bog'lanish uziladi.
- 2026-10-02 Qurilmadagi sotuvchi sessiyasi serverda `avto-qulflash vaqti + 30 daqiqa` harakatsizlikdan keyin tugaydi (brauzer yopilib qolgan holat uchun); aniq avto-qulflash va qulf tugmasi — interfeysda.
- 2026-10-02 Xato PIN'da sabab aytilmaydi (PIN noto'g'ri, sotuvchi faolsiz yoki unga bu do'kon ruxsat etilmagan — bir xil javob).
- 2026-10-02 4-qadam tasdiqlandi; "ketma-ket davom etish" ko'rsatmasi bilan 5-, 7-, 8-qadamlar bajarildi.
- 2026-10-02 Biznes sozlamalari bitta so'rov bilan to'liq saqlanadi; jurnalga faqat o'zgargan maydonlar "eski → yangi" ko'rinishida yoziladi. Kunlik xulosa vaqti (21:00) sozlamalar sahifasiga 10-telegram modulida qo'shiladi.
- 2026-10-02 Jurnal eng yangi yozuvdan boshlab, 50 tadan, "Yana ko'rsatish" bilan ochiladi (kursor bilan sahifalash — hajm oshsa ham tez).
- 2026-10-02 "Qurilmalar" hozircha menyuda alohida turadi; 02-structure qurilgach "Tuzilma" bo'limiga ko'chadi. Do'konlar va xodimlar ro'yxatini beradigan ikkita o'qish API'si (`/api/locations`, `/api/users`) 00-modulda ochildi — 02 ularni kengaytiradi.
- 2026-10-02 PIN ekranida "Biznes egasi sifatida parol bilan kirish" havolasi bor — ega bog'langan qurilmadan ham kira oladi (masalan, qayta bog'lash uchun).
- 2026-10-02 Frontend'ga testlar (Vitest) va ESLint qo'shildi.
- 2026-10-02 00-core tasdiqlandi ("git oxirida, loyihani davom et"); 01-platform-admin qurildi.
- 2026-10-02 Platforma egasi: parol to'g'ri bo'lsa ham sessiya ochilmaydi — avval ikkinchi bosqich (tasdiqlash ilovasidagi kod). Ilova birinchi kirishda ulanadi; 10 ta bir martalik zaxira kod beriladi. 5 ta xato kod → 15 daqiqa to'xtatiladi. Sessiya 12 soat harakatsizlikdan keyin tugaydi.
- 2026-10-02 Platforma amallari: bloklash / blokdan chiqarish / asosiy egani almashtirish — `business_status_events` ga sababi bilan; biznes yaratish, ega parolini tiklash, telefonini o'zgartirish — biznesning o'z jurnaliga ("Tizim" nomidan). Yangi jadval ochilmadi.
- 2026-10-02 Platforma egasida profil sahifasi yo'q; interfeys tili qurilmadagi tanlov bo'yicha.
- 2026-10-02 Zaxira nusxa va "Oxirgi zaxira" holati hosting tanlanganda qilinadi (01-modul hujjatida yozilgan, hozircha qurilmadi).
- 2026-10-02 02-structure qurildi. "Qurilmalar" menyudan olinib, "Tuzilma" bo'limining to'rtinchi varag'iga ko'chdi (Do'konlar · Skladlar · Xodimlar · Qurilmalar).
- 2026-10-02 Joy nomi tur bo'yicha noyob: do'konlar orasida va skladlar orasida alohida, katta-kichik harf farqlanmaydi (bir xil nomli do'kon va sklad bo'lishi mumkin). Baza indeksi — 2-migratsiya.
- 2026-10-02 Ega qo'ygan parol vaqtinchalik hisoblanadi: omborchi va sherik-ega birinchi kirishda (va ega parolni yangilaganidan keyin) uni almashtirishga majbur.
- 2026-10-02 Sotuvchining telefoni saqlanmaydi (kirish faqat PIN bilan). Xodimning joyi, PIN'i yoki paroli o'zgarsa, ochiq sessiyalari darhol tugaydi.
- 2026-10-02 Faolsiz sotuvchini qaytarishda eski PIN'i band bo'lib qolgan bo'lsa, avval yangi PIN o'rnatiladi.
- 2026-10-02 "Qoldig'i bor joyni faolsizlantirib bo'lmaydi" qoidasi 05-inventory ga ko'chirildi (qoldiq jadvallari o'shanda paydo bo'ladi).
- 2026-10-02 03-catalog qurildi. Ranglar va gullar ro'yxati barcha matolar uchun umumiy (biznesdan-savollar, 2-savol bo'yicha taxmin); baza "har matoniki" variantiga ham tayyor.
- 2026-10-02 Kodlar katta-kichik harfni farqlamaydi ("M101" = "m101"); forma o'xshash kodlarni ko'rsatib ogohlantiradi ("M-101" ↔ "M101"), lekin taqiqlamaydi.
- 2026-10-02 "Gulsiz" — har biznesda bitta maxsus gul: o'zi yaratiladi, faolsizlantirilmaydi, SKU kodida yozilmaydi (`M101-03`; gulli — `M101-03-G1`).
- 2026-10-02 Rangga namuna (rang) qo'yiladi — rasm yuklamasdan ham ro'yxatlarda rang ko'rinadi. Mato, rang, gulga rasm ham yuklasa bo'ladi (ixtiyoriy, 8 MB gacha; server WebP ga o'giradi).
- 2026-10-02 SKU'ni katalogda qo'lda ham qo'shsa bo'ladi (bitta mato × tanlangan ranglar × gullar) — narxni kirimdan oldin qo'yish uchun. Kirimdagi avtomatik yaratish 04-modulda.
- 2026-10-02 Tavsiya narx bo'sh bo'lishi mumkin; har o'zgarish SKU narx tarixiga va jurnalning "Narx" kategoriyasiga yoziladi. Katalogning qolgan o'zgarishlari — "Ombor" kategoriyasiga.
- 2026-10-02 Rasmlar hozircha lokal diskda (`MEDIA_DIR`), manzili taxmin qilib bo'lmaydigan nom bilan ochiq beriladi (tovar rasmi sir emas). Doimiy ombor — hosting tanlanganda.
- 2026-10-02 04-receiving qurildi. Qoldiqning ikki qatlami (`batch_stock` + o'zgarmas `stock_movements`) va yagona `move_stock` funksiyasi shu modulda yaratildi — 05 va 06 faqat shu orqali qoldiqqa tegadi.
- 2026-10-02 Hujjat raqamlari: kirim `KR-00001`, partiya `P-000001`, ko'chirish `K-00001` (eskizdagidek) — har biznesda alohida, uzluksiz; saqlanmagan hujjat raqam sarflamaydi.
- 2026-10-02 Kirimni tuzatish: harakatsiz partiyani kiritgan omborchi yoki ega; sotilgan/ko'chirilgandan keyin — faqat ega, tovarni almashtirib bo'lmaydi. Metr tuzatilsa, sklad qoldig'i "tuzatish" harakati bilan o'zgaradi (eski harakat o'chirilmaydi).
- 2026-10-02 Kirimni bekor qilish — faqat ega va faqat harakatsiz kirim; kirim ro'yxatda "bekor qilingan" bo'lib qoladi.
- 2026-10-02 Etiketka: SKU kodi va nomi, Code 128 shtrix-kod (partiya raqami), sana; brauzer orqali chop etiladi; 58×40 / 58×30 / 100×50 mm; nusxalar soni boshida rulonlar soniga teng. Kodlovchi o'zimizniki (tashqi kutubxonasiz), tayyor kutubxona natijasi bilan solishtirib tekshirilgan.
- 2026-10-02 Kirimdagi ogohlantirishlar taqiqlamaydi: koeffitsient standartdan 20%+ farq, tannarx tavsiya narxdan yuqori, bir tovar ikki qatorda (birlashtirish tugmasi).
- 2026-10-02 Biznes egasining "Ombor" menyusi — bitta bo'lim, ichida varaqlar: Qoldiq · Kirimlar · Ko'chirishlar · Metr farqi. Omborchida bular menyuda alohida; sotuvchida — do'kon qurilmasining pastki menyusida.
- 2026-10-02 05-inventory qurildi. Ko'chirish raqami `K-00001` (eskizdagidek), shuning uchun kirim raqami `KR-00001` ga o'zgartirildi.
- 2026-10-02 Ko'chirishni qabul qilishda izoh butun ko'chirish uchun bitta (eskizdagidek) — sxemadagi qator izohi o'rniga `transfers.receive_note`. Rulon yoki metr farq qilsa izoh majburiy.
- 2026-10-02 Yo'ldagi ko'chirishni faqat jo'natuvchining o'zi yoki biznes egasi bekor qiladi. Qoldiqdan ko'p metr jo'natib bo'lmaydi (manfiy qoldiq faqat sotuvda ruxsat).
- 2026-10-02 Partiyani yopish: shu joyga yo'lda tovar kelayotgan bo'lsa yopilmaydi; farq 10% dan katta bo'lsa qo'shimcha ogohlantiriladi (taqiqlanmaydi). Qayta ochish — ega yoki o'z skladida omborchi; sotuvchi qayta ocha olmaydi.
- 2026-10-02 Kam qoldiq har joy bo'yicha hisoblanadi (SKU'ning shu joydagi jami qoldig'i chegaradan past) — sklad to'la, do'kon bo'sh bo'lsa ham ko'rinadi.
- 2026-10-02 Qoldiq sahifasida mato / rang / gul tanlovlari o'rniga bitta qidiruv (kod, nom, partiya raqami) — sotuvchi ham ishlata olishi uchun. Tannarx partiya kartochkasida faqat egaga ko'rinadi (omborchi uni faqat kirim sahifalarida ko'radi).
- 2026-10-02 Qoldig'i yoki yo'lda tovari bor do'kon/sklad faolsizlantirilmaydi (02-tuzilma qoidasi 05 da bajarildi).
- 2026-10-02 09-notifications (tizim ichida) qurildi. Xabar amal bilan bitta tranzaksiyada yoziladi; real vaqt signali (SSE + Redis) faqat saqlangandan keyin ketadi.
- 2026-10-02 Ega o'zi qilgan ish haqida o'ziga xabar olmaydi (boshqa egalar oladi). Ish bajarilsa (ko'chirish qabul qilindi / bekor bo'ldi), shu haqdagi "qabul qiling" va "kutyapti" xabarlari hammada o'qilgan bo'ladi.
- 2026-10-02 Kam qoldiq xabari bir marta keladi — qoldiq chegaradan tushganda; tovar to'ldirilib yana tushsa takrorlanadi. Tekshiruv har qoldiq harakatida (`move_stock` ichida), shuning uchun sotuvda ham o'zi ishlaydi.
- 2026-10-02 "Ko'chirish keldi" xabari qabul qiluvchi joyning barcha faol xodimlariga boradi (do'kon — sotuvchilar, sklad — omborchilar); jo'natuvchining o'ziga bormaydi.
- 2026-10-02 Fon vazifalari uchun arq ishchisi (`app/worker.py`): hozircha bitta vazifa — 24 soat qabul qilinmagan ko'chirish eslatmasi (har soatda).
- 2026-10-02 06-sales qurildi. Sotuv raqami `S-000001`. Sotuvchining bosh sahifasi — sotuv ekrani; biznes egasi ham sota oladi (do'konni tanlab, "Sotuv → Yangi sotuv").
- 2026-10-02 Mijoz va qarz jadvallari (`customers`, `debts`) 06 da yaratildi — nasiya sotuv shu modulda to'liq ishlaydi; 07-credit to'lov va hisobdan chiqarishni qo'shadi.
- 2026-10-02 Tavsiya narx sotuvda o'zi qo'yilmaydi: sotuvchi "Tavsiya narx" tugmasini bosadi yoki o'z narxini yozadi (hujjatdagidek). Qatorda tavsiya narx, haqiqiy narx va o'sha paytdagi tannarx saqlanadi.
- 2026-10-02 Bir savat — bir sotuv: savat qurilmada saqlanadi (xodim va do'kon bo'yicha alohida), javob kelmasa o'zgartirilmaydi va ulanish tiklangach o'sha identifikator bilan qayta yuboriladi.
- 2026-10-02 Qaytarish: nasiya sotuvda summa avval shu sotuvning qarzidan ayriladi, qolgani pul bilan qaytadi (naqd / karta). Qatorning oxirgi qismi qaytganda qolgan summaning hammasi qaytadi (yaxlitlash farqi qolmaydi).
- 2026-10-02 Bekor qilish: sotuvchi — faqat o'z sotuvini, 10 daqiqa ichida; qaytarishi bor yoki qarziga to'lov tushgan sotuv bekor qilinmaydi (avval ular hal qilinadi).
- 2026-10-02 Sotuvchi o'z do'konining barcha sotuvlarini ko'radi (qaytarish uchun asl sotuvni topishi kerak) — tannarx va foydasiz.
- 2026-10-02 Boshlang'ich to'lov jami summaga teng bo'lsa, sotuv nasiya emas — shu to'lov turidagi oddiy sotuv bo'lib yoziladi.
- 2026-10-02 07-credit qurildi. **Nasiya sozlamada o'chirilsa ham "Nasiya" bo'limi ko'rinib turadi** (hujjatdagi "ko'rinmaydi" o'rniga): yangi nasiya berilmaydi, mavjud qarzlar to'lanaveradi — aks holda ularni undirib bo'lmas edi.
- 2026-10-02 Qarz to'lovi va hisobdan chiqarish alohida sahifa emas — mijoz kartochkasi ichida. To'lov standart bo'yicha eng eski qarzdan boshlab yopadi; aniq sotuvni tanlasa bo'ladi.
- 2026-10-02 Ega qurilmasiz qabul qilgan qarz to'lovi qarz berilgan do'konga yoziladi (tushum hisobotida "do'konsiz" pul qolmasligi uchun).
- 2026-10-02 To'lov va hisobdan chiqarish yozuvlari o'zgarmas (faqat qo'shiladi). Muddati o'tgan qarz xabari har qarz uchun bir marta; qarz yopilsa o'zi o'qilgan bo'ladi.
- 2026-10-02 "Muddati o'tgan" — qarzning o'z muddati (`due_date`) bo'yicha, "30+ kun" emas: sozlamadagi kun o'zgarsa ham eski qarzlar to'g'ri hisoblanadi.
- 2026-10-02 08-reports qurildi. **Yig'ma jadval (`daily_summary`) qurilmadi** — hisobotlar asl jadvallardan hisoblanadi (har doim aniq, soddaroq); hajm oshib sekinlashsa qo'shiladi.
- 2026-10-02 Hisob-kitob qoidalari: qaytarish qaytarilgan kunning savdosidan ayriladi; foyda sotuv qatorida saqlangan tannarx bo'yicha; bekor qilingan sotuv hisoblanmaydi; tushum = naqd/karta sotuvlar + boshlang'ich to'lovlar + qarz to'lovlari − pul bilan qaytarilgani.
- 2026-10-02 Taqqoslash — shu uzunlikdagi bevosita oldingi davr bilan. Mato bo'yicha filtrlanganda tushum hisoblanmaydi (pul matoga bog'lanmaydi).
- 2026-10-02 Biznes egasining bosh sahifasi — dashboard (3-eskiz); omborchining bosh sahifasi — Qoldiq; vaqtinchalik "Bosh sahifa" olib tashlandi. Excel sarlavhalari foydalanuvchi tilida (server tomonda kichik lug'at).
- 2026-10-02 10-telegram yozildi (token bo'lmagani uchun soxta Telegram bilan test qilindi). Bot yangiliklarni so'rab oladi (webhook emas) — ochiq HTTPS manzilsiz ham ishlaydi; fon ishchisi shart.
- 2026-10-02 Telegram'ga darhol faqat ikki hodisa boradi (ko'chirish farqi, katta metr farqi); kunlik xulosa to'liq soatda, har egaga kuniga bir marta. Uzilganda bog'lanish qatori o'chirilmaydi (`chat_id` bo'shatiladi).
- 2026-10-02 "Zaxira nusxa olinmadi" Telegram xabari qurilmadi — zaxira nusxaning o'zi hosting bosqichida.
- 2026-10-02 Qo'lda sinovdan keyingi tuzatishlar (foydalanuvchi fikri bo'yicha): biznes yaratilgach tabrik ekrani (konfetti), "yana yaratish" tugmasi olib tashlandi; til tanlovi kirgandan keyin ham yuqori panelda (hisobga saqlanadi); do'kon qurilmasida parol bilan kirgan egaga "PIN ekraniga qaytish / Qurilmani uzish" banneri.
- 2026-10-02 Dizayn yangilandi: har bo'limning o'z rangi (sotuv — yashil, nasiya — za'faron, ombor — feruza, katalog — binafsha, hisobot — marjon; `shared/ui/tones.ts`), rangli belgili sarlavha (`PageTitle`), ko'rsatkich kartochkasi (`Stat`), ism bosh harflari (`Avatar`), to'lov turi yorliqlari.
- 2026-10-02 Harakat va 3D (`shared/ui/motion.tsx`, `index.css`): kartochkalar sichqonchaga qarab 3D og'adi, sonlar sanab chiqadi, sahifa va kartochkalar navbat bilan ochiladi, diagramma ustunlari o'sib chiqadi, tugmalar va PIN klavishlari "bosiladigan"; kirish sahifasi va bosh sahifada 3D mato taxlami (`FabricStack`). Faqat transform/opacity — ish tezligiga ta'sir qilmaydi; "harakatni kamaytirish" yoqilgan qurilmada hammasi o'chadi.
- 2026-10-02 Moslashuvchanlik (responsive) qayta ko'rildi: kontent katta monitorda butun enni egallaydi (1760px gacha; avval 1024px edi), yon menyu 1280px dan boshlab turadi (torroqda — tugma ortida), sotuv ekrani keng ekranda ikki ustunli; telefonda tablar va tanlov tugmalari qirqilmay o'raladi (`shared/ui/tabs.ts`), hisobot jadvallari 768px dan torida kartochkaga aylanadi (`.rtable`), ko'rsatkich sonlari kartochka eniga qarab kichrayadi. 35 sahifa 360 / 640 / 768 / 1024 / 1280 px da avtomatik tekshirildi — yonga chiqish yoki ustma-ust tushish yo'q.
- 2026-10-02 Barcha bo'limlar bir uslubga keltirildi (`shared/ui/list.tsx`: `RowAction`, `Chip`, `IconChip`, `Fact`, `Empty`; `Card` sarlavhasida belgi): amallar matn-havola emas — belgili tugma; "faktlar" bloki belgili; bo'sh holatlar belgili; holatlar rangli yorliq; tarix qatorlarida harakat turi belgisi; tablarda belgi. Tuzilma — yangi `rose` rangi, do'kon/sklad kartochkalar to'ri, xodimlarda avatar va rol yorlig'i. Kod-harfli tovar belgisi (rasm/rang yo'q bo'lsa) koddan kelib chiqadigan rangda.
- 2026-10-02 Tuzatildi: sahifa qayta yuklanganda profil tili ba'zan qo'llanmay qolardi (til chizishdan keyin almashardi) — endi sessiya qabul qilinishi bilanoq o'rnatiladi (`AuthProvider.apply`).
- 2026-10-03 **Dizayn va sezgi auditi** (7 yo'nalish, 140 topilma; batafsil `docs/06-dizayn-va-sezgi.md`). Umumiy qatlam: AAA kontrastli rang tokenlari (`--muted` 73 77 94, maydon chegarasi `--edge`), harakat tokenlari (`--dur-1..4`, `--ease-*`, `linear()` prujina), `.pressable/.press/.tilt/.reveal/.skeleton`, fokus halqalari, "asosiy qismga o'tish" havolasi, yon menyu fokus tuzog'i + `inert`, 44px teginish nishonlari, sahifa sarlavhasi (`document.title`). Modullarda: `Loading/LoadMore/BackLink/SectionHeader/rowClass/Chip` bir xil; xavfli amallar `ConfirmBar` bilan ("Yo'q, qolsin"), fokus trigger'ga qaytadi; kirim va ko'chirish formalari qurilmada qoralama sifatida saqlanadi (`shared/draft.ts`); xato bo'lsa birinchi noto'g'ri maydonga o'tiladi; ro'yxat qatorlari `memo`.
- 2026-10-03 **Tovush va tebranish** (`shared/feedback/`): tovushlar fayl emas, Web Audio bilan sintez qilinadi (12 tur: tap, tick, toggle, select, success, warning, error, remove, scan, swish, cash, celebrate), bosilgan joyga qarab stereo; tebranish `navigator.vibrate` naqshlari (Android; iOS Safari qo'llamaydi). Ikkalasi profil sahifasida alohida o'chiriladi (`mato.feedback`), yuqori panelda tovush tugmasi. Sotuv tezligiga ta'sir qilmaydi (35 ms oraliq, bir vaqtda bitta tovush).
- 2026-10-03 **3D** faqat kirish sahifasining keng ekranli (≥1024px) panelida: Three.js (R3F) mato taxlami — fizik material (sheen, to'qima bump), yo'naltirilgan + kontakt soya, chuqurlik (DoF) va vinyetka; alohida bo'lak (~1 MB, faqat shu yerda yuklanadi, PWA keshiga kirmaydi). Telefon, "harakatni kamaytirish", trafik tejash yoki WebGL yo'q holatda — CSS taxlam. Boshqa joylarda 3D faqat CSS (kartochka og'ishi). Next.js ga o'tilmadi — Vite + React qoldi (PWA, oflayn savat).
- 2026-10-03 Ish tezligi: marshrut bo'yicha kod bo'laklari (kirish 826 → 235 KB), tillar alohida yuklanadi, shrift o'z serverdan (`@fontsource/golos-text`), backend javoblari gzip, rasm 96px `.s.webp` kichik nusxalar, so'rovlarda vaqt chegarasi, SSE qayta ulanish, sotuvdan keyin kesh joyida yangilanadi. PWA ikonkalari qo'shildi.
- 2026-10-03 Matn auditi (`docs/atamalar.md` oxirida jadval): "Yo'q, qolsin", "Yangi X" / "X qo'shish", "Kamida N ta belgi kiriting", en "Goods in", ru "Запасы"; ko'plik shakllari (`_one/_other`); bo'sh holatlar harakatga undaydi.
- 2026-10-02 **Parol va PIN'ni ko'rish** (foydalanuvchi so'rovi; xavfi tushuntirilgach "ko'rinadigan saqlash" tanlandi): ega boshqara oladigan xodimining, platforma egasi biznes egalarining hozirgi parolini ko'radi. `users.password_enc`, `users.pin_enc` (0010-migratsiya) — Fernet bilan shifrlangan nusxa (`app/core/vault.py`, kalit `CREDENTIALS_KEY`); kirish avvalgidek xesh bo'yicha. Endpointlar: `POST /api/users/{id}/reveal`, `POST /api/platform/businesses/{id}/owners/{uid}/reveal-password` — har ko'rish jurnalga yoziladi; ro'yxatlarda qaytmaydi. Eski parollar keyingi muvaffaqiyatli kirishda saqlanadi. Platforma egasining paroli saqlanmaydi.

## Texnik qarz
- Tasdiqlash ilovasi kaliti (`users.totp_secret`) bazada shifrlanmagan — ishga tushirishdan oldin shifrlash kerak.
- **Ko'rinadigan parollar xavfi:** serverda `CREDENTIALS_KEY` albatta alohida, uzun tasodifiy qiymat bo'lsin (bo'sh qolsa `SECRET_KEY` dan hosil qilinadi — faqat ishlab chiqish uchun) va zaxirasi bazadan alohida saqlansin. Baza bilan kalit birga o'g'irlansa, barcha xodimlarning parollari ochiladi — zaxira nusxalarni ham shunga qarab himoyalash kerak.
- Haqiqiy platforma egasini yaratadigan buyruq yo'q (hozir faqat `seed_dev.py`) — ishga tushirish bosqichida.
- Bizneslar ro'yxati sahifalanmagan — bizneslar ko'payganda kerak bo'ladi.
- Urinishlar cheklovi raqam bo'yicha: kimdir ataylab 10 marta xato terib, begona raqamni 15 daqiqaga to'xtatib qo'yishi mumkin. Pilotda muammo bo'lsa, IP manzilni ham hisobga olish kerak.
- Frontend testlari hozircha kam (formatlar, telefon maydoni, PIN ekrani, ikkinchi bosqich, xodimlar sahifasi, SKU ro'yxati) — har modulda asosiy sahifaga test qo'shib boriladi.
- Xodimlar va joylar ro'yxati sahifalanmagan — bitta biznesda qatorlar kam, hozircha kerak emas.
- Rasmlar lokal diskda; formada tanlab keyin bekor qilingan rasm fayli diskda qoladi (tozalash vazifasi yo'q) — hosting tanlanganda doimiy omborga ko'chiriladi.
- Mato / rang / gul ro'yxatlari to'liq yuklanadi (SKU ro'yxati sahifalangan) — minglab qator bo'lsa sahifalash kerak.
- "Kg bilan sotish" o'chiq bo'lsa, katalogdagi narx birligidan "kg" yashirilmaydi (sotuvda kg maydoni yashiriladi) — kerak bo'lsa katalogda ham.
- Sotuv ekrani do'kondagi barcha ochiq partiyalarni bir so'rovda oladi — minglab partiyada qidiruvni serverga ko'chirish kerak.
- Soxta qaytarishga qarshi faqat chegara + xabar + jurnal bor; kunlik limit yoki ega tasdig'i yo'q — pilotda kuzatiladi.
- Kamera orqali skanerlash yo'q (USB / Bluetooth skaner yoki qo'lda yozish).
- Kechasi `batch_stock` ni `stock_movements` yig'indisi bilan solishtiradigan fon vazifasi yo'q (sxemada rejalashtirilgan) — navbat (arq) ishga tushirilganda.
- Mavjud kirimga qator qo'shib bo'lmaydi (yangi kirim ochiladi); etiketka to'g'ridan-to'g'ri printerga emas, brauzer oynasi orqali.
- Fon ishchisi (`arq app.worker.WorkerSettings`) lokalda qo'lda ishga tushiriladi; serverda alohida xizmat bo'lishi kerak — hosting sozlanganda (usiz Telegram ishlamaydi). Eski xabarlar tozalanmaydi.
- Telegram haqiqiy bot bilan sinalmagan; bot faqat "/start" ni tushunadi; "zaxira nusxa olinmadi" xabari yo'q.
- Hisobdan chiqarishga limit yoki ega tasdig'i yo'q (himoya: sabab + egaga xabar + jurnal); xato kiritilgan qarz to'lovini bekor qilish amali yo'q — pilotda kuzatiladi.
- Qoldiq sahifasi 5+ joyli biznesda zich ko'rinadi; metr farqi hisoboti sahifalanmagan (500 qatorgacha); partiya tarixi oxirgi 200 harakat.
- Hisobotlar asl jadvallardan hisoblanadi — hajm oshganda yig'ma jadval kerak bo'ladi; grafiklar oddiy (kutubxonasiz); PDF eksport yo'q.
- Tebranish iOS Safari'da ishlamaydi (`navigator.vibrate` yo'q) — tovush bilan qoplanadi. Tovushlar sintez qilingan — "jonli" yozuvlar kerak bo'lsa `shared/feedback/audio.ts` dagi `SOUNDS` jadvali fayllarga almashtiriladi.
- Birliklar (m / kg / so'm) matnlari tarjima faylida bir joyga yig'ilmagan (copy-4) — keyinroq.
- Chip (yorliq) yumshoq fonlarida kontrast AA (4.5:1), AAA emas — matn kichik va qisqa; panel va sahifa matnlari AAA.
- Three.js ogohlantirishlari (`THREE.Clock`, `PCFSoftShadowMap` eskirgan) konsolda ko'rinadi — drei/R3F yangilanganda yo'qoladi; ishga ta'siri yo'q.
- `RowAction` va `Button` `forwardRef` qilmaydi — tasdiq panelidan fokus qaytarish uchun 4 sahifada oddiy `<button className={actionClass()}>` ishlatilgan.
- Ishlab chiqarishda `system_session` uchun jadval egasi emas, alohida cheklangan rol (BYPASSRLS, DDL'siz) ochish kerak — hosting tanlanganda.
- Bog'lanishlar (FK) biznesni tekshirmaydi: boshqa biznes qatoriga havola qilishdan RLS emas, servis kodi himoya qiladi (qatorni avval `tenant_session` ichida o'qib). Har modulda test bilan tekshiriladi.

## Ochiq savollar
- Biznesdan so'raladigan savollar → docs/biznesdan-savollar.md
