"""03-katalog: matolar, ranglar, gullar, SKU, tavsiya narx (yakka va ommaviy), rasm yuklash."""
import io

import httpx
import pytest
from PIL import Image

from app.core import media
from app.modules.catalog import service
from tests.conftest import PASSWORD


async def _headers(client: httpx.AsyncClient, phone: str) -> dict[str, str]:
    login = await client.post("/api/auth/login", json={"phone": phone, "password": PASSWORD})
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.fixture
def owner(client, new_account):
    """Biznes egasi bo'lib kirgan brauzer: (business_id, headers)."""

    async def _enter() -> tuple[int, dict[str, str]]:
        business_id, _, phone = await new_account(is_primary_owner=True, full_name="Akmal Ega")
        return business_id, await _headers(client, phone)

    return _enter


async def _events(client, headers, category: str) -> list[dict]:
    page = await client.get("/api/audit-logs", params={"category": category}, headers=headers)
    return page.json()["items"]


async def _add(client, headers, what: str, code: str, name: str | None = None, **fields) -> int:
    """Mato ("fabrics"), rang ("colors") yoki gul ("patterns") qo'shadi va id sini qaytaradi."""
    response = await client.post(
        f"/api/catalog/{what}", json={"code": code, "name": name or f"{code} nomi", **fields}, headers=headers
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def _skus(client, headers, **params) -> dict:
    return (await client.get("/api/catalog/skus", params=params, headers=headers)).json()


async def _catalog(client, headers) -> tuple[int, list[int]]:
    """Namuna: M101 matosi va uning ikki rangdagi gulsiz SKU'lari. (fabric_id, [sku_id, sku_id])"""
    fabric = await _add(client, headers, "fabrics", "M101", "Atlas")
    colors = [await _add(client, headers, "colors", code) for code in ("01", "02")]
    created = await client.post(
        "/api/catalog/skus", json={"fabric_id": fabric, "color_ids": colors}, headers=headers
    )
    assert created.json() == {"created": 2, "existing": 0}
    return fabric, [item["id"] for item in (await _skus(client, headers))["items"]]


# ---------- Matolar ----------


async def test_create_edit_and_search_fabrics(client, owner):
    _, headers = await owner()

    atlas = await _add(
        client, headers, "fabrics", " M101 ", " Atlas ",
        width_cm=150, composition="100% ipak", default_m_per_kg="3.25",
    )  # fmt: skip
    await _add(client, headers, "fabrics", "B-7", "Baxmal")

    edited = await client.patch(
        f"/api/catalog/fabrics/{atlas}",
        json={"code": "M101", "name": "Xon atlas", "width_cm": None, "composition": " "},
        headers=headers,
    )
    assert edited.status_code == 204

    rows = (await client.get("/api/catalog/fabrics", headers=headers)).json()
    assert [(r["code"], r["name"], r["width_cm"], r["composition"], r["sku_count"]) for r in rows] == [
        ("B-7", "Baxmal", None, None, 0),
        ("M101", "Xon atlas", None, None, 0),
    ]
    found = (await client.get("/api/catalog/fabrics", params={"search": "atl"}, headers=headers)).json()
    assert [r["code"] for r in found] == ["M101"]
    # "%" qidiruvda oddiy belgi — hamma narsani topib bermaydi
    assert (await client.get("/api/catalog/fabrics", params={"search": "%"}, headers=headers)).json() == []

    events = await _events(client, headers, "stock")
    assert [(e["event_code"], e["data"]["name"]) for e in events] == [
        ("fabric.updated", "M101 — Xon atlas"),
        ("fabric.created", "B-7 — Baxmal"),
        ("fabric.created", "M101 — Atlas"),
    ]


async def test_fabric_code_is_unique_ignoring_case(client, owner):
    _, headers = await owner()
    first = await _add(client, headers, "fabrics", "M101")
    second = await _add(client, headers, "fabrics", "M102")

    same = await client.post("/api/catalog/fabrics", json={"code": "m101", "name": "Boshqa"}, headers=headers)
    assert (same.status_code, same.json()["code"]) == (409, "code_taken")
    renamed = await client.patch(
        f"/api/catalog/fabrics/{second}", json={"code": "M101", "name": "Boshqa"}, headers=headers
    )
    assert (renamed.status_code, renamed.json()["code"]) == (409, "code_taken")
    # O'z kodini saqlab tahrirlash — xato emas
    kept = await client.patch(
        f"/api/catalog/fabrics/{first}", json={"code": "m101", "name": "Atlas"}, headers=headers
    )
    assert kept.status_code == 204

    # Boshqa biznesda xuddi shu kod bo'lishi mumkin
    _, other = await owner()
    await _add(client, other, "fabrics", "M101")


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"code": " ", "name": "Atlas"}, "code"),
        ({"code": "M" * 31, "name": "Atlas"}, "code"),
        ({"code": "M1", "name": "A"}, "name"),
        ({"code": "M1", "name": "Atlas", "width_cm": 0}, "width_cm"),
        ({"code": "M1", "name": "Atlas", "default_m_per_kg": "0"}, "default_m_per_kg"),
        ({"code": "M1", "name": "Atlas", "image_url": "https://example.com/rasm.jpg"}, "image_url"),
    ],
)
async def test_fabric_validation(client, owner, body, field):
    _, headers = await owner()
    response = await client.post("/api/catalog/fabrics", json=body, headers=headers)
    assert response.status_code == 422
    assert field in response.json()["fields"]


