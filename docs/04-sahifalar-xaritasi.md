# Sahifalar xaritasi

## Kirish nuqtalari

```mermaid
flowchart TD
  A[Kirish: telefon + parol] -->|Platforma egasi| B[2FA kod] --> P[Platforma paneli]
  A -->|Biznes egasi| E[Bosh sahifa - dashboard]
  A -->|Omborchi| O[Qoldiq]
  D[Do'kon qurilmasi] --> PIN[PIN ekrani] -->|Sotuvchi| S[Sotuv ekrani]
```

## Platforma egasi
```mermaid
flowchart LR
  P[Bizneslar ro'yxati] --> P1[Biznes qo'shish]
  P --> P2[Biznes sahifasi]
  P2 --> P3[Bloklash / parol tiklash / asosiy egani almashtirish]
```

## Sotuvchi (do'kon qurilmasi)
```mermaid
flowchart LR
  PIN[PIN ekrani] --> S[Sotuv ekrani]
  S --> S1[Savat → To'lov → Yakunlash]
  S1 -->|Nasiya| N1[Mijoz tanlash / qo'shish]
  S --> T[Bugungi sotuvlarim] --> T1[Sotuv kartochkasi] --> T2[Qaytarish / Bekor qilish]
  S --> M[Mijozlar] --> M1[Mijoz kartochkasi] --> M2[Qarz to'lovi / Hisobdan chiqarish]
  S --> Q[Qoldiq - faqat metr]
  S --> K[Kelgan ko'chirishlar] --> K1[Qabul qilish]
  S --> Y[Partiyani yopish]
  S --> X[Xabarlar]
```

## Omborchi
```mermaid
flowchart LR
  O[Qoldiq] --> O1[Partiya kartochkasi] --> O2[Partiyani yopish / qayta ochish / etiketka]
  KR[Kirimlar] --> KR1[Kirim yaratish] --> KR2[Kirim kartochkasi + etiketka]
  KO[Ko'chirishlar] --> KO1[Ko'chirish yaratish]
  KO --> KO2[Qabul qilish]
  KT[Katalog] --> KT1[Matolar / Ranglar / Gullar / SKU]
  X[Xabarlar]
  PR[Profil]
```

## Biznes egasi (asosiy ega va sherik-egalar)
Menyu:

| Bo'lim | Sahifalar |
|--------|-----------|
| Bosh sahifa | Dashboard |
| Sotuv | Sotuv ekrani, Sotuvlar ro'yxati → Sotuv kartochkasi → Qaytarish / Bekor qilish |
| Nasiya | Mijozlar → Mijoz kartochkasi → Qarz to'lovi / Hisobdan chiqarish |
| Ombor | Qoldiq → Partiya kartochkasi; Kirimlar; Ko'chirishlar; Kamomadlar |
| Katalog | Matolar, Ranglar, Gullar, SKU (ommaviy narx) |
| Hisobotlar | Savdo-tushum-foyda, Soatlar, Top tovarlar, Qoldiq, Nasiyalar, Kamomadlar, Narx og'ishi |
| Tuzilma | Do'konlar, Skladlar, Xodimlar, Qurilmalar |
| Sozlamalar | Biznes sozlamalari, Jurnal |
| Yuqori panel | Xabarlar, Profil, Til |

## Yangi aniqlangan sahifalar
Xarita tuzish paytida 3-bosqich hujjatlarida yo'q, lekin kerakli sahifalar topildi:
- **Sotuvlar ro'yxati** (biznes egasi) — barcha sotuvlar, filtrlar bilan; hozir faqat sotuvchining "bugungi sotuvlarim" bor edi → 06-sotuv
- **Sotuv kartochkasi** — bitta sotuvning qatorlari, to'lovi, qaytarishlari → 06-sotuv
- **Partiya kartochkasi** — partiyaning butun tarixi: kirim, ko'chirishlar, sotuvlar, yopilishlar → 05-ombor

## Asosiy ish nechta bosishda
| Rol | Asosiy ish | Yo'l |
|-----|-----------|------|
| Sotuvchi | Sotish | PIN → sotuv ekrani (darhol) |
| Sotuvchi | Ko'chirishni qabul qilish | xabar → qabul qilish |
| Omborchi | Kirim | Kirimlar → Kirim yaratish |
| Biznes egasi | Kunlik natija | kirish → dashboard (darhol) |
