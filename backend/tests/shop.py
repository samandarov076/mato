"""Sinov biznesi — kirim, ombor va sotuv testlari uchun umumiy yordamchi.

`Shop`: ega, sklad, do'kon va kichik katalog (M101 matosi, ikki rang, bitta gul). Fiksturalar
(`shop`, `keeper`, `seller`) — tests/conftest.py da.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select

from app.core.db import system_session, tenant_session
from app.modules.inventory.models import BatchStock, StockMovement
from app.modules.inventory.stock import move_stock

# Biznes sanasi — Toshkent vaqti bo'yicha (server qayerda ishlashidan qat'i nazar)
TODAY_DATE = datetime.now(ZoneInfo("Asia/Tashkent")).date()
TODAY = TODAY_DATE.isoformat()


async def login(client: httpx.AsyncClient, phone: str, password: str) -> dict[str, str]:
    response = await client.post("/api/auth/login", json={"phone": phone, "password": password})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


class Shop:
    def __init__(
        self, client, business_id, owner_phone, headers, warehouse, store, fabric, colors, pattern
    ):
        self.client, self.business_id, self.owner_phone = client, business_id, owner_phone
        self.headers = headers  # biznes egasi
        self.warehouse, self.store = warehouse, store
        self.fabric, self.colors, self.pattern = fabric, colors, pattern

    # ---------- Kirim ----------

    def line(self, color: int = 0, **fields) -> dict:
        return {
            "fabric_id": self.fabric,
            "color_id": self.colors[color],
            "rolls_count": 10,
            "meters": "500",
            "cost_per_m": 30000,
            **fields,
        }

    async def receive(self, *lines: dict, headers=None, **fields) -> httpx.Response:
        body = {
            "client_uuid": str(uuid.uuid4()),
            "warehouse_id": self.warehouse,
            "receipt_date": TODAY,
            "lines": list(lines) or [self.line()],
            **fields,
        }
        return await self.client.post("/api/receipts", json=body, headers=headers or self.headers)

    async def card(self, receipt_id: int, headers=None) -> dict:
        response = await self.client.get(f"/api/receipts/{receipt_id}", headers=headers or self.headers)
        assert response.status_code == 200, response.text
        return response.json()

    async def batch(self, color: int = 0, **fields) -> int:
        """Bitta partiyali kirim qiladi va partiya id sini qaytaradi (skladda 500 m, 10 rulon)."""
        created = await self.receive(self.line(color, **fields))
        assert created.status_code == 201, created.text
        return (await self.card(created.json()["id"]))["lines"][0]["id"]

    # ---------- Qoldiq ----------

    async def stock(self, batch_id: int, location: int | None = None) -> tuple[Decimal, Decimal] | None:
        """(qoldiq, kirgan metr) — standart: skladda."""
        async with system_session() as s:
            row = await s.get(BatchStock, (batch_id, location or self.warehouse))
            return (row.qty_m, row.received_m) if row else None

    async def movements(self, batch_id: int) -> list[tuple[str, Decimal]]:
        async with system_session() as s:
            rows = await s.execute(
                select(StockMovement.type, StockMovement.qty_m)
                .where(StockMovement.batch_id == batch_id)
                .order_by(StockMovement.id)
            )
            return [(type_, qty) for type_, qty in rows]

    async def sell(self, batch_id: int, meters: str = "-20", location: int | None = None) -> None:
        """Partiyadan "sotadi" — sotuv moduli qurilguncha harakatni to'g'ridan-to'g'ri yozadi."""
        async with tenant_session(self.business_id) as s:
            await move_stock(
                s, business_id=self.business_id, batch_id=batch_id,
                location_id=location or self.warehouse, qty_m=Decimal(meters), type="sale", user_id=None,
            )  # fmt: skip

    # ---------- Ko'chirish ----------

    async def send(self, *lines: tuple[int, int, str], headers=None, **fields) -> httpx.Response:
        """Ko'chirish yaratadi: qatorlar — (partiya, rulon, metr). Standart: skladdan do'konga."""
        body = {
            "client_uuid": str(uuid.uuid4()),
            "from_location_id": self.warehouse,
            "to_location_id": self.store,
            "lines": [{"batch_id": b, "rolls": r, "meters": m} for b, r, m in lines],
            **fields,
        }
        return await self.client.post("/api/transfers", json=body, headers=headers or self.headers)

    async def transfer(self, transfer_id: int, headers=None) -> dict:
        response = await self.client.get(f"/api/transfers/{transfer_id}", headers=headers or self.headers)
        assert response.status_code == 200, response.text
        return response.json()

    async def accept(self, transfer_id: int, headers=None, note=None, **changed) -> httpx.Response:
        """Qabul qiladi: hammasi jo'natilgandek; `changed` — {partiya raqami: (rulon, metr)} farqlar."""
        lines = (await self.transfer(transfer_id))["lines"]
        body = {
            "note": note,
            "lines": [
                {
                    "line_id": line["id"],
                    "rolls": changed.get(line["batch_number"], (line["sent_rolls"],))[0],
                    "meters": changed.get(line["batch_number"], (0, line["sent_m"]))[1],
                }
                for line in lines
            ],
        }
        return await self.client.post(
            f"/api/transfers/{transfer_id}/receive", json=body, headers=headers or self.headers
        )

    # ---------- Sotuv ----------

    async def in_store(self, color: int = 0, meters: str = "200", rolls: int = 4, **fields) -> int:
        """Kirim qiladi va bir qismini do'konga ko'chiradi. Partiya id sini qaytaradi (do'konda `meters` m)."""
        batch = await self.batch(color, **fields)
        sent = await self.send((batch, rolls, meters))
        assert sent.status_code == 201, sent.text
        assert (await self.accept(sent.json()["id"])).status_code == 204
        return batch

    async def sell_to(self, *lines: tuple, headers=None, **fields) -> httpx.Response:
        """Sotuv yozadi: qatorlar — (partiya, metr, 1 metr narxi[, izoh]). Standart: naqd, shu do'konda."""
        body = {
            "client_uuid": str(uuid.uuid4()),
            "store_id": self.store,
            "payment_type": "cash",
            "lines": [
                {
                    "batch_id": line[0],
                    "meters": line[1],
                    "price_per_m": line[2],
                    **({"negative_stock_note": line[3]} if len(line) > 3 else {}),
                }
                for line in lines
            ],
            **fields,
        }
        return await self.client.post("/api/sales", json=body, headers=headers or self.headers)

    async def sale(self, sale_id: int, headers=None) -> dict:
        response = await self.client.get(f"/api/sales/{sale_id}", headers=headers or self.headers)
        assert response.status_code == 200, response.text
        return response.json()

    async def customer(self, name: str = "Sardor Usta", phone: str = "+998901234567") -> int:
        created = await self.client.post(
            "/api/customers", json={"name": name, "phone": phone}, headers=self.headers
        )
        assert created.status_code == 201, created.text
        return created.json()["id"]

    # ---------- Jurnal ----------

    async def events(self, *prefixes: str, category: str = "stock") -> list[dict]:
        """Jurnal (standart — "Ombor" kategoriyasi); `prefixes` — hodisa turlari ("receipt", "batch" ...)."""
        page = await self.client.get(
            "/api/audit-logs", params={"category": category}, headers=self.headers
        )
        wanted = prefixes or ("receipt", "batch")
        return [e for e in page.json()["items"] if e["event_code"].split(".")[0] in wanted]
