# Eskizlar (tasdiqlangan)

## 1. Sotuv ekrani (do'kon qurilmasi)
> 2026-10-05: keng ekranda (≥1024px) ikki panelli tuzilish qabul qilindi — tafsiloti `docs/03-details/06-sotuv.md`, "Ekran tuzilishi — keng ekran". Quyidagi eskiz tor ekran uchun amal qiladi.

- **Yuqori panel:** do'kon nomi; o'ngda "Sotuvchi: Ism Familiya" (doim ko'rinadi), xabarlar qo'ng'iroqchasi (o'qilmaganlar soni), qulf tugmasi.
- **Kiritish qatori** (bitta ustun, karta ichida): Tovar (skaner maydoni + skaner tugmasi; yoki mato → rang → gul tanlash) · Metr · Kg · 1 metr narxi + tavsiya narx tugmasi (bosilsa narx qo'yiladi).
  - Ostida: tovar nomi (mato · rang · gul), partiya raqami belgisi, "1 kg = X m · qoldiq Y m", qator jami, "Qo'shish" tugmasi.
  - Metr kiritilsa kg avtomatik (va aksincha) partiya koeffitsienti bo'yicha.
  - Xato: metr/kg yoki narx yo'q bo'lsa qo'shilmaydi, qizil matn bilan sabab.
- **Ro'yxat:** # · Tovar (ostida partiya va 1 m narxi) · Metr · Kg · Summa · o'chirish.
- **Pastda:** Jami (katta shrift) · Naqd / Karta / Nasiya (bittasi tanlangan) · "Yakunlash" (asosiy tugma). Nasiya tanlansa — yakunlashda mijoz va boshlang'ich to'lov so'raladi.
- **Pastki menyu:** Sotuv · Bugungi sotuvlarim · Mijozlar · Qoldiq · Ko'chirishlar · Partiyani yopish.
- Telefonda ham bitta ustun; kiritish qatori ikki qatorga bo'linadi.

## 2. Ko'chirishni qabul qilish
- **Sarlavha:** "Ko'chirish K-00045", holat belgisi "Yo'lda", "Qayerdan → Qayerga", jo'natuvchi, jo'natilgan vaqt, qabul qiluvchi.
- **Jadval:** Partiya · tovar | Jo'natilgan rulon | Jo'natilgan metr | Kelgan rulon (input) | Kelgan metr (input) | Farq.
  - "Kelgan" maydonlari jo'natilgan qiymatlar bilan oldindan to'ldirilgan.
  - Kelgan rulon o'zgarsa — metr o'rtacha uzunlik bo'yicha qayta hisoblanadi; metrni qo'lda ham tuzatish mumkin.
  - Farq: yo'q bo'lsa "—"; kam — qizil; ortiq — sariq.
- **Izoh** maydoni: farq yo'q bo'lsa ixtiyoriy, farq bo'lsa majburiy.
- **Tugmalar:** "Hammasi to'g'ri — qabul qilish" (asosiy; farq paydo bo'lsa yashirinadi) · "Farq bilan qabul qilish" (izohsiz o'tkazmaydi). Farq bilan qabul qilinsa egalarga xabar.

## 3. Biznes egasi dashboard'i
- **Sarlavha:** "Bugun, sana"; o'ngda do'kon filtri (Barcha do'konlar / har do'kon) — barcha raqamlar va grafik filtrga bo'ysunadi.
- **1-qator kartochkalar:** Savdo (kechagiga nisbatan %) · Tushum (ostida naqd va karta) · Foyda (ⓘ: "Savdo minus tannarx. Metr farqi kirmaydi", kechagiga nisbatan %).
- **2-qator kartochkalar:** Nasiya (ostida qizil: muddati o'tgan) · Kam qoldiq (tovar soni) · Metr farqi, shu oy (so'm, ostida "X m kam chiqdi").
- **Grafik:** savdo, oxirgi 30 kun, ustunli.
- **"E'tibor talab qiladi":** oxirgi muhim xabarlar — farqli ko'chirishlar, qaytarishlar, hisobdan chiqarilgan qarzlar, muddati o'tgan nasiyalar. Bosilsa tegishli sahifa ochiladi.
