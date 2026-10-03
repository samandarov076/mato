# 07 — Nasiya

## Modul nima qiladi
Mijozlar va ularning qarzlari: kimning qancha qarzi bor, qaysi biri muddatidan o'tgan; qarz to'lovini qabul qilish (eng eski qarzdan boshlab), qarzni hisobdan chiqarish (sababi bilan), muddati o'tgan qarz haqida egalarga xabar. Nasiya sotuvning o'zi — 06-sales da.

## Sahifalar
| Sahifa | Yo'l | Kim | Fayl |
|--------|------|-----|------|
| Mijozlar (qarz, muddati o'tgani, qidiruv, filtr, saralash, mijoz qo'shish) | `/customers` | ega (menyuda "Nasiya"), sotuvchi (pastki menyuda "Mijozlar") | `frontend/src/modules/credit/CustomersPage.tsx` |
| Mijoz kartochkasi: nasiya sotuvlar, to'lovlar va hisobdan chiqarishlar tarixi; to'lov qabul qilish, hisobdan chiqarish, tahrirlash | `/customers/:id` | ega, sotuvchi | `CustomerPage.tsx` |
| Mijoz tanlovi (sotuv ekranida) va yangi mijoz formasi | — | ega, sotuvchi | `CustomerPicker.tsx` |

## Kim ishlatadi
Sotuvchi, biznes egasi. Omborchiga yopiq.

## Bog'liqliklar
- **Bog'liq:** 00-core, 06-sales (qarz nasiya sotuvdan paydo bo'ladi), 09-notifications
- **Bunga bog'liq:** 06-sales (mijoz tanlovi, qarzni ochish / kamaytirish / bekor qilish), 08-reports

## Batafsil
`docs/03-details/07-nasiya.md`

## Kod
- `backend/app/modules/credit/` — `models` (Customer, Debt, DebtPayment, PaymentAllocation, DebtWriteoff), `service`, `router`, `schemas`
- `backend/alembic/versions/0008_credit.py` — `debt_payments`, `payment_allocations`, `debt_writeoffs` (`customers`, `debts` — 7-migratsiyada)
- `backend/app/worker.py` → `remind_overdue_debts` — muddati o'tgan qarz xabari (har soatda tekshiradi)
- `backend/tests/test_credit.py` — 10 ta test
- `frontend/src/modules/credit/` — sahifalar, `CustomerPage.test.tsx` (7 ta test)
- Ulangan joylar: `notifications/messages.ts` (2 hodisa), `core/JournalPage.tsx`, `sales/SaleCardPage.tsx` (mijozga havola), `app/router.tsx`, `app/nav.ts`, `app/StoreShell.tsx`

## API
Biznes egalari va sotuvchilar uchun. Mijoz biznes bo'yicha umumiy — sotuvchi istalgan mijozning qarzini ko'radi va to'lovini qabul qiladi.

| Yo'l | Nima qiladi |
|------|-------------|
| `GET /api/customers` | Ro'yxat: `search`, `only` (`debtors` / `overdue`), `sort` (`name` / `debt` / `oldest`), `include_inactive`, `limit`, `offset` → `{items, total, debt_total, overdue_total}` |
| `GET /api/customers/search?q=` | Sotuv ekranidagi tezkor tanlov (06) |
| `POST /api/customers` | Mijoz qo'shish (ism, telefon, izoh); telefon band bo'lsa — 409 va mavjud mijoz |
| `GET /api/customers/{id}` | Kartochka: qarzlar (har nasiya sotuv), to'lovlar (qaysi qarzlarga yozilgani bilan), hisobdan chiqarishlar |
| `PATCH /api/customers/{id}` | Ism, telefon, izohni o'zgartirish |
| `POST /api/customers/{id}/active` | Faolsizlantirish / qayta faollashtirish |
| `POST /api/customers/{id}/payments` | To'lov: `amount`, `method`, ixtiyoriy `debt_id` → `{id, amount, debt}` |
| `POST /api/debts/{id}/writeoff` | Hisobdan chiqarish: `amount`, `reason` |

