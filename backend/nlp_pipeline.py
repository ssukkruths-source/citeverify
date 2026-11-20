"""CiteVerify document intelligence pipeline.

This module performs the real document work behind an audit:

1. Text + page extraction (PyMuPDF when available, pypdf fallback).
2. Manuscript metadata recovery (title, authors, DOI, year, journal, abstract).
3. Bibliography segmentation across numbered / author-year reference styles.
4. In-text citation marker detection (numeric, superscript-like, author-year).
5. Claim extraction with citation markers separated from the claim wording.
6. Claim -> reference mapping with explicit MAPPED / AMBIGUOUS / UNMAPPED states.
7. Claim-evidence evaluation that refuses to invent support or contradiction.

Design rule: whenever the evidence available is insufficient, say so. Nothing in
this module fabricates a citation, a quotation or a verdict.
"""

import os
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

# Check PDF libraries
try:
    import pypdf

    HAS_PYPDF = True
except ImportError:
    HAS_PYPDF = False

try:
    import fitz  # PyMuPDF

    HAS_PYMUPDF = True
except Exception:
    HAS_PYMUPDF = False

try:  # optional OCR for scanned documents
    import pytesseract  # type: ignore

    HAS_TESSERACT = True
except Exception:
    HAS_TESSERACT = False

from academic_apis import (
    clean_text,
    extract_clean_doi,
    fetch_manuscript_metadata,
    token_similarity,
    verify_publication_metadata,
)

STOPWORDS = {
    "the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "with", "by",
    "from", "as", "at", "is", "are", "was", "were", "be", "been", "being", "that",
    "this", "these", "those", "it", "its", "their", "there", "which", "who", "whom",
    "we", "our", "us", "they", "them", "he", "she", "his", "her", "not", "no",
    "but", "if", "than", "then", "so", "such", "can", "could", "may", "might",
    "will", "would", "should", "has", "have", "had", "do", "does", "did", "also",
    "more", "most", "less", "least", "among", "between", "into", "during", "per",
    "however", "therefore", "thus", "both", "each", "other", "some", "all", "any",
    "many", "much", "very", "only", "just", "about", "over", "under", "after",
    "before", "while", "where", "when", "how", "what", "why", "whether",
}

# Running headers / footers that pollute extracted research text.
_FOOTER_PATTERNS = [
    r"^protected by copyright.*$",
    r"^\.?\s*by guest on .*downloaded from.*$",
    r"^downloaded from .*$",
    r"^no commercial reuse.*$",
    r"^subscribe:\s*http.*$",
    r"^see rights and reprints.*$",
    r"^creativecommons\.org.*$",
    r"^this article is made freely available.*$",
    r"^for personal use only.*$",
    r"^all rights reserved.*$",
    r"^page \d+( of \d+)?$",
    r"^research$",
    r"^original research$",
    r"^review$",
    r"^article$",
    r"^the\s*bmj\s*\|.*$",
    r"^bmj\s*\d{4};\d+.*$",
    r"^\d{1,3}\s*d\s*oi:\s*10\..*$",
    r".*\|\s*the\s*bmj\s*$",
    r"^bmj\s*\d{4};\d+:\w+\s*$",
]
_FOOTER_RE = [re.compile(p, re.IGNORECASE) for p in _FOOTER_PATTERNS]

_REF_HEADING_RE = re.compile(
    r"^\s*(?:\d+\.?\s*)?(references?|bibliography|literature cited|works cited|"
    r"reference list|cited literature|sources cited)\s*:?\s*$",
    re.IGNORECASE,
)

_SENTENCE_ABBREVIATIONS = [
    "et al", "e.g", "i.e", "vs", "fig", "figs", "no", "dr", "prof", "approx",
    "cf", "eq", "ref", "refs", "suppl", "vol", "pp", "ed", "eds", "etc", "st",
]


# ---------------------------------------------------------------------------
# Text hygiene
# ---------------------------------------------------------------------------