async def test_deactivated_fabric_is_hidden_but_kept(client, owner):
    _, headers = await owner()
    fabric = await _add(client, headers, "fabrics", "M101")

    assert (await client.post(f"/api/catalog/fabrics/{fabric}/deactivate", headers=headers)).status_code == 204
    assert (await client.get("/api/catalog/fabrics", headers=headers)).json() == []
    everything = await client.get("/api/catalog/fabrics", params={"include_inactive": True}, headers=headers)
    assert [(r["code"], r["is_active"]) for r in everything.json()] == [("M101", False)]

    assert (await client.post(f"/api/catalog/fabrics/{fabric}/activate", headers=headers)).status_code == 204
    assert len((await client.get("/api/catalog/fabrics", headers=headers)).json()) == 1


# ---------- Ranglar va gullar ----------


async def test_colors_keep_a_swatch_and_codes_are_unique_per_list(client, owner):
    _, headers = await owner()
    await _add(client, headers, "colors", "01", "Qizil", hex="#C0392B")
    # Rang va gul alohida ro'yxat — bir xil kod ikkalasida bo'lishi mumkin
    await _add(client, headers, "patterns", "01", "Lola")

    again = await client.post("/api/catalog/colors", json={"code": "01", "name": "Yana"}, headers=headers)
    assert (again.status_code, again.json()["code"]) == (409, "code_taken")
    bad = await client.post(
        "/api/catalog/colors", json={"code": "02", "name": "Yashil", "hex": "yashil"}, headers=headers
    )
    assert bad.status_code == 422

    colors = (await client.get("/api/catalog/colors", headers=headers)).json()
    assert [(c["code"], c["name"], c["hex"], c["is_plain"]) for c in colors] == [
        ("01", "Qizil", "#c0392b", False)
    ]


async def test_every_business_has_a_plain_pattern(client, owner):
    _, headers = await owner()

    patterns = (await client.get("/api/catalog/patterns", headers=headers)).json()
    assert [(p["name"], p["is_plain"]) for p in patterns] == [("Gulsiz", True)]
    plain = patterns[0]["id"]

    # Nomini va kodini o'zgartirsa bo'ladi, faolsizlantirib bo'lmaydi
    renamed = await client.patch(
        f"/api/catalog/patterns/{plain}", json={"code": "—", "name": "Bir rangli"}, headers=headers
    )
    assert renamed.status_code == 204
    locked = await client.post(f"/api/catalog/patterns/{plain}/deactivate", headers=headers)
    assert (locked.status_code, locked.json()["code"]) == (400, "plain_pattern_protected")

    lola = await _add(client, headers, "patterns", "G5", "Lola")
    assert (await client.post(f"/api/catalog/patterns/{lola}/deactivate", headers=headers)).status_code == 204
    patterns = (await client.get("/api/catalog/patterns", headers=headers)).json()
    assert [(p["name"], p["is_plain"]) for p in patterns] == [("Bir rangli", True)]  # hali ham bitta


