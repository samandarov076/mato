# 08 — Hisobotlar

## Modul nima qiladi
Biznes egasi uchun raqamlar: bosh sahifa (dashboard) va hisobotlar — savdo, tushum, foyda, soatlar bo'yicha trend, top tovarlar, qoldiq qiymati, nasiya, narx og'ishi. Har hisobotda davr / do'kon / sotuvchi / mato filtri, o'tgan davr bilan taqqoslash va Excel'ga yuklab olish. Yangi ma'lumot kiritilmaydi — hammasi oldingi modullarda yig'ilgan ma'lumotdan hisoblanadi.

## Sahifalar
| Sahifa | Yo'l | Fayl |
|--------|------|------|
| Bosh sahifa (dashboard): savdo, tushum, foyda; nasiya, kam qoldiq, metr farqi; 30 kunlik grafik; "E'tibor talab qiladi" | `/` (biznes egasi) | `frontend/src/modules/reports/Dashboard.tsx` |
| Hisobotlar qobig'i: varaqlar va umumiy filtrlar | `/reports/*` | `ReportsLayout.tsx` |
| Savdo va foyda (kunlar / oylar) | `/reports` | `SalesReportPage.tsx` |
| Soatlar va hafta kunlari | `/reports/hours` | `HoursReportPage.tsx` |
| Top tovarlar (SKU / mato / rang / gul; savdo / metr / foyda) | `/reports/top` | `TopReportPage.tsx` |
| Qoldiq qiymati (joylar bo'yicha) | `/reports/stock` | `StockReportPage.tsx` |
| Nasiya (hozirgi qarz va davr ichidagi harakat) | `/reports/credit` | `CreditReportPage.tsx` |
| Narx og'ishi (tovar / sotuvchi bo'yicha) | `/reports/price-deviation` | `DeviationReportPage.tsx` |
| Metr farqi | `/differences` (05-inventory sahifasi — varaqlarda havola) | — |

Umumiy qismlar: `parts.tsx` (o'zgarish belgisi, ustunli grafik, Excel tugmasi, jadval), `types.ts` (davr yordamchilari).

## Kim ishlatadi
Faqat biznes egalari. Omborchi va sotuvchiga yopiq (omborchining bosh sahifasi — Qoldiq, sotuvchiniki — sotuv ekrani).

## Bog'liqliklar
- **Bog'liq:** 04-receiving (tannarx), 05-inventory (qoldiq, metr farqi), 06-sales, 07-credit, 09-notifications (dashboard'dagi xabarlar)
- **Bunga bog'liq:** 10-telegram (kunlik xulosa shu hisob-kitobdan olinadi: `reports.service.totals`)

## Batafsil
`docs/03-details/08-hisobotlar.md`, eskiz — `docs/04-eskizlar.md` (3-eskiz), `docs/sketches/dashboard.html`

## Kod
- `backend/app/modules/reports/` — `service` (hisob-kitob), `router`, `schemas`, `export` (Excel), `labels` (Excel sarlavhalari uch tilda)
- `backend/tests/test_reports.py` — 12 ta test: bir kunlik savdo ssenariysi, har ko'rsatkich qo'lda hisoblangan qiymat bilan solishtiriladi
- `frontend/src/modules/reports/` — sahifalar, `reports.test.tsx` (10 ta test)
- Yangi jadval va migratsiya yo'q.