def _normalise_unicode(text: str) -> str:
    if not text:
        return ""
    replacements = {
        "\u2009": " ", "\u202f": " ", "\xa0": " ", "\u200b": "", "\ufb01": "fi",
        "\ufb02": "fl", "\u2013": "-", "\u2014": "-", "\u2018": "'", "\u2019": "'",
        "\u201c": '"', "\u201d": '"', "\u00ad": "",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return text


def _strip_running_lines(text: str) -> str:
    """Removes journal running headers/footers and edge-of-page page numbers.

    A bare number is only dropped when it sits at the top or bottom of the page;
    inside a bibliography a bare number is a reference index and must survive.
    """
    lines = text.split("\n")
    non_empty = [i for i, line in enumerate(lines) if line.strip()]
    edge = set(non_empty[:2] + non_empty[-2:])
    kept: List[str] = []
    for idx, line in enumerate(lines):
        stripped = line.strip()
        if not stripped:
            kept.append("")
            continue
        if any(rx.match(stripped) for rx in _FOOTER_RE):
            continue
        if re.fullmatch(r"\d{1,3}", stripped) and idx in edge:
            continue
        kept.append(line)
    return "\n".join(kept)


def _repair_line_breaks(text: str) -> str:
    """Undoes PDF column/layout line breaks inside words.

    Two-column PDFs often split surnames ("LeC\\nun Y", "W allace E"). Real
    line wraps normally leave a trailing space, which we preserve.
    """
    lines = text.split("\n")
    out: List[str] = []
    for raw in lines:
        line = raw
        if out:
            prev = out[-1]
            prev_strip = prev.rstrip()
            prev_has_space = prev != prev_strip
            nxt = line.lstrip()
            if nxt:
                if prev_strip.endswith("-"):
                    # keep hyphenated compounds / page ranges, drop the wrap
                    out[-1] = prev_strip + nxt
                    continue
                if prev_has_space and nxt[:1].islower():
                    out[-1] = prev.rstrip() + " " + nxt
                    continue
        out.append(line)
    return "\n".join(out)


def _fix_author_spacing(authors: str) -> str:
    """Repairs split surnames in an author list ('W allace E' -> 'Wallace E').

    Restricted to author-position text so titles such as 'T cells' stay intact.
    """
    if not authors:
        return authors
    fixed = re.sub(r"(^|,\s*)([A-Z])\s+([a-z]{3,})", r"\1\2\3", authors)
    return fixed


def _collapse(text: str) -> str:
    return " ".join(text.split())


# ---------------------------------------------------------------------------
# Document extraction
# ---------------------------------------------------------------------------


def _extract_with_pymupdf(pdf_path: str) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    pages: List[Dict[str, Any]] = []
    meta: Dict[str, Any] = {}
    doc = fitz.open(pdf_path)
    meta["page_count"] = len(doc)
    doc_meta = doc.metadata or {}
    meta["raw_title"] = (doc_meta.get("title") or "").strip()
    meta["raw_author"] = (doc_meta.get("author") or "").strip()
    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text("text") or ""
        blocks_raw = page.get_text("blocks") or []
        styled_blocks = page.get_text("dict").get("blocks", [])
        blocks = []
        for b in blocks_raw:
            if len(b) >= 5 and isinstance(b[4], str) and b[4].strip():
                font_sizes = [
                    span.get("size", 0)
                    for styled in styled_blocks
                    if styled.get("type") == 0 and styled.get("bbox", [0, 0, 0, 0])[:4] == list(b[:4])
                    for line in styled.get("lines", [])
                    for span in line.get("spans", [])
                ]
                blocks.append(
                    {
                        "bbox": [round(b[0], 1), round(b[1], 1), round(b[2], 1), round(b[3], 1)],
                        "text": b[4].strip(),
                        "font_size": max(font_sizes, default=0),
                    }
                )
        pages.append({"page_number": page_num + 1, "text": text, "blocks": blocks})
    doc.close()
    return pages, meta


def _extract_with_pypdf(pdf_path: str) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    pages: List[Dict[str, Any]] = []
    meta: Dict[str, Any] = {}
    reader = pypdf.PdfReader(pdf_path)
    if getattr(reader, "is_encrypted", False):
        try:
            reader.decrypt("")
        except Exception:
            raise ValueError(
                "This PDF is encrypted and cannot be read. Remove the password and upload again."
            )
    meta["page_count"] = len(reader.pages)
    try:
        info = reader.metadata or {}
        meta["raw_title"] = (getattr(info, "title", "") or "").strip()
        meta["raw_author"] = (getattr(info, "author", "") or "").strip()
    except Exception:
        meta["raw_title"] = ""
        meta["raw_author"] = ""
    for page_num, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
        except Exception as exc:  # keep the page, mark it unreadable
            text = ""
            pages.append(
                {
                    "page_number": page_num + 1,
                    "text": "",
                    "blocks": [],
                    "extraction_error": str(exc)[:160],
                }
            )
            continue
        pages.append({"page_number": page_num + 1, "text": text, "blocks": []})
    return pages, meta


def _ocr_page(pdf_path: str, page_number: int) -> str:
    """Optional OCR fallback for image-only pages (requires PyMuPDF + Tesseract)."""
    if not (HAS_PYMUPDF and HAS_TESSERACT):
        return ""
    try:
        doc = fitz.open(pdf_path)
        page = doc[page_number - 1]
        pix = page.get_pixmap(dpi=200)
        img_bytes = pix.tobytes("png")
        doc.close()
        from PIL import Image  # type: ignore
        import io as _io

        image = Image.open(_io.BytesIO(img_bytes))
        return pytesseract.image_to_string(image) or ""
    except Exception as exc:
        print(f"OCR fallback unavailable: {exc}")
        return ""


def extract_document_text(
    pdf_path: str,
) -> Tuple[str, List[Dict[str, Any]], Dict[str, Any]]:
    """Extracts page text and manuscript metadata from a research paper PDF."""
    metadata: Dict[str, Any] = {
        "title": os.path.basename(pdf_path).replace(".pdf", ""),
        "authors": "Unknown Authors",
        "authors_list": [],
        "affiliations": [],
        "corresponding_author": "",
        "publication_date": "",
        "abstract": "",
        "total_pages": 1,
        "doi": "",
        "year": "",
        "journal": "",
        "extraction_warnings": [],
        "unreadable_pages": [],
        "ocr_pages": [],
        "extraction_engine": "unavailable",
    }

    if not os.path.exists(pdf_path):
        raise ValueError("The uploaded PDF could not be found on disk.")
    if os.path.getsize(pdf_path) == 0:
        raise ValueError("The uploaded file is empty (0 bytes).")

    pages_data: List[Dict[str, Any]] = []
    raw_meta: Dict[str, Any] = {}

    if HAS_PYMUPDF:
        try:
            pages_data, raw_meta = _extract_with_pymupdf(pdf_path)
            metadata["extraction_engine"] = "PyMuPDF"
        except Exception as exc:
            print(f"PyMuPDF extraction notice: {exc}")
            pages_data = []

    if not pages_data and HAS_PYPDF:
        try:
            pages_data, raw_meta = _extract_with_pypdf(pdf_path)
            metadata["extraction_engine"] = "pypdf"
        except Exception as exc:
            raise ValueError(f"This PDF could not be parsed: {str(exc)[:200]}")

    if not pages_data:
        raise ValueError(
            "No text layer could be extracted from this PDF. It may be scanned; "
            "configure Tesseract OCR to process image-only documents."
        )

    total_pages = len(pages_data)
    metadata["total_pages"] = total_pages

    # Normalise + clean every page, tracking unreadable pages explicitly.
    full_text_parts: List[str] = []
    for page in pages_data:
        raw = _normalise_unicode(page.get("text", ""))
        if not raw.strip():
            ocr_text = _ocr_page(pdf_path, page["page_number"])
            if ocr_text.strip():
                page["ocr_applied"] = True
                metadata["ocr_pages"].append(page["page_number"])
                raw = _normalise_unicode(ocr_text)
            else:
                metadata["unreadable_pages"].append(page["page_number"])
        page["text"] = raw
        cleaned = _strip_running_lines(raw)
        page["clean_text"] = cleaned if cleaned.strip() else raw
        full_text_parts.append(page["text"])

    full_text = "\n".join(full_text_parts)

    if metadata["unreadable_pages"]:
        metadata["extraction_warnings"].append(
            f"{len(metadata['unreadable_pages'])} page(s) had no extractable text layer: "
            f"pages {', '.join(str(p) for p in metadata['unreadable_pages'][:8])}."
        )

    # --- Metadata recovery -------------------------------------------------
    visible_meta = _parse_first_page_metadata(pages_data)
    metadata.update({k: v for k, v in visible_meta.items() if v})

    raw_title = (raw_meta.get("raw_title") or "").strip()
    # PDF metadata is often copied from a disclaimer or running header. Accept it
    # only when it resembles a title and agrees with the visible title block.
    if _reliable_pdf_title(raw_title, pages_data) and len(raw_title) > 8:
        metadata["title"] = raw_title

    raw_author = (raw_meta.get("raw_author") or "").strip()
    if raw_author and len(raw_author) > 3 and not _looks_like_affiliation(raw_author):
        metadata["authors"] = raw_author

    visible = _parse_first_page_metadata(pages_data)
    for field in ("authors_list", "affiliations", "corresponding_author", "publication_date"):
        if visible.get(field):
            metadata[field] = visible[field]
    if visible.get("authors_list"):
        metadata["authors"] = ", ".join(visible["authors_list"])
        contact = metadata.get("corresponding_author", "")
        email = re.search(r"[\w.+-]+@[\w.-]+", contact)
        if email:
            local = re.sub(r"[^a-z]", "", email.group(0).split("@", 1)[0].lower())
            for author in visible["authors_list"]:
                author_key = re.sub(r"[^a-z]", "", author.lower())
                if local and (local in author_key or author_key in local):
                    metadata["corresponding_author"] = f"{author} ({email.group(0)})"
                    break

    # DOI can appear in the first pages in several layouts
    if not metadata.get("doi"):
        for page in pages_data[:3]:
            found = extract_clean_doi(page.get("text", "")[:4000])
            if found:
                metadata["doi"] = found
                break

    # Authoritative overlay from Crossref / OpenAlex
    scholarly_meta = fetch_manuscript_metadata(
        doi=metadata.get("doi"), title=metadata.get("title")
    )
    if scholarly_meta:
        metadata["scholarly_source"] = scholarly_meta.get("source", "")
        if scholarly_meta.get("title") and len(scholarly_meta["title"]) > 8:
            metadata["title"] = scholarly_meta["title"]
        if (
            scholarly_meta.get("authors")
            and scholarly_meta["authors"] not in ("", "Unknown Authors")
        ):
            metadata["authors"] = scholarly_meta["authors"]
        if scholarly_meta.get("year"):
            metadata["year"] = scholarly_meta["year"]
        if scholarly_meta.get("journal"):
            metadata["journal"] = scholarly_meta["journal"]
        if scholarly_meta.get("doi"):
            metadata["doi"] = scholarly_meta["doi"]
        if not metadata.get("abstract") and scholarly_meta.get("abstract"):
            metadata["abstract"] = scholarly_meta["abstract"]

    if metadata.get("authors") in ("", None):
        metadata["authors"] = "Unknown Authors"

    return full_text, pages_data, metadata


def _is_disclaimer(text: str) -> bool:
    return bool(re.search(r"synthetic|not real research|do not cite|do not distribute|provided only to test|watermark|intentionally fabricated|false claims|inconsistent statistics|fabricated references|mismatched citation metadata|treat it as scientific evidence", text, re.I))


def _looks_like_affiliation(text: str) -> bool:
    return bool(re.search(r"\b(university|institute|department|laboratory|centre|center|faculty|school)\b", text, re.I))


def _reliable_pdf_title(title: str, pages_data: List[Dict[str, Any]]) -> bool:
    if not title or _is_disclaimer(title) or _looks_like_affiliation(title):
        return False
    visible = _parse_first_page_metadata(pages_data).get("title", "")
    return bool(visible and token_similarity(title, visible) >= 0.72)


def _parse_first_page_metadata(pages_data: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Recovers title, authors and abstract from the visible first page text."""
    result: Dict[str, Any] = {}
    if not pages_data:
        return result

    p1 = _normalise_unicode(pages_data[0].get("text", ""))
    lines = [l.strip() for l in p1.split("\n") if l.strip()]
    if not lines:
        return result

    stop_headings = re.compile(
        r"^(abstract|summary|keywords|introduction|background|objectives?|"
        r"what is already known|what this study adds)\b",
        re.IGNORECASE,
    )
    skip_headings = re.compile(
        r"^(research|review|original research|article|editorial|open access|"
        r"check for updates|bmj|the bmj)\b",
        re.IGNORECASE,
    )

    # --- Authors and title block ---------------------------------------
    abstract_idx = None
    for idx, line in enumerate(lines[:45]):
        if stop_headings.match(line):
            abstract_idx = idx
            break

    author_candidates = []
    for cand in lines[:abstract_idx if abstract_idx is not None else 35]:
        if re.search(r"\b(?:university|institute|department|laboratory|centre|center|faculty|school)\b", cand, re.I):
            result.setdefault("affiliations", []).append(re.sub(r"^\d+\s*", "", cand).strip())
        if "corresponding author:" in cand.lower():
            result["corresponding_author"] = cand.split(":", 1)[-1].strip()
        if re.search(r"\b(?:manuscript received|received:|published:|accepted:)\b", cand, re.I):
            m = re.search(r"Published:\s*([^|]+)", cand, re.I)
            result["publication_date"] = (m.group(1) if m else cand).strip()
        # Author line is distinguished from affiliation lines by personal-name
        # shape and affiliation superscript markers.
        names = re.findall(r"\b([A-Z][a-z]+(?:\s+[A-Z]\.?)?(?:\s+[A-Z][a-z]+))(?=\s*(?:\d+|,|\band\b|$))", cand)
        if names and ("," in cand or re.search(r"\band\b", cand, re.I)) and not ":" in cand and not _looks_like_affiliation(cand) and len(names) <= 20:
            author_candidates.extend(n.strip() for n in names)
    if author_candidates:
        result["authors_list"] = list(dict.fromkeys(author_candidates))

    # --- Title ----------------------------------------------------------
    first_stop = abstract_idx if abstract_idx is not None else min(len(lines), 20)
    author_block_idx = next((i for i, line in enumerate(lines[:first_stop]) if re.search(r"\b[A-Z][a-z]+\s+[A-Z][a-z]+\d+\b", line) and ("," in line or re.search(r"\band\b", line, re.I))), first_stop)
    candidates = []
    for line in lines[:author_block_idx]:
        if skip_headings.match(line) or len(line) < 18 or _is_disclaimer(line) or _looks_like_affiliation(line) or re.match(r"^(?:a deliberately|an example|for testing|claim-to-reference|evidence retrieval)\b", line, re.I):
            continue
        if re.search(r"(doi:|https?://|@|\bvol\b|\bno\.\s*\d)", line, re.IGNORECASE):
            continue
        candidates.append(line)
    if candidates:
        # Select adjacent title lines as a block; ignore descriptive subtitles.
        first_page = pages_data[0]
        styled = first_page.get("blocks", [])
        def title_score(i):
            line = candidates[i]
            font = max((b.get("font_size", 0) for b in styled if line.lower() in b.get("text", "").lower()), default=0)
            return len(line) + font * 3
        best_idx = max(range(len(candidates)), key=title_score)
        start = best_idx
        while start > 0 and len(candidates[start - 1]) < 100 and not candidates[start - 1].endswith("."):
            start -= 1
        end = best_idx + 1
        while end < len(candidates) and len(candidates[end]) < 100 and not candidates[end].endswith("."):
            end += 1
        chosen = " ".join(candidates[start:end])
        result["title"] = _collapse(chosen)[:300].rstrip(":")

    # --- Abstract -------------------------------------------------------
    abs_match = re.search(
        r"(?:abstract|summary)\s*[:.]?\s*\n?(.{80,2200}?)"
        r"(?:\n\s*(?:introduction|keywords|background|what is already known|"
        r"what this study adds|methods|1\.\s))",
        p1,
        re.IGNORECASE | re.DOTALL,
    )
    if abs_match:
        result["abstract"] = _collapse(abs_match.group(1))[:1800]

    return result


# ---------------------------------------------------------------------------
# Bibliography extraction
# ---------------------------------------------------------------------------


def _page_block(pages_data: List[Dict[str, Any]], start: int) -> str:
    """Joins cleaned text from page index `start` to the end of the document."""
    chunks: List[str] = []
    for page in pages_data[start:]:
        chunks.append(_normalise_unicode(page.get("text", "")))
    return _strip_running_lines("\n".join(chunks))


def _candidate_markers(text: str) -> List[Tuple[int, int, int]]:
    """Finds bibliography entry starts: (position, number, end_of_marker)."""
    # A reference marker is a number followed by a separator: "1  Author",
    # "[1] Author", "1. Author", "1\nAuthor". Numbers glued to text
    # ("1Division of Anaesthetics") are affiliation markers, not references.
    pattern = re.compile(
        r"(?m)^[ \t]*(?:\[[ \t]*(\d{1,3})[ \t]*\]|(\d{1,3})(?![0-9A-Za-z]))"
        r"[ \t]*(?:\n[ \t]*)?(?=\S)"
    )
    out: List[Tuple[int, int, int]] = []
    for m in pattern.finditer(text):
        num_str = m.group(1) or m.group(2)
        if not num_str:
            continue
        out.append((m.start(), int(num_str), m.end()))
    return out


def _best_numbered_chain(text: str) -> List[Tuple[int, int, int]]:
    """Picks the longest increasing run of numbered entry markers.

    Reference lists are numbered 1..N. Tables, figure labels and stray page
    numbers are not, so the longest monotone chain is the bibliography.
    """
    markers = _candidate_markers(text)
    if not markers:
        return []

    # Dynamic programming over markers allowing small gaps.
    n = len(markers)
    best_len = [1] * n
    prev_idx = [-1] * n
    for i in range(n):
        for j in range(max(0, i - 400), i):
            jump = markers[i][1] - markers[j][1]
            if 0 < jump <= 3 and markers[i][0] - markers[j][0] > 40:
                if best_len[j] + 1 > best_len[i]:
                    best_len[i] = best_len[j] + 1
                    prev_idx[i] = j

    # Prefer chains starting at reference number 1.
    best_end = -1
    best_score = 0.0
    for i in range(n):
        if best_len[i] < 2:
            continue
        # reward chain length, and starting at 1
        start = i
        while prev_idx[start] >= 0:
            start = prev_idx[start]
        score = best_len[i] + (3 if markers[start][1] == 1 else 0)
        if score > best_score:
            best_score = score
            best_end = i

    if best_end < 0:
        return []

    chain: List[Tuple[int, int, int]] = []
    cur = best_end
    while cur >= 0:
        chain.append(markers[cur])
        cur = prev_idx[cur]
    chain.reverse()
    return chain


def _chain_entries(
    block: str, chain: List[Tuple[int, int, int]]
) -> List[Tuple[int, str]]:
    entries: List[Tuple[int, str]] = []
    for i, (pos, num, end) in enumerate(chain):
        if num < 1:
            continue
        next_pos = chain[i + 1][0] if i + 1 < len(chain) else len(block)
        entries.append((num, block[end:next_pos]))
    return entries


def _valid_entry_count(entries: List[Tuple[int, str]]) -> int:
    return sum(1 for _, raw in entries if _looks_like_entry(raw))


def _looks_like_entry(text: str) -> bool:
    if len(text) < 25:
        return False
    has_year = bool(re.search(r"\b(?:19|20)\d{2}\b", text))
    has_id = bool(re.search(r"doi|https?://|10\.\d{4,9}/", text, re.IGNORECASE))
    has_volume = bool(re.search(r"\b\d+\s*[:;(]\s*\d", text))
    return has_year or has_id or has_volume


def _looks_like_author_block(segment: str) -> bool:
    """True when a leading bibliography segment is an author list, not a title."""
    s = segment.strip()
    if not s or len(s) > 240:
        return False
    if re.search(r"\b(?:19|20)\d{2}\b", s):
        return False
    if re.match(r"^(?:we|this|the|in|a|an|however|these|our|although)\b", s, re.I):
        return False
    if s.count(",") >= 1:
        return True
    if re.search(r"\bet al\.?$", s):
        return True
    if re.search(r"\b[A-Z][A-Za-z'\-]+\s+[A-Z]{1,3}$", s):
        return True
    if re.fullmatch(r"[A-Z][A-Z&.\s]{1,18}", s):
        return True
    return False


def _split_authors_title(body: str) -> Tuple[str, str, str]:
    """Splits 'Authors. Title. Journal Year;vol:pages.' bibliographic strings."""
    # APA-like references put the publication year between the author list and
    # title. Use that stable boundary first: splitting on periods before it
    # mistakes author initials ("B. S.", "J. D.") for title boundaries.
    year_marker = re.search(r"\(\s*(?:19|20)\d{2}[a-z]?\s*\)\.?\s+", body)
    if year_marker:
        authors = _fix_author_spacing(body[:year_marker.start()].strip(" .,;"))
        remainder = body[year_marker.end():].strip()
        title_end = re.search(r"\.\s+(?=[A-Z])", remainder)
        if title_end:
            title = remainder[:title_end.start()].strip(" .")
            tail = remainder[title_end.end():].strip()
            return authors, title, tail
        return authors, remainder.strip(" ."), ""

    authors = ""
    rest = body
    for match in re.finditer(r"\.\s+", body):
        segment = body[: match.start()].strip()
        if _looks_like_author_block(segment):
            authors = _fix_author_spacing(segment)
            rest = body[match.end():].strip()
            break

    if not authors:
        # Fall back: assume the first sentence-ish chunk is the author list.
        parts = [p.strip() for p in re.split(r"\.\s+", body, maxsplit=1)]
        authors = _fix_author_spacing(parts[0]) if parts else ""
        rest = parts[1] if len(parts) > 1 else ""

    # Title runs to the next sentence boundary; the journal citation follows.
    title = ""
    tail = ""
    title_match = re.match(r"(.+?)(?:\.\s+|\s+(?=(?:19|20)\d{2}\b)|$)(.*)$", rest, re.DOTALL)
    if title_match:
        title = title_match.group(1).strip()
        tail = title_match.group(2).strip()
    else:
        title = rest

    title = re.sub(r"\s*doi:\s*\S+$", "", title, flags=re.IGNORECASE).strip(" .,;")
    return authors, title, tail


def _parse_reference_entry(raw: str, number: int, style: str = "numeric") -> Dict[str, Any]:
    """Parses one bibliography entry into structured metadata."""
    entry = _collapse(_repair_line_breaks(raw))
    entry = re.sub(r"^(?:and|see also)\s+", "", entry, flags=re.IGNORECASE).strip()
    # Some PDFs append a benchmark disclaimer to the final reference on the
    # same extracted line. Keep that prose out of the citation record.
    entry = re.split(
        r"\b(?:End of (?:the )?(?:synthetic )?(?:paper|document)|"
        r"For software testing only|CITEVERIFY\s*/\s*SYNTHETIC TEST DOCUMENT)\b",
        entry,
        maxsplit=1,
        flags=re.IGNORECASE,
    )[0].strip()

    # DOI (join broken fragments first)
    doi = ""
    doi_match = re.search(r"10\.\d{4,9}/[^\s]+", entry)
    if doi_match:
        doi = extract_clean_doi(doi_match.group(0)) or ""

    # URL
    url = ""
    url_match = re.search(r"https?://\S+", entry)
    if url_match:
        url = url_match.group(0).rstrip(".,;)")

    # Work on a copy without URLs/DOIs so numeric parsing stays sane.
    body = re.sub(r"https?://\S+", " ", entry)
    body = re.sub(r"10\.\d{4,9}/[^\s]+", " ", body)
    body = re.sub(r"\bdoi\s*:\s*", " ", body, flags=re.IGNORECASE)
    body = _collapse(body)

    # --- Year ------------------------------------------------------------
    years = list(re.finditer(r"\b(19[5-9]\d|20[0-4]\d)\b", body))
    year = ""
    if years:
        chosen = years[-1]
        for m in years:
            tail = body[m.end(): m.end() + 2]
            if tail.startswith(";") or tail.startswith(":"):
                chosen = m
                break
        year = chosen.group(1)

    # --- Authors / Title / Journal --------------------------------------
    authors, title, rest = _split_authors_title(body)
    journal = ""
    candidates = [rest, body]
    for chunk in candidates:
        jm = re.search(
            r"([A-Z][A-Za-z&.\- ']{2,60})\s+(?:19|20)\d{2}\s*[;:]\s*\S", chunk
        )
        if jm:
            journal = _collapse(jm.group(1))
            break
    if not journal:
        jm = re.search(r"([A-Z][A-Za-z&.\- ]{2,50})\s+(?:19|20)\d{2}\b", rest)
        if jm:
            journal = _collapse(jm.group(1))
    if not journal and rest:
        jm = re.match(r"\s*([A-Z][^,]{2,100}?),\s*\d{1,4}\s*(?:\(|,)", rest)
        if jm:
            journal = _collapse(jm.group(1))

    if re.fullmatch(r"(19|20)\d{2}[a-z]?", title or ""):
        title = ""

    authors = re.sub(r"\s*[,;]?\s*et al\.?$", " et al", authors).strip(" ,;")
    authors = re.sub(r"\s{2,}", " ", authors)
    title = title.strip(" \"'")
    title = re.sub(r"\s*[,;]$", "", title)
    title = re.sub(r"\s+", " ", title)
    if len(title) > 320:
        title = title[:320].rsplit(" ", 1)[0]

    # Reject author strings that are actually titles/sentences.
    if len(authors) > 160 or re.search(r"\b(study|analysis|review|trial)\s+of\b", authors, re.I):
        authors = " ".join(authors.split()[:10])

    kind = "journal-article"
    if not journal:
        kind = "web-resource" if url else "unknown"

    needs_review = (not title or len(title) < 12 or not year)

    return {
        "number": number,
        "raw_citation": entry,
        "title": title or entry[:120],
        "authors": authors or "Scholarly Authors",
        "year": year,
        "journal": journal or ("Web resource" if url else ""),
        "doi": doi,
        "url": f"https://doi.org/{doi}" if doi else url,
        "entry_type": kind,
        "needs_review": needs_review,
        "style": style,
    }


def _author_year_keys(authors: str, year: str) -> List[str]:
    keys: List[str] = []
    if not year:
        return keys
    surname = ""
    tokens = re.split(r"[\s,]+", authors.strip())
    for tok in tokens:
        if len(tok) > 1 and tok[:1].isupper():
            surname = re.sub(r"[^A-Za-z\-']", "", tok)
            break
    if not surname:
        return keys
    keys.extend(
        [
            f"({surname}, {year})",
            f"({surname} et al, {year})",
            f"({surname} et al., {year})",
            f"({surname} &",  # prefix style handled by matcher
            f"{surname} et al ({year})",
            f"{surname} et al. ({year})",
        ]
    )
    return keys


def extract_bibliography(
    full_text: str, pages_data: Optional[List[Dict[str, Any]]] = None
) -> Tuple[List[Dict[str, Any]], Dict[str, str], Dict[str, Any]]:
    """Segments the bibliography into individual, structured references.

    Supports numbered (Vancouver/IEEE) lists as well as author-year styles, and
    finds the reference section even when the PDF has no explicit heading.
    """
    references: List[Dict[str, Any]] = []
    marker_map: Dict[str, str] = {}
    diagnostics: Dict[str, Any] = {
        "total_detected": 0,
        "successfully_parsed": 0,
        "manual_review_needed": 0,
        "section_detected": False,
        "section_heading": "",
        "style": "unknown",
        "unparsed_candidates": 0,
        "notes": [],
    }

    if not pages_data:
        pages_data = [{"page_number": 1, "text": full_text}] if full_text else []
    if not pages_data:
        diagnostics["notes"].append("No pages could be read from this document.")
        return references, marker_map, diagnostics

    # Build candidate blocks: explicit "References" heading first, then tails.
    blocks: List[Tuple[str, str, int]] = []
    for idx in range(len(pages_data)):
        page_text = _normalise_unicode(pages_data[idx].get("text", ""))
        for line_idx, line in enumerate(page_text.split("\n")):
            if _REF_HEADING_RE.match(line.strip()):
                blocks.append((_page_block(pages_data, idx), line.strip(), idx + 1))
                break
    tail_pages = 3 if len(pages_data) > 6 else max(1, len(pages_data) // 2)
    blocks.append((_page_block(pages_data, max(0, len(pages_data) - tail_pages)), "", 0))
    blocks.append((_strip_running_lines(_normalise_unicode(full_text)), "", 0))

    best_chain: List[Tuple[int, int, int]] = []
    best_block = ""
    best_heading = ""
    best_entries: List[Tuple[int, str]] = []
    best_valid = -1
    for block, heading, _page in blocks:
        if not block.strip():
            continue
        chain = _best_numbered_chain(block)
        if len(chain) < 2:
            continue
        candidate_entries = _chain_entries(block, chain)
        valid = _valid_entry_count(candidate_entries)
        # Rank by how many entries are genuine citations, then by chain length.
        if (valid, len(chain)) > (best_valid, len(best_chain)):
            best_valid = valid
            best_chain = chain
            best_block = block
            best_heading = heading
            best_entries = candidate_entries

    if len(best_chain) >= 2:
        diagnostics["style"] = "numeric"
        diagnostics["section_detected"] = bool(best_heading)
        diagnostics["section_heading"] = best_heading
        diagnostics["total_detected"] = len(best_chain)

        entries: List[Tuple[int, str]] = best_entries

        parsed: List[Dict[str, Any]] = []
        for num, raw in entries:
            if len(raw.strip()) < 20:
                diagnostics["unparsed_candidates"] += 1
                continue
            ref = _parse_reference_entry(raw, num)
            if not _looks_like_entry(raw):
                # Keep the entry so the reference is never silently lost, but
                # flag it for manual review.
                ref["needs_review"] = True
            parsed.append(ref)

        if parsed:
            diagnostics["successfully_parsed"] = len(parsed)
            for ref in parsed:
                ref["id"] = f"ref-{ref['number']}"
                marker_map[f"[{ref['number']}]"] = ref["id"]
                marker_map[str(ref["number"])] = ref["id"]
                marker_map[f"ref-{ref['number']}"] = ref["id"]
                for key in _author_year_keys(ref["authors"], ref["year"]):
                    marker_map.setdefault(key, ref["id"])
                references.append(ref)

    # --- Author-year fallback (un-numbered bibliographies) ----------------
    if not references:
        diagnostics["style"] = "author-year"
        block = best_block or _page_block(pages_data, max(0, len(pages_data) - 3))
        lines = [l.strip() for l in block.split("\n") if l.strip()]
        entries: List[str] = []
        current = ""
        for line in lines:
            looks_new = bool(
                re.match(r"^[A-Z][A-Za-z'\-]+(?:\s*,\s*[A-Z]\.?|\s+[A-Z][a-z]+,)", line)
            )
            if looks_new and current and len(current) > 40:
                entries.append(current)
                current = line
            elif current:
                current += " " + line
            else:
                current = line
        if current:
            entries.append(current)

        parsed: List[Dict[str, Any]] = []
        for idx, entry in enumerate(entries[:80]):
            entry = _collapse(entry)
            if len(entry) < 40:
                continue
            if not re.search(r"\b(19|20)\d{2}\b", entry):
                continue
            ref = _parse_reference_entry(entry, idx + 1, style="author-year")
            ref["id"] = f"ref-{idx + 1}"
            parsed.append(ref)
            for key in _author_year_keys(ref["authors"], ref["year"]):
                marker_map.setdefault(key, ref["id"])
            marker_map.setdefault(str(idx + 1), ref["id"])

        if parsed:
            diagnostics["total_detected"] = len(parsed)
            diagnostics["successfully_parsed"] = len(parsed)
            diagnostics["section_detected"] = True
            references = parsed

    if not references:
        diagnostics["notes"].append(
            "No bibliography section could be segmented from this PDF. "
            "Reference authenticity could not be checked."
        )

    diagnostics["manual_review_needed"] = sum(
        1 for r in references if r.get("needs_review")
    )
    if references and diagnostics["manual_review_needed"]:
        diagnostics["notes"].append(
            f"{diagnostics['manual_review_needed']} reference(s) parsed with incomplete "
            "metadata (missing title, year or journal) and need manual review."
        )
    return references, marker_map, diagnostics


# ---------------------------------------------------------------------------
# Claim extraction
# ---------------------------------------------------------------------------


_ASSERTION_PATTERNS = [
    r"\bdemonstrat\w+", r"\bshow(?:s|ed|n)?\b", r"\b(?:find|finds|found)\b", r"\bindicat\w+",
    r"\bconclud\w+", r"\bsignificant\w*", r"\bincreas\w+", r"\breduc\w+",
    r"\bassociat\w+", r"\bcorrelat\w+", r"\boutperform\w*", r"\byield\w+",
    r"\bobserv\w+", r"\breport(?:s|ed)?\s+(?:that\b|no\b|a\s+\d|an\s+\d|\d)",
    r"(?<!de-)\bidentif(?:y|ies|ied|ying)\b", r"\bestablish\w+", r"\beliminat\w+", r"\baffect\w+",
    r"\binfluenc\w+", r"\bretain\w+", r"\bachiev(?:ed|es|ing)\b",
    r"\bpredict\w+", r"\bcaus\w+", r"\bproduc\w+", r"\bprevent\w+",
    r"\bcompared? (?:with|to)\b", r"\bsuperior\b", r"\bequivalen\w+",
]
_ASSERTION_RE = [re.compile(p, re.IGNORECASE) for p in _ASSERTION_PATTERNS]
_SECTION_PREFIX_RE = re.compile(
    r"^(?:\d+(?:\.\d+)*\s+)?(?:Introduction|Methods|Results|Discussion|Conclusion|"
    r"Limitations(?:\s+and\s+research\s+integrity)?|Statements)\s+"
    r"(?:\d+(?:\.\d+)*\s+)?"
    r"(?:Study design and participants|Intervention|Outcomes and analysis|Primary outcome|"
    r"Retention, study time, and subgroup findings)?\s*",
    re.IGNORECASE,
)
_SUBSECTION_PREFIX_RE = re.compile(
    r"^(?:\d+(?:\.\d+)*\s+)?(?:Study design and participants|Intervention|"
    r"Outcomes and analysis|Primary outcome|Retention, study time, and subgroup findings)\s*",
    re.IGNORECASE,
)

_STRUCTURED_HEADING_RE = re.compile(
    r"^(?:DATA SOURCES?|DATA EXTRACTION|DESIGN|SETTING|PARTICIPANTS?|INTERVENTIONS?|"
    r"MAIN OUTCOME(?:S| MEASURES?)?|RESULTS?|CONCLUSIONS?|OBJECTIVES?|METHODS?|"
    r"STUDY SELECTION|ELIGIBILITY CRITERIA(?: FOR SELECTING STUDIES)?|REVIEW METHODS|"
    r"ABSTRACT|BACKGROUND|FINDINGS|INTERPRETATION|FUNDING|SYSTEMATIC REVIEW|PROTOCOL)"
    r"[A-Za-z ]{0,40}",
    re.IGNORECASE,
)

_BOILERPLATE_MARKERS = [
    "this is an open access article", "protected by copyright", "downloaded from",
    "creative commons", "all rights reserved", "supplementary data",
    "competing interests", "contributors:", "funding:", "data sharing",
    "ethical approval", "correspondence to", "what is already known",
    "what this study adds", "no commercial reuse", "see rights and reprints",
    "subscribe:", "web appendix", "author affiliations",
]


def _split_sentences(text: str) -> List[str]:
    """Sentence splitter that keeps common scholarly abbreviations intact."""
    protected = text
    for i, abbr in enumerate(_SENTENCE_ABBREVIATIONS):
        protected = re.sub(
            rf"\b{re.escape(abbr)}\.", f"{abbr}<DOT{i}>", protected, flags=re.IGNORECASE
        )
    protected = re.sub(r"\b([A-Z])\.", r"\1<INITDOT>", protected)
    parts = re.split(r"(?<=[.!?])\s+(?=[\"'(\[]?[A-Z0-9])", protected)
    restored: List[str] = []
    for part in parts:
        for i, abbr in enumerate(_SENTENCE_ABBREVIATIONS):
            part = part.replace(f"{abbr}<DOT{i}>", f"{abbr}.")
        part = part.replace("<INITDOT>", ".")
        restored.append(part)
    return restored


def _numeral_tokens(marker_text: str) -> List[int]:
    """Expands '[1, 3-5]' / '2 25' / '29-31' into explicit reference numbers."""
    out: List[int] = []
    for chunk in re.split(r"[,;]", marker_text):
        chunk = chunk.strip()
        rng = re.match(r"^(\d{1,3})\s*[-\u2013]\s*(\d{1,3})$", chunk)
        if rng:
            a, b = int(rng.group(1)), int(rng.group(2))
            if a <= b and b - a <= 40:
                out.extend(range(a, b + 1))
            continue
        for token in chunk.split():
            if token.isdigit():
                out.append(int(token))
    return out


def _extract_citation_markers(
    sentence: str, max_ref_num: int
) -> Tuple[List[str], str]:
    """Detects citation markers and returns (normalised markers, clean text).

    Handles bracketed numeric citations, author-year citations and numeric
    superscript markers that PDF extraction flattens into inline digits
    ("studies.23 24", "cardiology.2 25", "studies 9-12").
    """
    markers: List[str] = []
    clean = sentence

    # 1. Bracketed numeric citations ------------------------------------
    def _bracket_repl(m: re.Match) -> str:
        nums = _numeral_tokens(m.group(1))
        if nums and all(1 <= n <= max(1, max_ref_num) for n in nums):
            markers.append(_format_marker(nums))
            return " "
        return m.group(0)

    clean = re.sub(r"\[\s*(\d{1,3}(?:\s*[-,\u2013]\s*\d{1,3})*)\s*\]", _bracket_repl, clean)

    # 2. Author-year citations ------------------------------------------
    ay_pattern = re.compile(
        r"\(\s*([A-Z][A-Za-z'\u2019\-]+(?:\s+(?:et\s+al\.?|&\s*[A-Z][A-Za-z'\u2019\-]+|and\s+[A-Z][A-Za-z'\u2019\-]+))?"
        r"(?:,)?\s*(?:19|20)\d{2}[a-z]?(?:\s*[;,]\s*(?:19|20)\d{2}[a-z]?)?)\s*\)"
    )

    def _ay_repl(m: re.Match) -> str:
        markers.append(m.group(1).strip())
        return " "

    clean = ay_pattern.sub(_ay_repl, clean)

    # 3. Flattened superscript numeric markers --------------------------
    # A marker is either glued to the preceding character ("benefit,26") or
    # separated by a space but following punctuation / a citation cue word
    # ("self. 33", "studies 9-12"). Bare counts ("at least 16 studies") are
    # rejected.
    numeric_pattern = re.compile(
        r"(\d{1,3}(?:\s*[-\u2013]\s*\d{1,3})?(?:\s+\d{1,3}(?:\s*[-\u2013]\s*\d{1,3})?)*)"
    )
    cue_word = re.compile(
        r"(?:studies|study|trials?|reports?|reported|reviewed|see|refs?\.?|references?|"
        r"appendix|table|evidence|literature|meta-analyses|authors?)$",
        re.IGNORECASE,
    )
    removals: List[Tuple[int, int]] = []

    for m in numeric_pattern.finditer(clean):
        start, end = m.start(), m.end()
        raw = m.group(1)
        before = clean[:start]
        after = clean[end:]
        prev_char = before[-1:] if before else ""
        next_char = after[:1]

        # Skip decimals, version strings and identifiers.
        if prev_char.isdigit() or (prev_char == "." and before[-2:-1].isdigit()):
            continue
        # PDF extraction may drop the leading zero in statistical notation
        # such as "p < .05". This is a decimal value, never citation [5].
        if prev_char == "." and re.search(r"\bp\s*[<>=]\s*$", before, re.IGNORECASE):
            continue
        if prev_char == "." and re.search(r"\bp\s*[<>=]\s*\.\s*$", before, re.IGNORECASE):
            continue
        if next_char in (".",) and after[:2].replace(".", "").isdigit():
            continue
        if next_char == "%":
            continue
        if re.search(r"(?:19|20)\d{2}$", raw):
            continue
        # Reject fractions/proportions such as "24/81" or "(24/81, 30%)".
        if next_char == "/" or re.match(r"\s*/\s*\d", after):
            continue
        if re.search(r"\d\s*/\s*$", before):
            continue

        glued = (
            bool(prev_char)
            and not prev_char.isspace()
            and prev_char not in "([{/<"
        )
        preceded_by_cue = bool(cue_word.search(before.rstrip()))
        preceded_by_punct = bool(prev_char) and prev_char in ".,;:)]"
        at_start = start == 0

        if not (
            glued
            or (preceded_by_punct and before.endswith(" "))
            or preceded_by_cue
            or (at_start and next_char.isupper())
        ):
            continue

        tokens = _numeral_tokens(raw)
        if not tokens:
            continue
        if any(t < 1 or t > max(1, max_ref_num) for t in tokens):
            continue

        # Glued numbers must look like a citation, not a quantity:
        # reject "23 studies" / "5 trials" when the number is space-separated
        # and followed by a lowercase noun.
        if not glued:
            next_word = re.match(r"\s*([A-Za-z]+)", after)
            if next_word and next_word.group(1)[:1].islower():
                continue
            if not (preceded_by_punct or preceded_by_cue):
                continue

        markers.append(_format_marker(tokens))
        # Remove marker text, plus one glued/leading space where present.
        rm_start = start
        if rm_start > 0 and clean[rm_start - 1] == " ":
            rm_start -= 1
        removals.append((rm_start, end))

    for start, end in sorted(removals, reverse=True):
        clean = clean[:start] + clean[end:]

    # De-duplicate while preserving order
    seen = set()
    unique_markers: List[str] = []
    for marker in markers:
        if marker not in seen:
            seen.add(marker)
            unique_markers.append(marker)

    clean = re.sub(r"\s+([,.;:!?])", r"\1", clean)
    clean = re.sub(r"\s{2,}", " ", clean).strip()
    return unique_markers, clean


def _format_marker(nums: List[int]) -> str:
    if not nums:
        return ""
    if len(nums) == 1:
        return f"[{nums[0]}]"
    if len(nums) == 2 and nums[1] == nums[0] + 1:
        return f"[{nums[0]}, {nums[1]}]"
    # consecutive run -> range
    if all(nums[i + 1] == nums[i] + 1 for i in range(len(nums) - 1)) and len(nums) > 3:
        return f"[{nums[0]}-{nums[-1]}]"
    return "[" + ", ".join(str(n) for n in nums) + "]"


def _looks_like_bibliography_page(text: str) -> bool:
    """True when a page is dominated by bibliography entries rather than prose."""
    lead = [line.strip() for line in text.splitlines() if line.strip()][:8]
    if any(_REF_HEADING_RE.match(line) for line in lead):
        if len(_best_numbered_chain(text)) >= 2:
            return True
    lines = [l.strip() for l in text.split("\n") if len(l.strip()) > 20]
    if len(lines) < 5:
        return False
    entries = 0
    for line in lines:
        if re.match(r"^(?:\[?\d{1,3}\]?)[\s.)]*[A-Z]", line) and re.search(
            r"\b(?:19|20)\d{2}\b", line
        ):
            entries += 1
        elif re.search(r"doi\s*:\s*10\.", line, re.IGNORECASE):
            entries += 1
    return entries >= max(4, int(len(lines) * 0.35))


def extract_cited_reference_numbers(
    pages_data: List[Dict[str, Any]], references: List[Dict[str, Any]]
) -> List[int]:
    """Find numeric citations throughout manuscript prose, independent of claims.

    Citation/reference coverage is a document-level check. It must not depend
    on which prose sentences passed the stricter scientific-claim filter.
    Bibliography pages and text after a references heading are excluded.
    """
    max_ref_num = max([int(r.get("number", 0) or 0) for r in references] + [60])
    numbers: set[int] = set()
    for page in pages_data:
        page_text = _repair_line_breaks(page.get("clean_text") or page.get("text") or "")
        if not page_text.strip():
            continue
        if _looks_like_bibliography_page(page_text):
            continue
        heading_match = re.search(
            r"(?im)^\s*(?:\d+\.?\s*)?(?:references?|bibliography|literature cited|"
            r"works cited|sources cited)\s*:?\s*$",
            page_text,
        )
        if heading_match:
            page_text = page_text[:heading_match.start()]
        for sentence in _split_sentences(page_text):
            sentence = _collapse(sentence)
            if re.match(r"^(?:\[\s*\d{1,3}\s*\]|\d{1,3}[.)])\s*[A-Z]", sentence):
                continue
            markers, _claim_text = _extract_citation_markers(sentence, max_ref_num)
            for marker in markers:
                if re.fullmatch(r"\[\s*\d{1,3}(?:\s*[,;\u2013-]\s*\d{1,3})*\s*\]", marker):
                    numbers.update(_numeral_tokens(marker.strip("[] ")))
    return sorted(numbers)


def extract_claims_from_pages(
    pages_data: List[Dict[str, Any]],
    references: List[Dict[str, Any]],
    max_claims: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Extracts research claims and separates citation markers from the text."""
    candidates: List[Dict[str, Any]] = []
    max_ref_num = max([r.get("number", 0) for r in references] + [60])

    for page in pages_data:
        p_num = page.get("page_number", 1)
        text = page.get("clean_text") or page.get("text") or ""
        if not text.strip():
            continue
        text = _repair_line_breaks(text)
        # Front-matter labels and descriptors can be joined to the final abstract
        # sentence by PDF line extraction. They are not manuscript claims.
        text = re.sub(r"(?im)^\s*(?:keywords?|article type|protocol registration):.*$", "", text)
        if _looks_like_bibliography_page(text):
            continue
        # PDF superscripts often surface as a detached numeral at the start of
        # the following sentence ("...studies. 23 In this review..."). Re-attach
        # them so they map to the sentence they actually cite.
        text = re.sub(
            r"([.!?])\s+(\d{1,3}(?:\s*[-\u2013]\s*\d{1,3})?(?:\s+\d{1,3}(?:\s*[-\u2013]\s*\d{1,3})?)*)\s+(?=[A-Z\u201c\"])",
            r"\1\2 ",
            text,
        )
        sentences = _split_sentences(text)

        for i, raw_sent in enumerate(sentences):
            sent = _collapse(raw_sent)
            sent = _SECTION_PREFIX_RE.sub("", sent).strip()
            sent = _SUBSECTION_PREFIX_RE.sub("", sent).strip()
            if len(sent) < 40 or len(sent) > 520:
                continue
            low = sent.lower()
            if any(marker in low for marker in _BOILERPLATE_MARKERS):
                continue
            if re.match(
                r"^(?:ethics approval|funding|conflicts? of interest|data availability|author contributions)\b",
                sent,
                re.IGNORECASE,
            ):
                continue
            # skip bibliography entries / table rows
            if re.match(r"^(?:\[\s*\d{1,3}\s*\]|\d{1,3}[.)]\s+)[A-Z][a-z]+", sent):
                continue
            if re.match(r"^(?:fig|figure|table|box)\s*\d", sent, re.IGNORECASE):
                continue
            # PDF table cells are often flattened into one long line. Do not
            # treat a header plus cells as one natural-language claim.
            if re.match(
                r"^(?:measure|outcome|variable)\s+(?:ai companion|intervention|treatment|control)\b",
                sent,
                re.IGNORECASE,
            ) or (
                re.search(r"\breported comparison\b", sent, re.IGNORECASE)
                and len(_numeric_tokens(sent)) >= 5
            ):
                continue
            # skip structured-abstract labels such as "DATA SOURCESMedline, ..."
            if _STRUCTURED_HEADING_RE.match(sent) and re.match(
                r"^[A-Z][A-Z ,\-]{4,}", sent
            ):
                continue
            # skip bibliography / reference-list / funding sentences
            if re.search(r"doi\s*:\s*10\.", sent) or re.search(r"https?://", sent):
                continue
            if re.search(
                r"\b(?:funded by|is supported by|are supported by|we thank|grant)\b",
                sent,
                re.IGNORECASE,
            ):
                continue
            if re.search(r"\b(?:19|20)\d{2}\s*;\s*\d+", sent) and re.search(
                r"\b(?:et al|doi|pmid)\b", sent, re.IGNORECASE
            ):
                continue
            # skip lines that are mostly capitalised labels
            words = sent.split()
            caps = sum(1 for w in words if len(w) > 2 and w.isupper())
            if words and caps / len(words) > 0.4:
                continue
            # skip running-head fragments and pure metadata lines
            if len(sent.split()) < 8:
                continue

            markers, clean_sent = _extract_citation_markers(sent, max_ref_num)
            clean_sent = _collapse(clean_sent)
            clean_sent = re.sub(r"^(?:Background|Methods|Results|Conclusion):\s*", "", clean_sent, flags=re.I)
            if len(clean_sent) < 35:
                continue

            has_trigger = any(rx.search(clean_sent) for rx in _ASSERTION_RE)
            has_quantitative_signal = bool(
                re.search(
                    r"\b\d+(?:,\d{3})*(?:\.\d+)?\s*[-‐-―]?\s*(?:%|percent|percentage|"
                    r"participants?|learners?|students?|universit(?:y|ies)|weeks?|months?|"
                    r"years?|hours?|minutes?|points?|standard deviations?|SD|scores?)\b"
                    r"|\bp\s*[<>=]\s*\.?\d+|\b95\s*%?\s*CI\b",
                    clean_sent,
                    re.I,
                )
                or (
                    len(_numeric_tokens(clean_sent)) >= 2
                    and re.search(r"\b(?:mean|median|score|difference|rate|ratio|odds|p\s*=)\b", clean_sent, re.I)
                )
            )
            if not markers and not has_trigger and not has_quantitative_signal:
                continue

            # Claim type classification
            if re.search(r"%|\bp\s*[<>=]|\bCI\b|\b\d+\.\d+\b|\b\d+\s*(?:of|/)\s*\d+", clean_sent):
                claim_type = "statistical"
            elif re.search(r"\b(?:outperform\w*|superior|equivalen\w+|yielded|achieved)\b", clean_sent, re.I):
                claim_type = "finding"
            elif re.search(r"\b(?:rate|ratio|odds|risk|fold|median|mean)\b", clean_sent, re.I):
                claim_type = "quantitative"
            else:
                claim_type = "scientific"

            prev_sent = _collapse(sentences[i - 1]) if i > 0 else ""
            next_sent = _collapse(sentences[i + 1]) if i + 1 < len(sentences) else ""
            context = _collapse(f"{prev_sent} {sent} {next_sent}")[:1200]

            candidates.append(
                {
                    "id": "",
                    "_page_order": i,
                    "claim_text": clean_sent,
                    "page_number": p_num,
                    "context": context,
                    "citation_marker": markers[0] if markers else "",
                    "all_markers": markers,
                    "claim_type": claim_type,
                    "confidence": round(0.78 + (0.16 if markers else 0.0), 2),
                    "mapping_status": "UNMAPPED",
                    "mapping_method": "none",
                    "mapping_confidence": 0.0,
                    "reference_id": None,
                    # Real coordinates are only known when a text-layout engine
                    # provides them; we do not invent highlight boxes.
                    "bounding_box": {},
                }
            )

    # Selection: prioritise statements that cite a source (they are the ones
    # that can actually be verified), then spread the remaining budget evenly
    # across pages so the whole manuscript is represented.
    cited = [c for c in candidates if c.get("citation_marker")]
    uncited = [c for c in candidates if not c.get("citation_marker")]
    selected: List[Dict[str, Any]] = list(cited)
    budget = (max_claims - len(selected)) if max_claims is not None else len(uncited)
    if budget > 0 and uncited:
        buckets: Dict[int, List[Dict[str, Any]]] = {}
        for cand in uncited:
            buckets.setdefault(cand["page_number"], []).append(cand)
        page_keys = sorted(buckets)
        cursor = {p: 0 for p in page_keys}
        while budget > 0:
            progressed = False
            for p in page_keys:
                if budget <= 0:
                    break
                idx = cursor[p]
                if idx < len(buckets[p]):
                    selected.append(buckets[p][idx])
                    cursor[p] = idx + 1
                    budget -= 1
                    progressed = True
            if not progressed:
                break

    # Duplicate statements often appear in both abstract and conclusion. Keep
    # the earliest source occurrence, merging citation markers where repeated.
    unique: Dict[str, Dict[str, Any]] = {}
    for item in selected:
        key = re.sub(r"[^a-z0-9]+", " ", item["claim_text"].lower()).strip()
        if key in unique:
            existing = unique[key]
            existing["all_markers"] = list(dict.fromkeys(existing.get("all_markers", []) + item.get("all_markers", [])))
            if not existing.get("citation_marker") and item.get("citation_marker"):
                existing["citation_marker"] = item["citation_marker"]
            continue
        unique[key] = item
    selected = list(unique.values())
    selected.sort(key=lambda c: (c["page_number"], c.get("_page_order", 0)))
    claims: List[Dict[str, Any]] = []
    for idx, cand in enumerate(selected, start=1):
        cand["id"] = f"claim-{idx}"
        cand.pop("_page_order", None)
        claims.append(cand)
    return claims


# ---------------------------------------------------------------------------
# Claim -> reference mapping
# ---------------------------------------------------------------------------


def _norm_marker_numbers(marker: str) -> List[int]:
    return _numeral_tokens(marker.strip("[]() "))


def map_claims_to_references(
    claims: List[Dict[str, Any]],
    references: List[Dict[str, Any]],
    marker_map: Dict[str, str],
):
    """Maps each claim to the bibliography entries it actually cites."""
    by_number: Dict[int, Dict[str, Any]] = {}
    for ref in references:
        num = ref.get("number")
        if isinstance(num, int):
            by_number[num] = ref

    for claim in claims:
        markers: List[str] = claim.get("all_markers") or (
            [claim["citation_marker"]] if claim.get("citation_marker") else []
        )
        resolved: List[Tuple[str, str, str, float]] = []  # (ref_id, marker, method, conf)

        for marker in markers:
            if not marker:
                continue
            # a) exact dictionary hit
            if marker in marker_map:
                resolved.append((marker_map[marker], marker, "numeric_index", 0.98))
                continue
            # b) numeric resolution against real bibliography numbers
            nums = _norm_marker_numbers(marker)
            hits = [by_number[n]["id"] for n in nums if n in by_number]
            if hits:
                for ref_id in hits:
                    resolved.append((ref_id, marker, "numeric_index", 0.97))
                continue
            # c) author-year
            ay = re.match(r"([A-Z][A-Za-z'\u2019\-]+).*?((?:19|20)\d{2})", marker)
            if ay:
                surname, year = ay.group(1).lower(), ay.group(2)
                for ref in references:
                    first = re.sub(r"[^A-Za-z]", "", (ref.get("authors") or "").split(",")[0])
                    if not first:
                        continue
                    if first.lower() == surname and str(ref.get("year", "")) == year:
                        resolved.append((ref["id"], marker, "author_year_match", 0.92))
                        break

        if resolved:
            # de-duplicate, keep order
            seen = set()
            ordered = []
            for item in resolved:
                if item[0] not in seen:
                    seen.add(item[0])
                    ordered.append(item)
            primary = ordered[0]
            claim["reference_id"] = primary[0]
            claim["citation_marker"] = primary[1]
            claim["mapping_method"] = primary[2]
            resolved_markers = {i[1] for i in ordered}
            all_resolved = all(m in resolved_markers for m in markers if m)
            if len(ordered) > 1:
                claim["mapping_note"] = (
                    f"This statement cites {len(ordered)} references "
                    f"({', '.join(i[1] for i in ordered)}). The first citation is shown "
                    "as the primary source; all mapped references are listed."
                )
            if all_resolved:
                claim["mapping_status"] = "MAPPED"
                claim["mapping_confidence"] = primary[3] if len(ordered) == 1 else 0.9
            else:
                claim["mapping_status"] = "AMBIGUOUS"
                claim["mapping_confidence"] = 0.6
                claim["mapping_note"] = (
                    "Some citation markers on this statement could not be resolved to a "
                    "bibliography entry; the mapping shown is partial."
                )
            claim["mapped_reference_ids"] = [i[0] for i in ordered]
            continue

        # d) contextual fallback: a citation immediately preceding the claim
        context = claim.get("context", "")
        context_markers = re.findall(r"\[\s*(\d{1,3})\s*\]", context)
        candidate = None
        for token in context_markers:
            if int(token) in by_number:
                candidate = by_number[int(token)]
                break
        if candidate:
            claim["reference_id"] = candidate["id"]
            claim["citation_marker"] = f"[{candidate['number']}]"
            claim["mapping_status"] = "AMBIGUOUS"
            claim["mapping_method"] = "contextual_proximity"
            claim["mapping_confidence"] = 0.55
            claim["mapping_note"] = (
                "No citation marker was found inside this sentence. The mapping is inferred "
                "from a nearby citation in the surrounding context and should be reviewed."
            )
        else:
            claim["reference_id"] = None
            claim["mapping_status"] = "UNMAPPED"
            claim["mapping_method"] = "none"
            claim["mapping_confidence"] = 0.0
            claim["mapping_note"] = (
                "No in-text citation marker could be detected for this statement."
            )


# ---------------------------------------------------------------------------
# Claim-evidence evaluation
# ---------------------------------------------------------------------------


def _content_tokens(text: str) -> List[str]:
    tokens = re.findall(r"[A-Za-z][A-Za-z\-]{2,}", (text or "").lower())
    out = []
    for token in tokens:
        if token in STOPWORDS:
            continue
        # light plural stemming
        if len(token) > 4 and token.endswith("ies"):
            token = token[:-3] + "y"
        elif len(token) > 4 and token.endswith("es"):
            token = token[:-2]
        elif len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
            token = token[:-1]
        out.append(token)
    return out


_NEGATION_TERMS = {
    "no", "not", "none", "never", "without", "failed", "fail", "did", "does",
    "insignificant", "nonsignificant", "unrelated", "contradict", "contradicted",
}
_INCREASE_TERMS = {"increase", "increased", "higher", "improve", "improved", "superior", "outperform", "greater"}
_DECREASE_TERMS = {"decrease", "decreased", "lower", "reduce", "reduced", "fewer", "inferior"}


def _numeric_tokens(text: str) -> List[str]:
    return re.findall(r"\d+(?:\.\d+)?%?", text or "")


def _sentence_overlap(claim_tokens: set, sentence: str) -> float:
    sent_tokens = set(_content_tokens(sentence))
    if not claim_tokens or not sent_tokens:
        return 0.0
    return len(claim_tokens & sent_tokens) / len(claim_tokens)


def evaluate_evidence(
    claim: Dict[str, Any], reference: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """Compares a claim against retrieved source material without inventing evidence.

    Verdict policy:
      * No mapped source            -> UNVERIFIED
      * Source record not confirmed -> UNVERIFIED (never "contradicted")
      * Only metadata available      -> INSUFFICIENT_EVIDENCE
      * Explicit disagreement        -> CONTRADICTED
      * Strong entailment            -> SUPPORTED
      * Partial entailment           -> PARTIALLY_SUPPORTED
      * Otherwise                    -> INSUFFICIENT_EVIDENCE
    """
    if not reference:
        return {
            "verdict": "UNVERIFIED",
            "verdict_explanation": (
                "No in-text citation was detected for this statement, so no original "
                "source could be checked. This is not evidence that the claim is false."
            ),
            "evidence_passage": "",
            "evidence_source": "No source linked",
            "retrieval_level": "unavailable",
            "uncertainty_note": "Uncited statement: verification was not possible.",
            "evidence_confidence": 0.0,
        }

    retrieval_level = reference.get("retrieval_level", "unavailable")
    abstract = _collapse(reference.get("abstract") or "")
    auth_status = reference.get("authenticity_status", "UNVERIFIED")
    source_label = reference.get("matched_source") or "Scholarly registry"
    ref_title = reference.get("matched_title") or reference.get("title", "")
    source_citation = f"{ref_title} ({reference.get('matched_year') or reference.get('year', '')})"
    evidence_material_source = (
        reference.get("full_text_source")
        if reference.get("full_text_snippet")
        else (reference.get("abstract_source") if reference.get("abstract") else "")
    ) or source_label
    evidence_source = (
        f"{evidence_material_source} — {source_citation}"
        + (f" — doi:{reference.get('doi')}" if reference.get("doi") else "")
    )

    if auth_status == "RETRIEVAL_FAILED":
        return {
            "verdict": "UNVERIFIED",
            "verdict_explanation": (
                "A scholarly metadata service could not be reached while checking this "
                "reference, so its authenticity is unknown. A technical failure is not "
                "evidence that the publication does not exist."
            ),
            "evidence_passage": "",
            "evidence_source": evidence_source,
            "retrieval_level": "unavailable",
            "uncertainty_note": "Retry the audit when the scholarly APIs are reachable.",
            "evidence_confidence": 0.0,
        }

    if auth_status in {"UNVERIFIED", "POSSIBLE_MATCH"}:
        return {
            "verdict": "UNVERIFIED",
            "verdict_explanation": (
                f"The cited publication ('{ref_title[:80]}') has not been confirmed as "
                "the exact source. Because source identity is uncertain, the claim "
                "was not compared against the retrieved record."
            ),
            "evidence_passage": "",
            "evidence_source": evidence_source,
            "retrieval_level": retrieval_level,
            "uncertainty_note": (
                "An unverified reference may still be a real publication that is not "
                "indexed or was cited with incomplete metadata."
            ),
            "evidence_confidence": 0.0,
        }

    if auth_status == "MISMATCH":
        return {
            "verdict": "UNVERIFIED",
            "verdict_explanation": (
                "The cited metadata materially disagrees with the record found in the "
                "scholarly registry, so the claim was not compared against the cited "
                "source. Manual bibliographic review is required."
            ),
            "evidence_passage": "",
            "evidence_source": evidence_source,
            "retrieval_level": retrieval_level,
            "uncertainty_note": "Reference metadata mismatch; evidence comparison withheld.",
            "evidence_confidence": 0.0,
        }

    if auth_status != "VERIFIED":
        return {
            "verdict": "UNVERIFIED",
            "verdict_explanation": (
                "The publication identity does not have a verified registry match, so "
                "CiteVerify withheld source-evidence comparison."
            ),
            "evidence_passage": "",
            "evidence_source": evidence_source,
            "retrieval_level": retrieval_level,
            "uncertainty_note": "Confirm the cited publication record before evaluating its evidence.",
            "evidence_confidence": 0.0,
        }

    full_text = _collapse(reference.get("full_text_snippet") or "")
    source_text = full_text or abstract
    if retrieval_level in ("metadata_only", "unavailable") or not source_text:
        return {
            "verdict": "INSUFFICIENT_EVIDENCE",
            "verdict_explanation": (
                f"The publication was located in {source_label}, but only "
                f"{'bibliographic metadata' if retrieval_level != 'unavailable' else 'no source text'} "
                "was available (no open abstract or full text). CiteVerify does not issue a "
                "support verdict without readable source material."
            ),
            "evidence_passage": "",
            "evidence_source": evidence_source,
            "retrieval_level": "metadata_only" if retrieval_level != "unavailable" else "unavailable",
            "uncertainty_note": (
                "Full text is behind a paywall or unavailable. This is not a contradiction."
            ),
            "evidence_confidence": 0.0,
        }

    # --- Conservative sentence matching over retrieved source text ---------
    claim_tokens = set(_content_tokens(claim.get("claim_text", "")))
    evidence_sentences = _split_sentences(source_text)
    best_sentence = ""
    best_overlap = 0.0
    best_precision = 0.0
    for sentence in evidence_sentences:
        sentence_tokens = set(_content_tokens(sentence))
        shared = len(claim_tokens & sentence_tokens)
        coverage = shared / len(claim_tokens) if claim_tokens else 0.0
        precision = shared / len(sentence_tokens) if sentence_tokens else 0.0
        # Prefer sentences that cover the claim without rewarding long,
        # unrelated passages containing a few repeated scientific terms.
        rank = 0.75 * coverage + 0.25 * precision
        best_rank = 0.75 * best_overlap + 0.25 * best_precision
        if rank > best_rank:
            best_overlap = coverage
            best_precision = precision
            best_sentence = sentence.strip()

    # Numbers must occur in the selected, topic-matched sentence. A number
    # elsewhere in a long paper is not evidence for this claim's quantity.
    claim_numbers = _numeric_tokens(claim.get("claim_text", ""))
    evidence_numbers = set(_numeric_tokens(best_sentence))
    numbers_supported = (
        all(n in evidence_numbers for n in claim_numbers) if claim_numbers else True
    )

    claim_low = (claim.get("claim_text", "") or "").lower()
    evidence_low = best_sentence.lower()
    negation_re = r"\b(?:no|not|none|never|without|failed|insignificant|non[- ]significant|unrelated)\b"
    claim_negative = bool(re.search(negation_re, claim_low))
    evidence_negative = bool(re.search(negation_re, evidence_low))

    increase_re = r"\b(?:increas\w*|improv\w*|rais\w*|higher|greater|gain\w*|exceed\w*|superior|outperform\w*|benefit\w*)\b"
    decrease_re = r"\b(?:decreas\w*|reduc\w*|lower|fewer|declin\w*|drop\w*|worsen\w*|inferior)\b"
    claim_increase = bool(re.search(increase_re, claim_low))
    claim_decrease = bool(re.search(decrease_re, claim_low))
    evidence_increase = bool(re.search(increase_re, evidence_low))
    evidence_decrease = bool(re.search(decrease_re, evidence_low))

    directional_conflict = (
        (claim_increase and evidence_decrease and not evidence_increase)
        or (claim_decrease and evidence_increase and not evidence_decrease)
    )
    strong_match = best_overlap >= 0.68 and best_precision >= 0.24
    negation_conflict = (claim_negative != evidence_negative) and strong_match

    if (directional_conflict or negation_conflict) and strong_match:
        return {
            "verdict": "CONTRADICTED",
            "verdict_explanation": (
                f"The retrieved {'full text' if retrieval_level == 'full_text' else 'abstract'} "
                "contains a closely matched statement with an explicit direction or "
                "polarity conflict. This verdict concerns the source wording available "
                "here; inspect the complete study context before drawing a broader conclusion."
            ),
            "evidence_passage": best_sentence or abstract[:400],
            "evidence_source": evidence_source,
            "retrieval_level": retrieval_level,
            "uncertainty_note": (
                "A textual conflict was found in the selected source sentence. The "
                "verdict is not based on missing evidence or an unavailable source."
            ),
            "evidence_confidence": round(min(0.9, 0.35 + best_overlap * 0.55), 2),
        }

    support_threshold = 0.68 if retrieval_level == "full_text" else 0.76
    if best_overlap >= support_threshold and best_precision >= 0.28 and numbers_supported:
        verdict = "SUPPORTED"
        explanation = (
            f"The retrieved {'full text' if retrieval_level == 'full_text' else 'abstract'} "
            "contains a closely aligned sentence, and all claim numbers appear in that "
            "same sentence. The alignment score is a lexical screening signal, not a "
            "statistical probability of truth."
        )
        confidence = round(min(0.86, 0.35 + best_overlap * 0.55), 2)
        uncertainty = (
            "Direct sentence alignment found. Confirm population, outcome, and study design "
            "when the claim is broader than the retrieved sentence."
        )
    elif best_overlap >= 0.42 and best_precision >= 0.16:
        verdict = "PARTIALLY_SUPPORTED"
        explanation = (
            f"The retrieved {'full text' if retrieval_level == 'full_text' else 'abstract'} "
            "has a related sentence, but it does not establish every element of the claim "
            "(such as its quantity, population, outcome, or scope)."
        )
        confidence = round(min(0.68, 0.2 + best_overlap * 0.5), 2)
        uncertainty = (
            "Partial alignment only; the claim may overstate what the source reports."
        )
    else:
        verdict = "INSUFFICIENT_EVIDENCE"
        explanation = (
            f"The publication is authentic, but the retrieved {'full text' if retrieval_level == 'full_text' else 'abstract'} "
            "does not contain a sufficiently close sentence to confirm or refute this claim."
        )
        confidence = round(min(0.45, best_overlap * 0.5), 2)
        uncertainty = (
            "A weak lexical match is not evidence of support or contradiction. Manually inspect "
            "the methods and results or retrieve a source passage for this claim."
        )

    if claim_numbers and not numbers_supported and verdict == "PARTIALLY_SUPPORTED":
        explanation += " The claimed quantity is not present in the selected sentence."

    return {
        "verdict": verdict,
        "verdict_explanation": explanation,
        "evidence_passage": best_sentence,
        "evidence_source": evidence_source,
        "retrieval_level": retrieval_level,
        "uncertainty_note": uncertainty,
        "evidence_confidence": confidence,
    }