# ---------- SKU ----------


async def test_skus_are_fabric_color_pattern_combinations(client, owner):
    _, headers = await owner()
    fabric, _ = await _catalog(client, headers)
    colors = {c["code"]: c["id"] for c in (await client.get("/api/catalog/colors", headers=headers)).json()}
    lola = await _add(client, headers, "patterns", "G5", "Lola")
    plain = (await client.get("/api/catalog/patterns", headers=headers)).json()[0]["id"]
    yellow = await _add(client, headers, "colors", "03")

    # 2 rang × 2 gul = 4; ulardan 01-gulsiz allaqachon bor
    more = await client.post(
        "/api/catalog/skus",
        json={"fabric_id": fabric, "color_ids": [colors["01"], yellow], "pattern_ids": [plain, lola]},
        headers=headers,
    )
    assert more.json() == {"created": 3, "existing": 1}

    page = await _skus(client, headers)
    assert page["total"] == 5
    assert [item["code"] for item in page["items"]] == [
        "M101-01", "M101-01-G5", "M101-02", "M101-03", "M101-03-G5",
    ]  # fmt: skip
    assert page["items"][0]["price"] is None and page["items"][0]["price_unit"] == "m"

    fabrics = (await client.get("/api/catalog/fabrics", headers=headers)).json()
    assert fabrics[0]["sku_count"] == 5
    created = [e for e in await _events(client, headers, "stock") if e["event_code"] == "sku.created"]
    assert [e["data"] for e in created] == [
        {"name": "M101 — Atlas", "count": 3},
        {"name": "M101 — Atlas", "count": 2},
    ]


async def test_skus_need_active_fabric_and_own_colors(client, owner):
    _, headers = await owner()
    fabric, _ = await _catalog(client, headers)
    color = (await client.get("/api/catalog/colors", headers=headers)).json()[0]["id"]
    _, stranger = await owner()
    foreign_color = await _add(client, stranger, "colors", "99")

    async def create(**body) -> httpx.Response:
        return await client.post(
            "/api/catalog/skus", json={"fabric_id": fabric, "color_ids": [color], **body}, headers=headers
        )

    assert (await create(color_ids=[foreign_color])).json()["fields"] == {"color_ids": "invalid"}
    assert (await create(pattern_ids=[999_999])).json()["fields"] == {"pattern_ids": "invalid"}
    assert (await create(color_ids=[])).status_code == 422

    await client.post(f"/api/catalog/fabrics/{fabric}/deactivate", headers=headers)
    assert (await create()).json()["fields"] == {"fabric_id": "invalid"}


async def test_too_many_combinations_at_once(client, owner, monkeypatch):
    _, headers = await owner()
    fabric, _ = await _catalog(client, headers)
    colors = [c["id"] for c in (await client.get("/api/catalog/colors", headers=headers)).json()]
    patterns = [await _add(client, headers, "patterns", code) for code in ("G1", "G2")]
    monkeypatch.setattr(service, "MAX_SKUS_PER_REQUEST", 3)

    response = await client.post(
        "/api/catalog/skus",
        json={"fabric_id": fabric, "color_ids": colors, "pattern_ids": patterns},
        headers=headers,
    )
    assert (response.status_code, response.json()["code"]) == (422, "too_many_skus")
    assert (await _skus(client, headers))["total"] == 2  # hech narsa qo'shilmadi


async def test_sku_filters_and_paging(client, owner):
    _, headers = await owner()
    fabric, (first, second) = await _catalog(client, headers)
    other_fabric = await _add(client, headers, "fabrics", "B-7", "Baxmal")
    colors = (await client.get("/api/catalog/colors", headers=headers)).json()
    await client.post(
        "/api/catalog/skus", json={"fabric_id": other_fabric, "color_ids": [colors[0]["id"]]}, headers=headers
    )
    await client.patch(f"/api/catalog/skus/{first}", json={"price": 45000}, headers=headers)
    await client.post(f"/api/catalog/skus/{second}/deactivate", headers=headers)

    async def codes(**params) -> list[str]:
        return [item["code"] for item in (await _skus(client, headers, **params))["items"]]

    assert await codes() == ["B-7-01", "M101-01"]
    assert await codes(include_inactive=True) == ["B-7-01", "M101-01", "M101-02"]
    assert await codes(fabric_id=fabric, include_inactive=True) == ["M101-01", "M101-02"]
    assert await codes(color_id=colors[1]["id"], include_inactive=True) == ["M101-02"]
    assert await codes(no_price=True) == ["B-7-01"]
    assert await codes(search="baxm") == ["B-7-01"]

    page = await _skus(client, headers, include_inactive=True, limit=2, offset=2)
    assert (page["total"], [item["code"] for item in page["items"]]) == (3, ["M101-02"])