## Qoidalar (kodda qanday bajarilgan)
- **Qarz har nasiya sotuvdan alohida.** Qolgan qarz = `amount − paid − written_off − returned`; mijozning umumiy qarzi — faol qarzlar yig'indisi.
- **Muddat** qarz yaratilganda qotiriladi (sotuv kuni + sozlamadagi kun); sozlama keyin o'zgarsa, eski qarzlar siljimaydi. "Muddati o'tgan" — muddati bugundan oldin (biznes vaqti bo'yicha) va hali yopilmagan qarz.
- **To'lov** avtomatik eng eski qarzdan boshlab yopadi; sotuvchi aniq sotuvni tanlasa — faqat o'sha qarz. Qarzdan ko'p to'lov qabul qilinmaydi (umumiy qarz yoki tanlangan qarz chegarasi). Bitta to'lov bir nechta qarzga taqsimlanishi mumkin — har biriga qancha tushgani saqlanadi va tarixda ko'rinadi.
- **Bir vaqtdagi ikki to'lov** (yoki to'lov va qaytarish) ortiqcha yozilmaydi: qarz qatorlari qulflanadi.
- **Pul qaysi do'konga yoziladi:** sotuvchida — qurilma bog'langan do'kon; ega qurilmasiz qabul qilsa — yopilayotgan (eng eski) qarz berilgan do'kon.
- **Hisobdan chiqarish:** to'liq yoki qisman, sabab majburiy, qolgan qarzdan oshmaydi. Egalarga xabar boradi (amalni bajargan eganing o'ziga emas) va jurnalga yoziladi.
- **To'lov va hisobdan chiqarish yozuvlari o'zgartirilmaydi va o'chirilmaydi** (ilova rolida faqat qo'shish huquqi).
- **Mijoz:** telefon biznes ichida noyob (`+998…`); o'chirilmaydi; qarzi bo'lsa faolsizlantirilmaydi; faolsiz mijoz ro'yxat va tanlovda ko'rinmaydi, unga nasiya berilmaydi, tarixi saqlanadi.
- **Sotuv bilan bog'liqlik (06):** qaytarishda summa avval shu sotuvning qolgan qarzidan ayriladi; qarziga to'lov yoki hisobdan chiqarish tushgan sotuv bekor qilinmaydi.
- **Muddati o'tgan qarz xabari** har qarz uchun bir marta keladi; qarz yopilsa (to'lov, hisobdan chiqarish, qaytarish, bekor qilish) — xabar o'zi o'qilgan bo'ladi.
- **Jurnal ("Nasiya"):** `customer.created / updated / deactivated / activated`, `debt.paid`, `debt.written_off`.

## Keyingi modullarga qoldirilgan
- **08-reports:** nasiya hisoboti (jami va muddati o'tgan qarz, to'lovlar tushumi do'kon va to'lov turi bo'yicha), dashboard'dagi "Nasiya" kartochkasi.
- **10-telegram:** hisobdan chiqarilgan qarz — darhol Telegram xabari (hujjatdagi 7-hodisa).

## Tekshirish
```bash
cd backend && pytest tests/test_credit.py
cd frontend && npm test
```
Qo'lda: nasiya sotuv qiling (06) → **Nasiya** bo'limida mijozni oching → "To'lov qabul qilish"; qarz qatorida "Hisobdan chiqarish". Muddati o'tgan qarz xabarini ko'rish uchun fon ishchisi kerak: `cd backend && arq app.worker.WorkerSettings`.

## Holat
✅ Tugadi (2026-10-02)

## AI xulosasi (modul yakuni)
- **Rejadagidek bo'lmagan:**
  - **"Nasiya o'chirilsa bo'lim ko'rinmaydi" qoidasi o'zgartirildi:** sozlama o'chirilganda yangi nasiya berilmaydi, lekin bo'lim ko'rinib turadi — aks holda mavjud qarzlarni undirib bo'lmas edi. Sozlamadagi izoh matni ham shunga moslandi.
  - "Qarz to'lovi" va "Hisobdan chiqarish" alohida sahifa emas — mijoz kartochkasining ichida ochiladi (kamroq o'tish).
  - `debt_payments.store_id` majburiy: ega qurilmasiz qabul qilgan to'lov qarz berilgan do'konga yoziladi — tushum hisobotida "do'konsiz" pul qolmaydi.
  - Mijozlar ro'yxatidagi "muddati o'tganlar" filtri "30+ kun" emas, qarzning o'z muddati bo'yicha (sozlamadagi kun o'zgarsa ham to'g'ri ishlaydi).
- **Texnik qarz:**
  - **Hisobdan chiqarish orqali firibgarlik xavfi** (hujjatdagi ⚠️): sotuvchi mijozdan naqd olib, qarzni "kechirilgan" deb yozishi mumkin. Himoya — majburiy sabab, egaga darhol xabar, jurnal. Limit yoki ega tasdig'i yo'q — pilotda kuzatiladi; kerak bo'lsa "sotuvchi faqat N so'mgacha" sozlamasi qo'shiladi.
  - Xato kiritilgan to'lovni bekor qilish yo'q (yozuvlar o'zgarmas) — kerak bo'lsa "to'lovni qaytarish" amali qo'shiladi.
  - Muddati o'tgan qarz xabari fon ishchisiga bog'liq (lokalda qo'lda ishga tushiriladi).
  - Mijoz kartochkasida to'lovlar tarixi oxirgi 200 ta bilan cheklangan; qarzlar sahifalanmagan.
- **Keyingi modulda e'tibor:** 08-reports tushumni hisoblaganda uch manbani qo'shsin — naqd/karta sotuvlar, nasiya sotuvning boshlang'ich to'lovi (`sales.initial_payment`), qarz to'lovlari (`debt_payments`); pul bilan qaytarilgan summa (`sale_returns.amount − debt_amount`) ayriladi.
