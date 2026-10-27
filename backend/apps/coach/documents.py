import hashlib
import io
import json
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PyPdfError
from rest_framework.exceptions import ValidationError


def pages_from_input(data: dict) -> list[tuple[int | None, str]]:
    if "text" in data:
        pages = [(None, data["text"])]
    else:
        upload = data["file"]
        if upload.size > 2_000_000:
            raise ValidationError("Files must be at most 2 MB.")
        raw = upload.read(2_000_001)
        suffix = Path(upload.name).suffix.lower()
        try:
            if suffix in {".txt", ".md"}:
                pages = [(None, raw.decode("utf-8"))]
            elif suffix == ".pdf":
                reader = PdfReader(io.BytesIO(raw))
                if reader.is_encrypted or len(reader.pages) > 40:
                    raise ValidationError("Use an unencrypted PDF of at most 40 pages.")
                pages = [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]
            else:
                raise ValidationError("Only UTF-8 text, Markdown and text PDFs are supported.")
        except (UnicodeError, PyPdfError, ValueError) as error:
            raise ValidationError("The document could not be read.") from error
    if sum(len(text) for _, text in pages) > 60000:
        raise ValidationError("Extracted text must be at most 60,000 characters.")
    if any("\x00" in text for _, text in pages):
        raise ValidationError("Source text must not contain NUL characters.")
    if not any(text.strip() for _, text in pages):
        raise ValidationError("No readable text found. Scanned PDFs require OCR (not supported).")
    return pages


def content_hash(pages: list[tuple[int | None, str]]) -> str:
    return hashlib.sha256(
        json.dumps({"chunkerVersion": 1, "pages": pages}, ensure_ascii=False).encode()
    ).hexdigest()


def split_pages(pages: list[tuple[int | None, str]]) -> list[tuple[int | None, str]]:
    chunks = []
    for page, text in pages:
        # Byte-bounded chunks keep UTF-8 prompts within the model's context budget.
        current = ""
        for char in text.strip():
            if len((current + char).encode()) > 900:
                chunks.append((page, current))
                current = ""
            current += char
        if current.strip():
            chunks.append((page, current))
    if len(chunks) > 80:
        raise ValidationError("Document exceeds 80 chunks; split it into smaller sources.")
    return chunks