async def test_price_change_goes_to_history_and_journal(client, owner):
    _, headers = await owner()
    _, (sku, _) = await _catalog(client, headers)

    async def save(**body) -> int:
        return (await client.patch(f"/api/catalog/skus/{sku}", json=body, headers=headers)).status_code

    assert await save(price=45000, price_unit="m") == 204
    assert await save(price=45000, price_unit="m", low_stock_threshold="25.5") == 204  # narx o'zgarmadi
    assert await save(price=120000, price_unit="kg", low_stock_threshold="25.5") == 204
    assert await save(price=None, low_stock_threshold="25.5") == 204  # tavsiya narx olib tashlandi

    card = (await client.get(f"/api/catalog/skus/{sku}", headers=headers)).json()
    assert (card["code"], card["price"], card["low_stock_threshold"]) == ("M101-01", None, "25.50")
    assert [
        (h["old_price"], h["old_price_unit"], h["new_price"], h["price_unit"], h["user_name"])
        for h in card["history"]
    ] == [
        (120000, "kg", None, "m", "Akmal Ega"),
        (45000, "m", 120000, "kg", "Akmal Ega"),
        (None, None, 45000, "m", "Akmal Ega"),
    ]

    events = await _events(client, headers, "price")
    assert [e["event_code"] for e in events] == ["sku.price_changed"] * 3
    assert events[1]["data"] == {
        "name": "M101-01", "old_price": 45000, "old_unit": "m", "new_price": 120000, "new_unit": "kg",
    }  # fmt: skip


@pytest.mark.parametrize("body", [{"price": 0}, {"price": -5}, {"price": 45000, "price_unit": "dona"},
                                  {"low_stock_threshold": "0"}])  # fmt: skip
async def test_sku_validation(client, owner, body):
    _, headers = await owner()
    _, (sku, _) = await _catalog(client, headers)
    assert (await client.patch(f"/api/catalog/skus/{sku}", json=body, headers=headers)).status_code == 422


async def test_sku_card_shows_the_business_default_threshold(client, owner):
    _, headers = await owner()
    _, (sku, _) = await _catalog(client, headers)
    settings = (await client.get("/api/settings", headers=headers)).json()
    await client.put("/api/settings", json={**settings, "low_stock_default": "50"}, headers=headers)

    card = (await client.get(f"/api/catalog/skus/{sku}", headers=headers)).json()
    assert (card["low_stock_threshold"], card["low_stock_default"], card["history"]) == (None, "50.00", [])


async def test_bulk_price(client, owner):
    _, headers = await owner()
    _, (first, second) = await _catalog(client, headers)
    await client.patch(f"/api/catalog/skus/{first}", json={"price": 50000}, headers=headers)

    done = await client.post(
        "/api/catalog/skus/price", json={"sku_ids": [first, second], "price": 50000}, headers=headers
    )
    assert done.json() == {"changed": 1}  # birinchisida narx allaqachon shu edi

    page = await _skus(client, headers)
    assert [(item["price"], item["price_unit"]) for item in page["items"]] == [(50000, "m")] * 2
    second_card = (await client.get(f"/api/catalog/skus/{second}", headers=headers)).json()
    assert len(second_card["history"]) == 1

    bulk = [e for e in await _events(client, headers, "price") if e["event_code"] == "sku.price_bulk"]
    assert [e["data"] for e in bulk] == [
        {"name": "M101", "count": 1, "new_price": 50000, "new_unit": "m"}
    ]


