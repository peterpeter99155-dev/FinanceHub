"""Generate fictional PDF fixtures. Not used by the production bundle."""

from io import BytesIO
from pathlib import Path
import sys

from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase.pdfmetrics import registerFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

ROOT = Path(__file__).resolve().parent
PASSWORD = "FIXTURE-PDF-PASSWORD-7319"
FONT = "FinanceHubFixtureFont"
registerFont(TTFont(FONT, "C:/Windows/Fonts/msjh.ttc", subfontIndex=0))


def text(canvas: Canvas, x: float, y: float, value: str, size: int = 8) -> None:
    canvas.setFont(FONT, size)
    canvas.drawString(x, y, value)


def row(canvas: Canvas, y: float, values: tuple[str, ...]) -> None:
    for x, value in zip((32, 75, 132, 205, 390), values):
        text(canvas, x, y, value, 7)


def statement(year: int = 2030, month: int = 1) -> bytes:
    output = BytesIO()
    canvas = Canvas(output, pagesize=A4)
    _, height = A4
    text(canvas, 42, height - 42, "虛構信用卡月結資料", 15)
    text(canvas, 42, height - 100, f"結帳日 {year:04d}/{month:02d}/16")
    canvas.showPage()

    text(canvas, 32, height - 40, "消費日 入帳起息日 卡號末四碼 帳單說明 臺幣金額")
    prefix = f"{month:02d}"
    row(canvas, height - 70, (f"{prefix}/01", f"{prefix}/03", "1111", "虛構商店甲", "1,234"))
    row(canvas, height - 92, (f"{prefix}/02", f"{prefix}/04", "1111", "FICTIONAL SHOP", f"2,600 {prefix}/02 JPY12,000.00"))
    row(canvas, height - 114, (f"{prefix}/05", f"{prefix}/07", "1111", "虛構商店退款", "-500"))
    text(canvas, 32, height - 136, f"{prefix}/06 {prefix}/08 AUTO PAYMENT FROM PRIOR STATEMENT")
    row(canvas, height - 158, (f"{prefix}/06", f"{prefix}/08", "1111", "虛構回饋折抵", "-100"))
    canvas.showPage()

    text(canvas, 32, height - 40, "消費日 入帳起息日 卡號末四碼 帳單說明 臺幣金額")
    text(canvas, 205, height - 64, "FICTIONAL MULTI-", 7)
    text(canvas, 205, height - 76, "LINE DESCRIPTION", 7)
    row(canvas, height - 70, (f"{prefix}/07", f"{prefix}/09", "1111", "", "789"))
    text(canvas, 205, height - 91, "AMBIGUOUS PART A", 7)
    text(canvas, 205, height - 94, "AMBIGUOUS PART B", 7)
    text(canvas, 205, height - 106, "AMBIGUOUS PART C", 7)
    row(canvas, height - 100, (f"{prefix}/08", f"{prefix}/10", "1111", "", "50"))
    text(canvas, 205, height - 135, "您的正卡，本期應繳金額合計 4,073")
    canvas.save()
    return output.getvalue()


def encrypt(content: bytes) -> bytes:
    writer = PdfWriter()
    writer.clone_document_from_reader(PdfReader(BytesIO(content)))
    writer.encrypt(PASSWORD, algorithm="AES-256")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def unsupported() -> bytes:
    output = BytesIO()
    canvas = Canvas(output, pagesize=A4)
    text(canvas, 48, 780, "虛構且不支援的文件")
    canvas.save()
    return output.getvalue()


def scanned() -> bytes:
    image_path = ROOT / "temporary-image.png"
    Image.new("RGB", (600, 800), "white").save(image_path)
    output = BytesIO()
    canvas = Canvas(output, pagesize=A4)
    canvas.drawImage(str(image_path), 0, 0, width=A4[0], height=A4[1])
    canvas.save()
    image_path.unlink()
    return output.getvalue()


if "--acceptance-only" in sys.argv:
    (ROOT / "statement-acceptance-encrypted.pdf").write_bytes(
        encrypt(statement(2026, 7))
    )
    raise SystemExit(0)

plain = statement()
(ROOT / "statement-plain.pdf").write_bytes(plain)
(ROOT / "statement-encrypted.pdf").write_bytes(encrypt(plain))
(ROOT / "unsupported.pdf").write_bytes(unsupported())
(ROOT / "scanned.pdf").write_bytes(scanned())
(ROOT / "corrupt.pdf").write_bytes(b"%PDF-1.7\nfictional-corruption")
