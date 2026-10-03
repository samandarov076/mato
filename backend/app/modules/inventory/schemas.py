"""Ombor API'sining shakllari: qoldiq, partiya kartochkasi, yopish, ko'chirish va metr farqi."""
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
LocationType = Literal["store", "warehouse"]
StockStatus = Literal["open", "closed"]
TransferStatus = Literal["in_transit", "received", "cancelled"]


class Ref(BaseModel):
    id: int
    name: str


class Place(Ref):
    """Joy: do'kon yoki sklad."""

    type: LocationType


class SkuBrief(BaseModel):
    """Tovar — narxsiz va tannarxsiz: ombor sahifalarini sotuvchi ham ko'radi."""

    id: int
    code: str
    fabric_name: str
    color_name: str
    pattern_name: str | None  # gulsiz bo'lsa — bo'sh
    hex: str | None
    image_url: str | None


# ---------- Qoldiq ----------


class StockCell(BaseModel):
    """Partiyaning bitta joydagi qoldig'i."""

    location_id: int
    qty_m: Decimal
    rolls: int  # taxminiy: qoldiq ÷ o'rtacha rulon uzunligi


class StockBatch(BaseModel):
    id: int
    number: str
    receipt_date: date
    stocks: list[StockCell]
    in_transit_m: Decimal


class PlaceTotal(BaseModel):
    location_id: int
    qty_m: Decimal
    low: bool  # shu joyda kam qoldiq chegarasidan past


class StockSku(BaseModel):
    sku: SkuBrief
    total_m: Decimal
    in_transit_m: Decimal
    threshold: Decimal | None  # kam qoldiq chegarasi (SKU'niki yoki biznes standarti)
    totals: list[PlaceTotal]
    batches: list[StockBatch]


class StockPage(BaseModel):
    items: list[StockSku]
    total: int
    locations: list[Place]  # foydalanuvchi ko'ra oladigan joylar — ustunlar va filtr uchun


# ---------- Partiya kartochkasi ----------


class ClosureOut(BaseModel):
    diff_m: Decimal  # + kam chiqdi, − ortiq chiqdi
    diff_amount: int | None  # so'm; faqat biznes egasiga
    note: str | None
    closed_by: str
    closed_at: datetime


class BatchPlace(BaseModel):
    location: Place
    received_m: Decimal
    qty_m: Decimal
    rolls: int
    status: StockStatus
    can_close: bool
    can_reopen: bool
    closure: ClosureOut | None  # yopilgan bo'lsa


class MovementOut(BaseModel):
    id: int
    created_at: datetime
    type: str
    location: Ref
    qty_m: Decimal
    user: str | None
    # Harakatga sabab bo'lgan hujjat: kirim yoki ko'chirish
    ref_type: str | None
    ref_id: int | None
    ref_number: str | None
    note: str | None


class TransitOut(BaseModel):
    transfer_id: int
    number: str
    source: Ref
    target: Ref
    sent_m: Decimal


class ReceiptBrief(BaseModel):
    id: int
    number: str
    receipt_date: date


class BatchCard(BaseModel):
    id: int
    number: str
    sku: SkuBrief
    receipt: ReceiptBrief
    rolls_count: int
    meters_labeled: Decimal
    kg: Decimal | None
    m_per_kg: Decimal | None
    cost_per_m: int | None  # faqat biznes egasiga
    places: list[BatchPlace]
    in_transit: list[TransitOut]
    movements: list[MovementOut]


class CloseIn(BaseModel):
    location_id: int
    note: Note | None = None


class ReopenIn(BaseModel):
    location_id: int


# ---------- Ko'chirish ----------


class TransferLineIn(BaseModel):
    batch_id: int
    rolls: int = Field(ge=0, le=100_000)
    meters: Decimal = Field(gt=0, max_digits=12, decimal_places=2)


class TransferCreate(BaseModel):
    from_location_id: int
    to_location_id: int
    note: Note | None = None
    lines: list[TransferLineIn] = Field(min_length=1, max_length=100)


class ReceiveLineIn(BaseModel):
    line_id: int
    rolls: int = Field(ge=0, le=100_000)
    meters: Decimal = Field(ge=0, max_digits=12, decimal_places=2)


class ReceiveIn(BaseModel):
    lines: list[ReceiveLineIn] = Field(min_length=1, max_length=100)
    note: Note | None = None  # farq bo'lsa majburiy


class TransferRow(BaseModel):
    id: int
    number: str
    status: TransferStatus
    source: Place
    target: Place
    lines_count: int
    sent_m: Decimal
    received_m: Decimal | None
    has_diff: bool
    sent_by: Ref
    sent_at: datetime
    received_by: Ref | None
    received_at: datetime | None


class TransferPage(BaseModel):
    items: list[TransferRow]
    total: int


class TransferLineOut(BaseModel):
    id: int
    batch_id: int
    batch_number: str
    sku: SkuBrief
    sent_rolls: int
    sent_m: Decimal
    received_rolls: int | None
    received_m: Decimal | None
    roll_m: Decimal  # partiyaning o'rtacha rulon uzunligi — rulon o'zgarsa metr shundan hisoblanadi


class TransferCard(TransferRow):
    note: str | None
    receive_note: str | None
    cancelled_by: Ref | None
    cancelled_at: datetime | None
    lines: list[TransferLineOut]
    can_receive: bool
    can_cancel: bool


class Sendable(BaseModel):
    """Jo'natsa bo'ladigan partiya: shu joyda ochiq va qoldig'i bor."""

    batch_id: int
    number: str
    sku: SkuBrief
    qty_m: Decimal
    rolls: int
    roll_m: Decimal


class TransferOptions(BaseModel):
    sources: list[Place]  # xodim qayerdan jo'nata oladi
    targets: list[Place]


# ---------- Metr farqi ----------


class ClosureDiff(BaseModel):
    """Partiya yopilganda chiqqan farq."""

    id: int
    batch_id: int
    batch_number: str
    sku: SkuBrief
    location: Ref
    received_m: Decimal
    out_m: Decimal
    diff_m: Decimal
    diff_percent: Decimal | None
    diff_amount: int
    closed_by: Ref
    closed_at: datetime
    note: str | None


class TransferDiff(BaseModel):
    """Ko'chirishda jo'natilgan va kelgan metr farqi."""

    transfer_id: int
    number: str
    batch_id: int
    batch_number: str
    sku: SkuBrief
    source: Ref
    target: Ref
    sent_m: Decimal
    received_m: Decimal
    diff_m: Decimal
    diff_amount: int
    received_by: Ref
    received_at: datetime
    note: str | None


class Differences(BaseModel):
    closures: list[ClosureDiff]
    transfers: list[TransferDiff]
    shortage_m: Decimal  # kam chiqdi
    shortage_amount: int
    surplus_m: Decimal  # ortiq chiqdi
    surplus_amount: int
    transfer_m: Decimal  # ko'chirishda yo'qolgan (manfiy — ortiq kelgan)
    transfer_amount: int
