"""Hisobotni Excel fayliga (.xlsx) aylantirish."""
from io import BytesIO
from typing import Any

from fastapi import Response
from openpyxl import Workbook
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

# Varaq: (nomi, sarlavhalar, qatorlar)
Sheet = tuple[str, list[str], list[list[Any]]]


def workbook(sheets: list[Sheet]) -> bytes:
    """Har varaqda: qalin sarlavha qatori (aylantirganda joyida turadi), ostida ma'lumot."""
    book = Workbook()
    book.remove(book.active)
    for title, headers, rows in sheets:
        sheet = book.create_sheet(title[:31])  # Excel varaq nomi 31 belgidan oshmaydi
        sheet.append(headers)
        for cell in sheet[1]:
            cell.font = Font(bold=True)
        for row in rows:
            sheet.append(row)
        sheet.freeze_panes = "A2"
        for index, header in enumerate(headers, start=1):
            longest = max([len(str(header)), *(len(str(row[index - 1])) for row in rows)])
            sheet.column_dimensions[get_column_letter(index)].width = min(longest + 3, 50)
    buffer = BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def download(name: str, sheets: list[Sheet]) -> Response:
    """Brauzer faylni yuklab olishi uchun javob. `name` — lotin harflarida, kengaytmasiz."""
    return Response(
        content=workbook(sheets),
        media_type=XLSX,
        headers={"Content-Disposition": f'attachment; filename="{name}.xlsx"'},
    )