## API
Hammasi faqat biznes egasiga. Umumiy filtr: `date_from`, `date_to` (majburiy, ko'pi bilan bir yil), `store_id`, `seller_id`, `fabric_id`.

| Yo'l | Nima qaytaradi |
|------|----------------|
| `GET /api/reports/dashboard?period=day\|week\|month&store_id=` | Joriy va oldingi davr ko'rsatkichlari, nasiya (jami, muddati o'tgan), kam qoldiqdagi SKU soni, metr farqi, 30 kunlik savdo |
| `GET /api/reports/sales?group=day\|month` | Davr qatorlari, jami, oldingi shunday davr |
| `GET /api/reports/hours` | Soatlar (0–23) va hafta kunlari bo'yicha sotuvlar soni va summasi |
| `GET /api/reports/top?by=sku\|fabric\|color\|pattern&metric=amount\|meters\|profit&limit=` | Top tovarlar |
| `GET /api/reports/stock` | Har joyda: metr, taxminiy rulon, tannarx bo'yicha qiymat, SKU soni, kam qoldiq |
| `GET /api/reports/credit` | Hozirgi qarz; davrda berilgan nasiya, qaytgan qarz, hisobdan chiqarilgan |
| `GET /api/reports/price-deviation?by=sku\|seller` | Tavsiya narxda va haqiqatda, farq (so'm, %) |
| `GET /api/reports/<hisobot>/export` | Shu ma'lumot Excel faylida (`.xlsx`), sarlavhalar foydalanuvchi tilida |

## Hisob-kitob qoidalari (kodda qanday bajarilgan)
- **Savdo** = sotuvlar summasi − qaytarishlar. **Qaytarish qaytarilgan kunning savdosidan ayriladi** (sotilgan kunnikidan emas).
- **Tushum** = naqd/karta sotuvlar + nasiya sotuvning boshlang'ich to'lovi + qarz to'lovlari − pul bilan qaytarilgani. Naqd va karta alohida. Qarzdan ayirilgan qaytarish tushumga ta'sir qilmaydi (pul harakati yo'q).
- **Foyda** = savdo − sotilgan tovar tannarxi. Tannarx sotuv qatorida saqlangan (sotuv paytidagi) qiymatdan olinadi — kirim keyin tuzatilsa ham eski foyda o'zgarmaydi. Metr farqi va hisobdan chiqarilgan qarz foydaga kirmaydi — o'z joyida alohida ko'rinadi (dashboard'da va hisobotda shu yozilgan).
- **Bekor qilingan sotuv** hech qayerda hisoblanmaydi.
- **Kun chegarasi** — biznes vaqti (Toshkent) bo'yicha.
- **Taqqoslash:** shu uzunlikdagi, bevosita oldingi davr (bugun → kecha; shu hafta → undan oldingi shuncha kun). Oldingi davr 0 bo'lsa, foiz ko'rsatilmaydi.
- **Mato bo'yicha filtr:** savdo va foyda qatorlardan hisoblanadi; tushum hisoblanmaydi (pul matoga bog'lanmaydi).
- **Sotuvchi bo'yicha filtr:** savdo — sotuvni qilgan sotuvchi; tushumda qarz to'lovi va pul qaytarish — shu amalni bajargan xodim.
- **Top tovarlar** sof ko'rsatkichda: qaytarilgan metr va summa ayirilgan.
- **Narx og'ishi:** faqat tavsiya narxi bo'lgan sotuv qatorlari; farq = haqiqatda − tavsiya narxda (manfiy — arzon sotilgan).
- **Qoldiq qiymati** — ochiq partiyalar qoldig'i × partiyaning 1 metr tannarxi.
- **Dashboard** har daqiqada o'zi yangilanadi; "E'tibor talab qiladi" — eganing o'qilmagan xabarlari (bosilsa o'qilgan bo'ladi va sahifasi ochiladi).

## Keyingi modullarga qoldirilgan
- **10-telegram:** kunlik xulosa (21:00) — `reports.service.totals(ctx, Scope(bugun, bugun))` dan.
- Sotuvchilar kesimidagi alohida hisobot — hujjatda "keyinroq" (hozir sotuvchi filtri orqali ko'riladi).

## Tekshirish
```bash
cd backend && pytest tests/test_reports.py
cd frontend && npm test
```
Qo'lda: bir nechta sotuv, qaytarish va qarz to'lovi qiling → bosh sahifadagi raqamlarni **Hisobotlar → Savdo va foyda** bilan solishtiring; "Excel" tugmasi faylni yuklab beradi.

## Holat
✅ Tugadi (2026-10-02)

## AI xulosasi (modul yakuni)
- **Rejadagidek bo'lmagan:**
  - **`daily_summary` yig'ma jadvali qurilmadi** (sxemada rejalashtirilgan edi). Hisobotlar asl jadvallardan indekslar bilan hisoblanadi: har doim aniq, yig'ma jadvalni har sotuv / qaytarish / to'lov / bekor qilishda yangilash va xato bo'lsa qayta hisoblash kerak emas. Pilot hajmida tez; sekinlashsa yig'ma jadval qo'shiladi (hisob-kitob bitta faylda — `reports/service.py`).
  - Dashboard'da do'kon tanlovi ro'yxat (select) ko'rinishida — eskizdagi tugmalar do'kon ko'p bo'lsa sig'maydi.
  - "Qoldiq" hisobotidagi kam qoldiqdagi SKU ro'yxati alohida emas — Qoldiq sahifasining tayyor filtriga havola.
  - "Nasiya" hisobotida mijozlar kesimi takrorlanmadi — "Nasiya" bo'limiga havola; Excel'da qarzdorlar ro'yxati.
- **Texnik qarz:**
  - Hajm oshganda (oylar, yuz minglab sotuv qatori) bir yillik hisobot sekinlashadi — o'shanda yig'ma jadval yoki materiallashtirilgan ko'rinish.
  - Dashboard bitta ochilishda bir necha so'rov qiladi (joriy davr, oldingi davr, 30 kun) — birlashtirsa bo'ladi.
  - Grafiklar oddiy (kutubxonasiz ustunlar): masshtab chiziqlari va bir necha ko'rsatkichni birga ko'rsatish yo'q.
  - Excel'da faqat jadval (formatlash minimal); PDF yo'q.
  - Soatlar hisobotida qaytarish ayirilmaydi (sotuv payti bo'yicha trend).
- **Keyingi modulda e'tibor:** Telegram kunlik xulosasi shu servisdagi `totals` va `_debt_totals` dan foydalansin — raqamlar dashboard bilan bir xil chiqishi shart.