async def test_bulk_price_rejects_foreign_skus_entirely(client, owner):
    _, headers = await owner()
    _, (mine, _) = await _catalog(client, headers)
    _, stranger = await owner()
    _, (foreign, _) = await _catalog(client, stranger)

    response = await client.post(
        "/api/catalog/skus/price", json={"sku_ids": [mine, foreign], "price": 1000}, headers=headers
    )
    assert (response.status_code, response.json()["code"]) == (404, "sku_not_found")
    assert [item["price"] for item in (await _skus(client, headers))["items"]] == [None, None]
    assert [item["price"] for item in (await _skus(client, stranger))["items"]] == [None, None]


async def test_other_business_cannot_see_or_change_my_catalog(client, owner):
    _, headers = await owner()
    fabric, (sku, _) = await _catalog(client, headers)
    color = (await client.get("/api/catalog/colors", headers=headers)).json()[0]["id"]
    _, stranger = await owner()

    assert (await client.get("/api/catalog/fabrics", headers=stranger)).json() == []
    assert (await _skus(client, stranger))["total"] == 0
    body = {"code": "X", "name": "Begona"}
    statuses = [
        (await client.patch(f"/api/catalog/fabrics/{fabric}", json=body, headers=stranger)).status_code,
        (await client.post(f"/api/catalog/fabrics/{fabric}/deactivate", headers=stranger)).status_code,
        (await client.patch(f"/api/catalog/colors/{color}", json=body, headers=stranger)).status_code,
        (await client.get(f"/api/catalog/skus/{sku}", headers=stranger)).status_code,
        (await client.patch(f"/api/catalog/skus/{sku}", json={"price": 1}, headers=stranger)).status_code,
        (await client.post(f"/api/catalog/skus/{sku}/deactivate", headers=stranger)).status_code,
    ]
    assert statuses == [404] * 6
    assert (await client.get("/api/catalog/fabrics", headers=headers)).json()[0]["code"] == "M101"


async def test_warehouse_keeper_manages_catalog_but_seller_does_not(client, new_account):
    _, _, keeper_phone = await new_account(role="warehouse")
    keeper = await _headers(client, keeper_phone)
    await _add(client, keeper, "fabrics", "M101")
    assert len((await client.get("/api/catalog/fabrics", headers=keeper)).json()) == 1

    _, _, seller_phone = await new_account(role="seller")
    seller = await _headers(client, seller_phone)
    statuses = [
        (await client.get("/api/catalog/fabrics", headers=seller)).status_code,
        (await client.get("/api/catalog/skus", headers=seller)).status_code,
        (await client.post("/api/catalog/colors", json={"code": "1", "name": "Oq"}, headers=seller)).status_code,
        (await client.get("/api/catalog/fabrics")).status_code,  # kirmagan
    ]
    assert statuses == [403, 403, 403, 401]


# ---------- Rasm ----------


def _png(size: tuple[int, int] = (1600, 800)) -> bytes:
    out = io.BytesIO()
    Image.new("RGBA", size, (200, 30, 30, 128)).save(out, "PNG")
    return out.getvalue()


async def _upload(client, headers, data: bytes, name: str = "rasm.png") -> httpx.Response:
    return await client.post("/api/uploads/image", files={"file": (name, data, "image/png")}, headers=headers)


async def test_upload_image_and_attach_it(client, owner):
    business_id, headers = await owner()

    uploaded = await _upload(client, headers, _png())
    assert uploaded.status_code == 201
    url = uploaded.json()["url"]
    assert url.startswith(f"/api/media/{business_id}/") and url.endswith(".webp")

    served = await client.get(url)  # <img> token yubormaydi — manzilni bilgan ochadi
    assert (served.status_code, served.headers["content-type"]) == (200, "image/webp")
    with Image.open(io.BytesIO(served.content)) as image:
        assert (image.format, image.size) == ("WEBP", (1200, 600))  # kichraytirilgan

    fabric = await _add(client, headers, "fabrics", "M101", image_url=url)
    await _add(client, headers, "patterns", "G5", "Lola", image_url=url)
    rows = (await client.get("/api/catalog/fabrics", headers=headers)).json()
    assert (rows[0]["id"], rows[0]["image_url"]) == (fabric, url)

    # Mato rasmi SKU bilan birga ham keladi — sotuv ekrani tovar rasmini shundan oladi (docs/03-details/06-sotuv.md)
    color = await _add(client, headers, "colors", "01", "Oq")
    created = await client.post(
        "/api/catalog/skus", json={"fabric_id": fabric, "color_ids": [color]}, headers=headers
    )
    assert created.status_code == 201, created.text
    listed = (await client.get("/api/catalog/skus", headers=headers)).json()["items"]
    assert listed[0]["fabric"]["image_url"] == url

    # Boshqa biznes bu rasmni o'z tovariga biriktira olmaydi
    _, stranger = await owner()
    stolen = await client.post(
        "/api/catalog/fabrics", json={"code": "X1", "name": "Begona", "image_url": url}, headers=stranger
    )
    assert stolen.json()["fields"] == {"image_url": "invalid"}


