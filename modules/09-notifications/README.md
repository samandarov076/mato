# 09 — Bildirishnomalar

## Modul nima qiladi
Tizim ichidagi xabarlar: muhim hodisalar kerakli odamga yetadi — qo'ng'iroqchada son, Xabarlar sahifasida matn va tegishli sahifaga havola. Real vaqtda (sahifani yangilamasdan). Telegram — 10-modulda.

## Sahifalar
| Sahifa | Yo'l | Kim | Fayl |
|--------|------|-----|------|
| Xabarlar (ro'yxat, hodisa turi bo'yicha filtr, "hammasini o'qilgan qilish") | `/notifications` | ega, omborchi, sotuvchi | `frontend/src/modules/notifications/NotificationsPage.tsx` |
| Qo'ng'iroqcha (o'qilmaganlar soni) — yuqori panelda, ikkala qobiqda | — | hamma | `modules/notifications/Bell.tsx` |

Matn va havolalar: `modules/notifications/messages.ts` (hodisa kodi → foydalanuvchi tilidagi matn + sahifa).

## Kim ishlatadi
Biznes egalari (asosiy oluvchilar), qabul qiluvchi xodimlar (sotuvchi, omborchi)

## Bog'liqliklar
- **Bog'liq:** 00-core
- **Bunga bog'liq:** 05-inventory, 06-sales, 07-credit (uchalasi ulangan), 10-telegram

## Batafsil
`docs/03-details/09-bildirishnomalar.md`

## Kod
- `backend/app/modules/notifications/` — `models` (Notification), `service` (yuborish, ro'yxat, o'qilgan qilish, oqim), `router`, `schemas`
- `backend/app/modules/inventory/alerts.py` — kam qoldiq tekshiruvi (har qoldiq harakatidan keyin)
- `backend/app/worker.py` — fon vazifalari (arq): 24 soat qabul qilinmagan ko'chirish eslatmasi
- `backend/app/core/db.py` → `after_commit` — signal faqat ma'lumot saqlangandan keyin ketadi
- `backend/alembic/versions/0006_notifications.py`
- `backend/tests/test_notifications.py` — 14 ta test
- `frontend/src/modules/notifications/` — sahifa, qo'ng'iroqcha, `NotificationsPage.test.tsx` (7 ta test)

## API
Har xodim faqat o'z xabarlarini ko'radi.

| Yo'l | Nima qiladi |
|------|-------------|
| `GET /api/notifications` | Ro'yxat (eng yangisi tepada); `event`, `unread_only`, `cursor`, `limit` → `{items, next_cursor, unread}` |
| `GET /api/notifications/unread-count` | O'qilmaganlar soni |
| `POST /api/notifications/{id}/read` · `/read-all` | O'qilgan qilish |
| `GET /api/notifications/stream` | Real vaqt signali (Server-Sent Events): yangi xabar yozilganda `data: new` |

## Hodisalar
| Kod | Qachon | Kimga | Holat |
|-----|--------|-------|-------|
| `transfer.arrived` | Ko'chirish jo'natildi | Qabul qiluvchi joy xodimlari (do'kon — sotuvchilar, sklad — omborchilar) | ✅ |
| `transfer.diff` | Ko'chirish farq bilan qabul qilindi | Egalar | ✅ |
| `transfer.waiting` | Ko'chirish 24 soatdan beri qabul qilinmagan | Egalar | ✅ (fon vazifasi) |
| `batch.big_diff` | Partiya 10%+ farq bilan yopildi | Egalar | ✅ |
| `stock.low` | SKU'ning joydagi qoldig'i chegaradan tushdi | Egalar | ✅ |
| `sale.negative_stock` | Qoldiqdan ko'p sotildi (izoh bilan) | Egalar | ✅ (06-sales) |
| `sale.returned` | Mijoz tovarni qaytardi | Egalar | ✅ (06-sales) |
| `debt.written_off` | Qarz hisobdan chiqarildi (sababi bilan) | Egalar | ✅ (07-credit) |
| `debt.overdue` | Qarz muddati o'tdi | Egalar | ✅ (07-credit, fon vazifasi) |
| `telegram.disconnected` | Ega botni blokladi — Telegram uzildi | O'sha ega | ✅ (10-telegram) |
| zaxira nusxa olinmadi | — | Platforma egasi | hosting bosqichida |

## Qoidalar (kodda qanday bajarilgan)
- **Xabar matn emas** — hodisa kodi + ma'lumot; har kim o'z tilida o'qiydi (uz / en / ru).
- **Xabar amal bilan bitta tranzaksiyada** yoziladi: amal bekor bo'lsa, xabar ham yo'q. Real vaqt signali faqat saqlangandan keyin ketadi.
- **Bir hodisa — bir xabar:** kam qoldiq xabari qoldiq chegaradan tushganda bir marta keladi; tovar to'ldirilib yana tushsagina takrorlanadi (har sotuvda emas). Eslatma ham har ko'chirish uchun bir marta.
- **Ega o'zi qilgan ish haqida o'ziga xabar olmaydi** (masalan, o'zi farq bilan qabul qilgan ko'chirish) — boshqa egalar oladi.
- **Ish bajarilsa, xabar o'zi yopiladi:** ko'chirish qabul qilinsa yoki bekor bo'lsa, "qabul qiling" va "kutyapti" xabarlari hammada o'qilgan bo'ladi.
- **Faolsiz xodimga xabar yozilmaydi.**
- **Real vaqt:** brauzer oqimga ulanadi; signal kelganda xabarlar va ombor sahifalari qayta olinadi. Oqim 10 daqiqada o'zi yopilib qayta ulanadi (sessiya yana tekshiriladi); uzilsa ham son har daqiqada yangilanadi.
- Kam qoldiq chegarasi: SKU'niki, bo'lmasa biznes standarti; ikkalasi ham yo'q — xabar kelmaydi.

## Keyingi modullarga qoldirilgan
- **10-telegram** (yozildi): `transfer.diff` va `batch.big_diff` saqlangach Telegram navbatiga ham qo'yiladi (`TELEGRAM_INSTANT`).
- Fon vazifalari ishchisi (`arq app.worker.WorkerSettings`) serverda alohida xizmat sifatida ishga tushiriladi — hosting sozlanganda.

## Tekshirish
```bash
cd backend && pytest tests/test_notifications.py
cd frontend && npm test
```
Qo'lda: ikki oynada kiring (ega va do'kon qurilmasidagi sotuvchi) → ega ko'chirish jo'natsa, sotuvchida qo'ng'iroqcha soni darhol oshadi.

## Holat
✅ Tugadi (2026-10-02) — tizim ichidagi qism. Sotuv va nasiya hodisalari o'z modullarida ulanadi.

## AI xulosasi (modul yakuni)
- **Rejadagidek bo'lmagan:** kam qoldiq tekshiruvi fonda emas, qoldiq harakati bilan bir vaqtda bajariladi (bir necha kichik so'rov) — soddaroq va xabar hech qachon yo'qolmaydi; sekinlashsa navbatga ko'chiriladi. Hujjatdagi ro'yxatga "ish bajarilsa xabar o'zi yopiladi" qoidasi qo'shildi.
- **Texnik qarz:** eski xabarlar tozalanmaydi (hajm oshsa — 90 kundan eski o'qilganlarni o'chirish); oqim ochilgandan keyin sessiya 10 daqiqagacha qayta tekshirilmaydi (faqat "yangi xabar bor" signali o'tadi, mazmun emas); ishchi (arq) lokalda qo'lda ishga tushiriladi.
- **Keyingi modulda e'tibor:** 06-sales yangi hodisa qo'shganda uchta joy yangilanadi — `notify_owners(...)` chaqiruvi, `messages.ts` dagi matn/havola va `EVENTS` ro'yxati, uch tildagi tarjima.
