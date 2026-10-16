# 06 — Sotuv: detallar

Do'kon qurilmasidagi sotuv ekrani, to'lov, qaytarish, bekor qilish. Asosiy mezon — tezlik.

## Sotuv ekrani

### Oqim
1. **Tovar:** skaner — qo'l skaneri (USB/Bluetooth) yoki telefon/planshet **kamerasi** (skaner maydonidagi kamera tugmasi); qidiruv; yoki qo'lda: mato → rang → gul (rasmlar bilan, agar bo'lsa). Tanlangan tovar **katta rasm** bilan ko'rsatiladi — sotuvchi qo'lidagi mato shu ekanini tekshiradi.
   - Skaner/Enter: avval partiya raqami aniq (etiketka), keyin SKU kodi aniq (`M101-03` — gulli `M101-03-G1` emas), keyin qidiruv
   - **Moslashuvchan qidiruv:** so'zlar istalgan tartibda — "qizil atlas", "m101 gul", partiya raqami; apostrof turlari bir xil (`ko'k` = `koʻk` = `kok`)
   - **Qidiruv yanada moslashuvchan (2026-10-05, foydalanuvchi talabi — sotuvchi ekrani):**
     - yozilishi bilan natija chiqadi — alohida ro'yxat emas, o'sha **tovarlar to'ri** torayadi (rasm, kod, nom, qoldiq, narx);
     - kirill yozuvi ham tushuniladi: `шифон оқ` = `shifon oq`, `кизил` = `qizil` (harflar lotinchaga o'giriladi; `қ`/`к` → `q`/`k`, `ғ` → `g'`, `ў` → `o'`, `ҳ`/`х` → `h`/`x`);
     - kodda chiziqcha va bo'shliq shart emas: `m10103` = `M101-03`, `p12` = `P-000012` (partiya raqamida oldingi nollar tashlab yozilsa ham);
     - bitta harf xatosi kechiriladi (4 va undan uzun so'zda): `shifan` → Shifon, `qzil` → Qizil; `x` va `h`, `q` va `k` bir-birining o'rnida yozilsa ham topiladi;
     - tartib: aniq kod / partiya raqami → kod yoki nom shu so'z bilan boshlanadi → so'z ichida uchraydi → xato bilan mos; tengida qoldig'i bori oldin;
     - klaviatura: ↓ ↑ — natijalar bo'ylab, Enter — belgilanganini tanlaydi (belgilanmagan bo'lsa avvalgi qoida: aniq kod, yoki natija bitta bo'lsa o'sha);
     - mato / rang chiplari tanlangan bo'lsa ham qidiruv butun do'kon bo'yicha (chiplar — ko'rib tanlash, qidiruv — yozib topish).
   - **Rasm (2026-10-05; 2026-10-06 dan SKU rasmi birinchi):** tovar rasmi katalogdan olinadi, eng aniqrog'i birinchi: **SKU'ning o'z rasmi** → **gul** rasmi (gulsiz bo'lmasa) → **rang** rasmi → rang namunasi (hex) → kod harflari. Mato rasmi (Katalog → Matolar) tovarlarga o'tmaydi — faqat mato tanlash chipida. Rasm uch joyda: tovarlar to'rida, tanlangan tovarda (katta) va savat qatorida. Tanlangan tovar yonida uning tarkibi — mato, rang, gul — har biri o'z rasmi/namunasi bilan kichik ko'rinadi. Gul **doim** ko'rsatiladi, gulsiz tovarda ham ("Gul: Gulsiz") — rang bosilganda tovar o'zi tanlangan bo'lsa, guli noma'lum qolmasin. Skaner, qidiruv yoki chiplar — qaysi yo'l bilan tanlanmasin, ko'rinish bir xil. Rasm gul yoki matoniki bo'lsa (rangniki emas), to'r katakchasida rasm burchagida **rang nuqtasi** turadi — bir matoning oq va qorasi bir xil rasm bilan chiqib, adashtirmasin.
   - **Mato → rang → gul — ketma-ket, bir-biriga bog'liq (2026-10-05, foydalanuvchi qarori):** avval mato tanlanadi; shundan keyin shu matoning ranglari chiqadi (qoldig'i bilan); rang tanlangach — shu mato va rangning gullari ("Gulsiz" ham variant). Keyingi qadam oldingisi tanlanmaguncha ko'rinmaydi. Har qadamda to'r shunga torayadi. Tanlangan qiymat yonidagi × uni va undan keyingi qadamlarni olib tashlaydi (mato × — rang va gul ham tozalanadi). Rang tanlanganda shu rangda bitta tovar bo'lsa (gul varianti yo'q) — tovar o'zi tanlanadi. Qiymat 10 tadan ko'p bo'lsa — chiplar o'rniga qidiruvli tanlov. Tovar savatga qo'shilgach yoki sotilgach tanlov **boshiga qaytadi** (mato ham tozalanadi) va kursor skaner maydonida turadi — ketma-ket skanerlash uchun: skaner → metr → qo'shish → skaner … (2026-10-06, foydalanuvchi qarori; avval mato tanlovi qolardi). (Bir kun "uchta mustaqil filtr" sinab ko'rildi — rad etildi.)
   - **Ko'rinish (sotuvchi, 2026-10-05):** tovar tanlanmaganda ekran butun enni ishlatadi (planshetda to'r 3–4 ustun); tovar tanlangach forma o'rtada, tor — metr / kg / narx bir qarashda. To'r katakchasida: rasm, kod, nom, qoldiq (tugagani qizil va xira), tavsiya narx (bo'lsa).
2. **Partiya:** skanerda — aniq. Qo'lda tanlanganda shu do'konda bir nechta partiya bo'lsa — avtomatik **eng eskisi**; sotuvchi boshqasini tanlay oladi
3. **Miqdor:** metr YOKI kg kiritiladi → ikkinchisi partiya koeffitsienti bo'yicha avtomatik
4. **Narx (1 metr uchun):** biznes egasi yoki omborchi belgilagan narx (katalog / kirim) tovar tanlanishi bilan **o'zi qo'yiladi** (2026-10-03, biznes qarori) — "Tavsiya narx bo'yicha"
   - sotuvchi kerak bo'lsa o'zgartiradi; o'zgartirsa — "Tavsiya narxni qaytarish" tugmasi chiqadi, farq "Narx og'ishi" hisobotida ko'rinadi
   - partiya almashtirilsa, narx o'zgartirilmagan bo'lsa — yangi partiyaning tavsiya narxi qo'yiladi (kg narxi koeffitsientga bog'liq)
   - jami summa avtomatik: metr × narx (do'kon POS'laridagi kabi)
5. **Tez sotish (2026-10-03, biznes qarori):** savat bo'sh bo'lsa, savat ko'rinmaydi — to'lov turi va **"Sotish"** tovar formasining o'zida: bitta tovar bir bosishda sotiladi. Nasiyada "Mijozni tanlash" — qator savatga tushadi va mijoz so'raladi. Qoldiqdan ko'p bo'lsa — qator savatga tushadi va izoh so'raladi. Enter "Yana qo'shish"ni bosadi (tasodifiy Enter sotib yubormaydi).
6. **Yana qo'shish** → xaridor bir nechta tovar olsa: qator savatga tushadi, savat ochiladi, 1-4 takrorlanadi; to'lov turi va **Yakunlash** savat ostida
7. **Natija** → qoldiq kamayadi, ekran yangi sotuvga tayyor (tanlov boshiga qaytadi, kursor skaner maydonida)

### Ekran tuzilishi — keng ekran (planshet yotiq, ≥1024px): ikki panel (2026-10-05, foydalanuvchi qarori)
Sabab: asosiy yo'l — skaner, undan keyin darhol miqdor va narx yoziladi; sotuvlarning ko'pi bitta qatorli; narx tez-tez
o'zgartiriladi; tizim klaviaturasi ekranning yarmini yopadi. Shuning uchun joylashuv bitta va o'zgarmas:
- **"Ko'p sotiladigan" qatori olib tashlandi (2026-10-06, foydalanuvchi qarori)** — ekranda faqat mato → rang → gul va
  tovarlar to'ri. To'r katakchasida har doim to'liq belgi: rasm yoki rang namunasi (kvadrat); o'ngda tanlangan tovar
  to'rda ham belgilanadi. Chek bo'sh paytda o'ng panelda belgili ko'rsatma turadi.
- **Savat o'ng panelda — kassa cheki kabi (2026-10-06):** har qator ikki satr — tovar nomi va partiya / narx, ostida
  miqdor va summa; tahrirlash va o'chirish tugmalari qator boshida. Jami ostida **Yakunlash** panelning to'liq kengligida.
  Tovar tanlanmagan paytda o'ng panel tepasida faqat ixcham ko'rsatma turadi — joy savatga qoladi.
- **Jami-dok (2026-10-11):** jami, to'lov turi va "Yakunlash" bitta dok bo'lib o'ng panelning ko'rinadigan qismi
  pastiga yopishadi (panel aylantirilsa ham joyidan jilmaydi). Nasiyada mijoz tanlash va boshlang'ich to'lov dok
  tepasida aylanadi — "Yakunlash" hech qachon ekrandan chiqib ketmaydi.
- **Bir nechta chek (2026-10-06, foydalanuvchi qarori — kassadagi "1 / 2" kabi):** sotuvchi bir mijozni kutib turganda
  boshqasiga xizmat qiladi. Cheklar qatori (**1, 2, … +**) savat ochiq bo'lsa savat sarlavhasida turadi (alohida qator
  egallamaydi, 2026-10-11); savat bo'sh bo'lsa — panel tepasida. Qoidalar:
  - Ko'pi bilan **5 ta** ochiq chek. "+" faqat joriy chekda tovar bo'lsa ishlaydi (bo'sh chekdan yangisi ochilmaydi).
  - Chek raqami o'zgarmaydi (2-chek yopilsa, 3-chek 3 bo'lib qoladi); yangi chek eng kichik bo'sh raqamni oladi.
  - Har chekning o'z savati, to'lov turi, mijozi va **o'z identifikatori** (`client_uuid`) bor — chekdan chekka o'tish
    identifikatorni o'zgartirmaydi.
  - Chek belgisida jami summa ko'rinadi; javobi kelmagan (noaniq) chekda — ogohlantirish belgisi. **Faqat o'sha chek
    qulflanadi**, qolganlarida sotuv davom etadi. Internet tiklanganda har noaniq chek o'zi qayta yuboriladi.
  - Bo'sh qolgan chek undan chiqilganda o'zi yopiladi (kamida bitta chek doim bor). Sotuv yakunlangan chek bo'shaydi.
  - Saqlash: 1-chek avvalgi kalitda (`mato.cart.<xodim>.<do'kon>`) — eski savat, jumladan noaniq sotuv, yo'qolmaydi;
    qolganlari `mato.cart.<xodim>.<do'kon>.<raqam>` kalitida (raqam qo'shimchasi bilan); ochiq cheklar ro'yxati — `mato.checks.<xodim>.<do'kon>`.
  - Server tomoni o'zgarmaydi: har chek — oddiy sotuv.
  - Telefonda ham ishlaydi (qator forma tepasida).
- **Chap panel — topish:** skaner / qidiruv; mato (rasmli chiplar, qatorlarga bo'linadi — hech biri kesilmaydi) → rang → gul; tovarlar to'ri (qoldig'i
  tugaganlar oxirida). Tovar tanlangandan keyin ham chap panel joyida qoladi — boshqa tovar bir bosishda almashtiriladi.
- **O'ng panel — sotuv (doim ko'rinadi, yopishib turadi):** tanlangan tovar (rasm, tarkib, partiya, qoldiq); kg / metr /
  1 metr narxi; **ekran raqam klaviaturasi** (faol maydonga yozadi; tizim klaviaturasi ochilmaydi, tashqi klaviatura
  ishlayveradi); qator jami — katta; to'lov turi; "Yana qo'shish" va "Sotish". Tovar tanlanmagan bo'lsa — qisqa yo'riq.
  Savatda qator bo'lsa — savat, jami va "Yakunlash" ham shu panelda, formaning ostida.
- Narx tavsiyadan farq qilsa — farqi yonida ko'rinadi: "tavsiyadan 5 000 so'm arzon / qimmat".
- Tor ekranda (telefon, tik planshet) — avvalgidek bitta ustun (quyida); raqam klaviaturasi yo'q (tizimniki ochiladi).

### Ekran tuzilishi — tor ekran (eskiz tasdiqlangan ko'rinish)
- Bitta ustun: yuqorida tovar kiritish qatori (skaner/tovar, metr, kg, 1 metr narxi + tavsiya tugmasi, "Qo'shish")
- Ostida kiritilgan tovarlar **ro'yxat** bo'lib tushadi
- Kontent oqimida: jami summa va to'lov turi (naqd / karta / nasiya)
- **Pastki savat paneli (2026-10-11):** savatda qator bo'lsa, pastki menyu tepasida doim ko'rinadigan panel —
  savat belgisi (qator soni bilan), jami summa va "Yakunlash". Belgi bosilsa savatga olib tushadi. Sotuvchi tovar
  tanlayotganda ham jami ko'z oldida; "Yakunlash" faqat shu panelda (takrorlanmaydi). Noaniq (javobi kutilayotgan)
  sotuvda panel ko'rinmaydi — qayta yuborish tepadagi ogohlantirishda.
- Pastki menyu: Sotuv, Bugungi sotuvlarim, Mijozlar, Qoldiq, Ko'chirishlar, Partiyani yopish

### Savat (ro'yxat)
- Har qator: tartib raqami, SKU, partiya, metr, kg, 1 metr narxi, summa
- Qatorni tahrirlash va o'chirish (yakunlashdan oldin)
- Pastda: jami summa, to'lov turi; "Yakunlash" — keng ekranda dokda, telefonda pastki savat panelida (2026-10-11)

### Ekranda doim
- Sotuvchi ism-familiyasi, qulf tugmasi (00-modul)
- "Bugungi sotuvlarim" — sotuvchining bugungi sotuvlari ro'yxati

## Sotuvlar ro'yxati (biznes egasi)
- Ustunlar: sana-vaqt, do'kon, sotuvchi, mijoz (nasiya bo'lsa), summa, to'lov turi, holat (yakunlangan / qisman qaytarilgan / bekor qilingan)
- Filtr: davr, do'kon, sotuvchi, to'lov turi, holat
- Qidiruv: sotuv raqami, mijoz

## Sotuv kartochkasi
- Sarlavha: sotuv raqami, sana-vaqt, do'kon, sotuvchi, mijoz
- Qatorlar: SKU, partiya, metr, kg, tavsiya narx, haqiqiy narx, jami
- To'lov: turi, boshlang'ich to'lov, qarz
- Qaytarishlar tarixi
- Amallar: Qaytarish, Bekor qilish (ruxsatga qarab)

## Narx
- Sotuvchi uchun narx doim **1 metr** uchun. SKU narxi kg da bo'lsa, partiya koeffitsienti bo'yicha metrga o'girib ko'rsatiladi.
- Narx chegarasi yo'q (javobgarlik sotuvchida).
- Har qatorda **tavsiya narx ham, haqiqiy narx ham** saqlanadi — "narx og'ishi" hisoboti uchun (08).
- Narxni faqat biznes egasi va omborchi belgilaydi (katalog, kirim); sotuv ekranida u o'zi qo'yiladi.
- Tavsiya narx yo'q bo'lsa — "Tavsiya narx yo'q", sotuvchi o'zi yozadi.

## To'lov
- Turlari: naqd, karta, nasiya. Boshqa turlar va aralash to'lov — hozircha yo'q.

## Qaytarish (sotuvchi o'zi qiladi)
1. Asl sotuv topiladi: sana, sotuvchi yoki mijoz bo'yicha qidiruv
2. Qaytariladigan qator va metr tanlanadi (sotilgandan ko'p emas, avval qaytarilganni hisobga olib)
3. Qaytariladigan summa avtomatik: metr × sotilgan narx
4. Pul qaytarish: naqd yoki karta; asl sotuv nasiya bo'lsa — mijoz qarzidan ayriladi
5. Metr **shu do'kondagi** o'sha partiya qoldig'iga qaytadi; partiya shu joyda yopilgan bo'lsa — avtomatik qayta ochiladi
- Muddat cheklovi yo'q.
- Har qaytarish biznes egasiga tizim ichidagi xabar sifatida boradi va jurnalga yoziladi.
- Asl sotuvsiz qaytarish mumkin emas.

## Sotuvni bekor qilish (xato kiritilgan)
- Sotuvchi o'z sotuvini **10 daqiqa ichida** bekor qiladi; keyin — faqat biznes egasi.
- Bekor qilinganda qoldiq va nasiya avtomatik tiklanadi.
- Sabab yozish majburiy.

## Biznes qoidalari
- Manfiy qoldiqqa tushadigan sotuvda izoh majburiy (05-ombor).
- Yopilgan partiyadan sotib bo'lmaydi.
- Sotuv qurilma bog'langan do'konga va PIN bilan kirgan sotuvchiga yoziladi.
- Barcha sotuv, qaytarish, bekor qilish jurnalga ("Sotuv").
- Internet kerak (oflayn rejim yo'q).

## Chekka holatlar
- Internet sotuv paytida uzilsa → savat qurilmada saqlanib qoladi, ulanish tiklangach qayta yuboriladi; bitta sotuv ikki marta yozilmasligi kafolatlanadi.
- **Natija noaniq bo'lsa savat qulflanadi (2026-10-03, audit):** savat so'rovdan oldin "yuborildi" deb belgilanadi. Javob kelmasa, vaqt tugasa yoki server 5xx qaytarsa (sotuv yozilgan bo'lishi mumkin) — savat o'zgartirilmaydi, sahifa yangilansa ham qulf turadi va o'sha savat o'sha identifikator bilan qayta yuboriladi. Identifikator faqat server aniq rad etganda (4xx) yoki sotuv tasdiqlanganda yangilanadi. Server: mavjud identifikator bilan kelgan savat saqlangan sotuvdan farq qilsa — 409 "Bu savat avval S-… raqami bilan yozilgan".
- Savat ikki oynada ochiq bo'lsa — ikkalasi bitta savatni ko'rsatadi (biri yuborsa, ikkinchisi ham qulflanadi). Boshqa sotuvchi PIN bilan kirsa, oldingi sotuvchining tasdiqlanmagan sotuvi ekranda eslatma bo'lib ko'rinadi; u o'sha sotuvchi kirgach qayta yuboriladi (sotuv o'z egasining nomiga yoziladi).
- Skaner kodi topilmasa → "Partiya yoki tovar topilmadi", qo'lda tanlashga o'tish.
- Partiya do'konda **yopilsa** — sotuv ekranida (to'r va qidiruvda) ko'rinmaydi; tovarning shu do'konda boshqa ochiq partiyasi qolmasa, tovarning o'zi ham chiqmaydi. Yopilgan partiyani sotishga urinish serverda ham rad etiladi (`batch_closed`). Qaytarish yoki bekor qilish partiyani qayta ochsa — yana ko'rinadi.
- **Doimiy kamera skaneri** (ixtiyoriy, qurilmada yoqiladi): sotuv ekranida kamera yoqiq turadi — etiketka ko'rsatilsa tovar o'zi tanlanadi; bir etiketka qayta-qayta qo'shilmaydi; tovar tanlanganda pauza; boshqa oynaga o'tilsa kamera o'chadi. Kadrlar saqlanmaydi va yuborilmaydi.
- Kamera: faqat xavfsiz ulanishda (https) ishlaydi; ruxsat berilmasa yoki kamera yo'q bo'lsa — tushunarli xabar, qo'l skaneri / qidiruv ishlayveradi.
- Skaner qilingan partiya shu do'konda yo'q (boshqa joyda) → "Bu partiya shu do'konda yo'q".
- Avto-qulflash savat to'la paytda → savat saqlanadi, faqat shu sotuvchi PIN'i bilan davom etadi.
- Koeffitsient yo'q partiyada kg kiritilsa → "Bu partiya uchun kg ↔ metr belgilanmagan, metrda kiriting".

## AI xulosasi

✅ Qilsa bo'ladi
- Do'kon POS'lariga o'xshash oqim — sotuvchilar uchun tanish.
- Skaner + tavsiya narx tugmasi bilan bitta tovarni ~4 bosishda sotish mumkin.
- Tavsiya va haqiqiy narxni birga saqlash — qo'shimcha ishsiz kuchli tahlil.

⚠️ Qiyin yoki xavfli
- Qaytarishni sotuvchi o'zi, muddatsiz va pul bilan qiladi — soxta qaytarish orqali kassadan pul olish mumkin. Asl sotuvga bog'lanish va miqdor chegarasi buni qisman to'sadi.
- Internet uzilishida bir sotuvning ikki marta yozilishi — kodda maxsus himoya (har sotuvga noyob identifikator) kerak.
- Qo'lda tanlashda noto'g'ri partiya kamomadni buzadi — skanerdan foydalanishni rag'batlantirish kerak.

💡 Takliflar
- Har qaytarish biznes egasiga tizim ichidagi xabarlarda (09) va jurnalda ko'rinadi — Telegram orqali emas (biznes egasi qarori).