async def test_upload_rejects_non_images_and_big_files(client, owner, new_account, monkeypatch):
    _, headers = await owner()

    fake = await _upload(client, headers, b"<script>alert(1)</script>", "rasm.png")
    assert (fake.status_code, fake.json()["code"]) == (422, "invalid_image")

    monkeypatch.setattr(media, "MAX_UPLOAD_BYTES", 100)
    big = await _upload(client, headers, _png())
    assert (big.status_code, big.json()["code"]) == (413, "image_too_large")

    _, _, seller_phone = await new_account(role="seller")
    seller = await _headers(client, seller_phone)
    assert (await _upload(client, seller, _png((10, 10)))).status_code == 403
    assert (await _upload(client, {}, _png((10, 10)))).status_code == 401


@pytest.mark.parametrize("path", ["/api/media/1/yoq.webp", "/api/media/1/..%2F..%2F.env",
                                  "/api/media/1/" + "a" * 32 + ".webp"])  # fmt: skip
async def test_media_serves_only_known_files(client, path):
    assert (await client.get(path)).status_code == 404


async def test_each_sku_has_its_own_image(client, owner):
    """SKU'ning o'z rasmi: "Atlas · Qizil" bir rasm, "Atlas · Oq" boshqa (docs/03-details/03-katalog.md)."""
    _, headers = await owner()
    fabric = await _add(client, headers, "fabrics", "M101", "Atlas")
    red, white = await _add(client, headers, "colors", "03", "Qizil"), await _add(client, headers, "colors", "01", "Oq")
    await client.post("/api/catalog/skus", json={"fabric_id": fabric, "color_ids": [red, white]}, headers=headers)
    skus = {row["code"]: row for row in (await client.get("/api/catalog/skus", headers=headers)).json()["items"]}
    assert skus["M101-03"]["image_url"] is None

    url = (await _upload(client, headers, _png((40, 40)))).json()["url"]
    saved = await client.put(
        f"/api/catalog/skus/{skus['M101-03']['id']}/image", json={"image_url": url}, headers=headers
    )
    assert saved.status_code == 204, saved.text

    skus = {row["code"]: row for row in (await client.get("/api/catalog/skus", headers=headers)).json()["items"]}
    assert (skus["M101-03"]["image_url"], skus["M101-01"]["image_url"]) == (url, None)  # boshqa rangga o'tmaydi
    # Narx va chegara o'zgarmaydi (rasm alohida saqlanadi)
    assert skus["M101-03"]["price"] is None

    # Begona biznes rasmi qabul qilinmaydi; olib tashlash — null
    _, stranger = await owner()
    foreign = (await _upload(client, stranger, _png((40, 40)))).json()["url"]
    refused = await client.put(
        f"/api/catalog/skus/{skus['M101-03']['id']}/image", json={"image_url": foreign}, headers=headers
    )
    assert (refused.status_code, refused.json()["fields"]) == (422, {"image_url": "invalid"})
    cleared = await client.put(
        f"/api/catalog/skus/{skus['M101-03']['id']}/image", json={"image_url": None}, headers=headers
    )
    assert cleared.status_code == 204
    skus = {row["code"]: row for row in (await client.get("/api/catalog/skus", headers=headers)).json()["items"]}
    assert skus["M101-03"]["image_url"] is None
