"""Scholarly metadata services for CiteVerify.

Two responsibilities:

* Verification metadata for references found inside an uploaded manuscript
  (Crossref, OpenAlex, Semantic Scholar) with explicit failure signalling.
* Research discovery (search, references, citing works, related works, authors)
  used by the Research Discovery module.

Everything here is real data from public APIs. Nothing is synthesised: when a
service fails or a field is missing, the result says so.
"""

import re
import time
import urllib.parse
import xml.etree.ElementTree as ET
from typing import Any, Dict, List, Optional, Tuple

import requests

HEADERS = {
    "User-Agent": (
        "CiteVerify/2.5 (https://citeverify.app; mailto:verification@citeverify.app)"
    ),
    "Accept": "application/json",
}
TIMEOUT = 8.0  # seconds per scholarly request
SEARCH_TIMEOUT = 10.0

# Simple TTL cache so repeated lookups (and UI pagination) stay fast.
_CACHE: Dict[str, Tuple[float, Any]] = {}
_CACHE_TTL = 900  # 15 minutes


def _cache_get(key: str) -> Any:
    entry = _CACHE.get(key)
    if not entry:
        return None
    ts, value = entry
    if time.time() - ts > _CACHE_TTL:
        _CACHE.pop(key, None)
        return None
    return value


def _cache_set(key: str, value: Any) -> Any:
    _CACHE[key] = (time.time(), value)
    if len(_CACHE) > 400:
        # drop oldest entries
        for k in sorted(_CACHE, key=lambda x: _CACHE[x][0])[:100]:
            _CACHE.pop(k, None)
    return value


class ScholarServiceError(RuntimeError):
    """Raised when a scholarly API cannot be reached (not 'no match')."""


def _get_json(
    url: str, timeout: float = TIMEOUT, retries: int = 1
) -> Tuple[Optional[Any], Optional[str]]:
    """GET a JSON document. Returns (data, error_message).

    A network/5xx failure is reported as an error so callers can distinguish
    "service unreachable" from "no matching publication".
    """
    cached = _cache_get(url)
    if cached is not None:
        return cached, None
    last_error = None
    for attempt in range(retries + 1):
        try:
            resp = requests.get(url, headers=HEADERS, timeout=timeout)
            if resp.status_code == 200:
                return _cache_set(url, resp.json()), None
            if resp.status_code == 404:
                return None, None
            if resp.status_code == 429:
                last_error = "rate_limited"
                time.sleep(0.6 * (attempt + 1))
                continue
            last_error = f"http_{resp.status_code}"
            if 400 <= resp.status_code < 500:
                return None, None
        except requests.RequestException as exc:
            last_error = f"network_error: {type(exc).__name__}"
            time.sleep(0.2 * (attempt + 1))
    return None, last_error


def _get_full_text_xml(doi: str, expected_title: str) -> Tuple[str, str]:
    """Retrieve full text only from Europe PMC's open-access full-text subset.

    Europe PMC exposes full-text XML only for the OA subset. A failed lookup is
    deliberately returned as an empty result; it must not affect publication
    authenticity or be interpreted as evidence against the claim.
    """
    clean_doi = extract_clean_doi(doi)
    if not clean_doi:
        return "", ""
    query = urllib.parse.urlencode(
        {"query": f'EXT_ID:"{clean_doi}"', "format": "json", "resultType": "core", "pageSize": 1}
    )
    search_url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/search?{query}"
    search, error = _get_json(search_url, timeout=TIMEOUT, retries=0)
    if error or not isinstance(search, dict):
        return "", ""
    results = ((search.get("resultList") or {}).get("result") or [])
    if not results:
        return "", ""
    record = results[0]
    returned_doi = extract_clean_doi(record.get("doi"))
    pmcid = (record.get("pmcid") or "").strip()
    is_open_access = str(record.get("isOpenAccess") or "").upper() == "Y"
    if (
        not pmcid
        or not is_open_access
        or (returned_doi and returned_doi.lower() != clean_doi.lower())
        or title_similarity(expected_title, record.get("title") or "") < 0.70
    ):
        return "", ""

    url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/{urllib.parse.quote(pmcid)}/fullTextXML"
    cache_key = f"fulltext:{url}"
    cached = _cache_get(cache_key)
    if isinstance(cached, tuple) and len(cached) == 2:
        return cached
    try:
        response = requests.get(
            url,
            headers={**HEADERS, "Accept": "application/xml, text/xml"},
            timeout=TIMEOUT,
        )
        if response.status_code != 200:
            return "", ""
        root = ET.fromstring(response.content)
        body = next((node for node in root.iter() if node.tag.split("}")[-1] == "body"), None)
        if body is None:
            return "", ""
        paragraphs: List[str] = []
        for node in body.iter():
            if node.tag.split("}")[-1] != "p":
                continue
            text = " ".join(part.strip() for part in node.itertext() if part.strip())
            text = re.sub(r"\s+", " ", text).strip()
            if text:
                paragraphs.append(text)
        full_text = "\n".join(paragraphs).strip()
        if not full_text:
            full_text = re.sub(r"\s+", " ", " ".join(body.itertext())).strip()
        # Keep the original source text, bounded to avoid storing excessive XML
        # content in the per-reference SQLite row.
        full_text = full_text[:100_000]
        if len(full_text) < 500:
            return "", ""
        result = (full_text, "Europe PMC Open Access full-text XML")
        _cache_set(cache_key, result)
        return result
    except (requests.RequestException, ET.ParseError, ValueError):
        return "", ""


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------


def clean_text(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"[^\w\s]", "", text).lower().strip()


def token_similarity(s1: str, s2: str) -> float:
    t1 = set(clean_text(s1).split())
    t2 = set(clean_text(s2).split())
    if not t1 or not t2:
        return 0.0
    return len(t1.intersection(t2)) / len(t1.union(t2))


_TITLE_GENERIC_TERMS = {
    "a", "an", "the", "of", "and", "or", "to", "in", "on", "for", "with",
    "by", "from", "as", "at", "is", "are", "was", "were", "be", "been",
    "being", "that", "this", "these", "those", "it", "its", "all", "across",
    "over", "under", "into", "via", "using", "study", "studies", "trial",
    "trials", "randomised", "randomized", "controlled", "control", "results",
    "result", "analysis", "analyses", "method", "methods", "approach", "review",
    "research", "findings", "impact", "effect", "effects", "academic", "education",
    "educational",
}


def title_similarity(a: str, b: str) -> float:
    """Compare informative title terms, discounting generic academic wording."""
    raw_a = set(clean_text(a).split())
    raw_b = set(clean_text(b).split())
    ta = raw_a - _TITLE_GENERIC_TERMS
    tb = raw_b - _TITLE_GENERIC_TERMS
    if not ta or not tb:
        return 1.0 if raw_a and raw_a == raw_b else 0.0
    shared = ta & tb
    if not shared:
        return 0.0
    jaccard = len(ta & tb) / len(ta | tb)
    containment = len(ta & tb) / min(len(ta), len(tb))
    score = max(jaccard, containment * 0.85)
    # One shared topical word is a weak lead, not a credible publication match.
    if len(shared) == 1 and ta != tb:
        score = min(score, 0.25)
    return score


def extract_clean_doi(raw_doi: Optional[str]) -> Optional[str]:
    """Extracts a valid DOI identifier from a freeform string."""
    if not raw_doi:
        return None
    match = re.search(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", raw_doi)
    if match:
        clean = match.group(0).rstrip(".,;)\xa0 ")
        # trim trailing fragments that are not part of a DOI
        clean = re.sub(r"/(?:abstract|full|pdf|epub)$", "", clean, flags=re.I)
        return clean
    return None


def reconstruct_abstract(inverted_index: Optional[Dict[str, List[int]]]) -> str:
    if not inverted_index:
        return ""
    positions: List[Tuple[int, str]] = []
    for word, idxs in inverted_index.items():
        for pos in idxs:
            positions.append((pos, word))
    positions.sort()
    return " ".join(word for _, word in positions)


def _year_from_crossref(data: Dict[str, Any]) -> str:
    for key in ("published-print", "published-online", "issued", "created"):
        parts = (data.get(key) or {}).get("date-parts") or []
        if parts and parts[0] and parts[0][0]:
            return str(parts[0][0])
    return ""


# ---------------------------------------------------------------------------
# Manuscript metadata (for uploaded paper)
# ---------------------------------------------------------------------------


def fetch_manuscript_metadata(
    doi: Optional[str] = None, title: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Retrieves authoritative metadata for an uploaded paper."""
    clean_doi = extract_clean_doi(doi)

    if clean_doi:
        data, _err = _get_json(f"https://api.crossref.org/works/{clean_doi}")
        if data:
            work = data.get("message", {})
            authors = []
            for a in work.get("author", []):
                name = f"{a.get('given', '')} {a.get('family', '')}".strip()
                if name:
                    authors.append(name)
            abstract = work.get("abstract", "") or ""
            abstract = re.sub(r"<[^>]+>", "", abstract).strip()
            return {
                "source": "Crossref",
                "title": (work.get("title") or [title or ""])[0],
                "authors": ", ".join(authors) if authors else "Unknown Authors",
                "year": _year_from_crossref(work),
                "journal": (work.get("container-title") or [""])[0],
                "doi": clean_doi,
                "abstract": abstract,
                "url": f"https://doi.org/{clean_doi}",
            }

        data, _err = _get_json(
            f"https://api.openalex.org/works/https://doi.org/{clean_doi}"
        )
        if data:
            authors = [
                a.get("author", {}).get("display_name", "")
                for a in data.get("authorships", [])
                if a.get("author", {}).get("display_name")
            ]
            return {
                "source": "OpenAlex",
                "title": data.get("title") or title or "",
                "authors": ", ".join(authors) if authors else "Unknown Authors",
                "year": str(data.get("publication_year") or ""),
                "journal": (
                    (data.get("primary_location") or {}).get("source", {}) or {}
                ).get("display_name", ""),
                "doi": clean_doi,
                "abstract": reconstruct_abstract(data.get("abstract_inverted_index")),
                "url": data.get("doi") or f"https://doi.org/{clean_doi}",
            }

    if title and len(title.strip()) > 15:
        result = _search_one_for_manuscript(title)
        if result:
            return result
    return None


def _search_one_for_manuscript(title: str) -> Optional[Dict[str, Any]]:
    encoded = urllib.parse.quote(title[:180])
    data, _err = _get_json(
        f"https://api.openalex.org/works?search={encoded}&per_page=3"
    )
    candidates = (data or {}).get("results", []) if isinstance(data, dict) else []
    if not candidates:
        data, _err = _get_json(
            f"https://api.crossref.org/works?query.bibliographic={encoded}&rows=3"
        )
        items = ((data or {}).get("message", {}) or {}).get("items", [])
        candidates = items
    for item in candidates:
        candidate_title = item.get("title") or (
            (item.get("title") or [""])[0] if isinstance(item.get("title"), list) else ""
        )
        if isinstance(candidate_title, list):
            candidate_title = candidate_title[0] if candidate_title else ""
        if title_similarity(title, candidate_title or "") < 0.6:
            continue
        if "authorships" in item:  # OpenAlex shape
            authors = [
                a.get("author", {}).get("display_name", "")
                for a in item.get("authorships", [])
                if a.get("author", {}).get("display_name")
            ]
            return {
                "source": "OpenAlex",
                "title": candidate_title,
                "authors": ", ".join(authors) or "Unknown Authors",
                "year": str(item.get("publication_year") or ""),
                "journal": (
                    (item.get("primary_location") or {}).get("source", {}) or {}
                ).get("display_name", ""),
                "doi": extract_clean_doi(item.get("doi")) or "",
                "abstract": reconstruct_abstract(item.get("abstract_inverted_index")),
                "url": item.get("doi") or "",
            }
        authors = [
            f"{a.get('given', '')} {a.get('family', '')}".strip()
            for a in item.get("author", [])
        ]
        return {
            "source": "Crossref",
            "title": candidate_title,
            "authors": ", ".join([a for a in authors if a]) or "Unknown Authors",
            "year": _year_from_crossref(item),
            "journal": (item.get("container-title") or [""])[0],
            "doi": extract_clean_doi(item.get("DOI")) or "",
            "abstract": re.sub(r"<[^>]+>", "", item.get("abstract", "") or ""),
            "url": item.get("URL", ""),
        }
    return None


# ---------------------------------------------------------------------------
# Reference verification
# ---------------------------------------------------------------------------


def query_crossref(
    title: str,
    doi: Optional[str] = None,
    authors: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    clean_doi = extract_clean_doi(doi)
    if clean_doi:
        data, _err = _get_json(f"https://api.crossref.org/works/{clean_doi}")
        if data:
            work = data.get("message", {})
            author_str = ", ".join(
                f"{a.get('given', '')} {a.get('family', '')}".strip()
                or a.get("family", "")
                for a in work.get("author", [])
            )
            return {
                "source": "Crossref",
                "title": (work.get("title") or [""])[0],
                "authors": author_str,
                "year": _year_from_crossref(work),
                "journal": (work.get("container-title") or [""])[0],
                "doi": work.get("DOI", clean_doi),
                "url": work.get("URL") or f"https://doi.org/{clean_doi}",
                "abstract": re.sub(
                    r"<[^>]+>", "", work.get("abstract", "") or ""
                ).strip(),
                "type": work.get("type", ""),
            }

    query_str = title
    if authors and len(authors) > 3:
        first_author = authors.split(",")[0].split()[0]
        query_str = f"{first_author} {title}"
    if query_str and len(query_str) > 8:
        encoded = urllib.parse.quote(query_str[:180])
        data, _err = _get_json(
            f"https://api.crossref.org/works?query.bibliographic={encoded}&rows=5"
        )
        items = ((data or {}).get("message", {}) or {}).get("items", [])
        best = None
        best_score = 0.0
        for item in items:
            cand_title = (item.get("title") or [""])[0]
            score = title_similarity(title, cand_title)
            if score > best_score:
                best_score = score
                best = item
        if best:
            author_str = ", ".join(
                f"{a.get('given', '')} {a.get('family', '')}".strip()
                or a.get("family", "")
                for a in best.get("author", [])
            )
            return {
                "source": "Crossref",
                "title": (best.get("title") or [""])[0],
                "authors": author_str,
                "year": _year_from_crossref(best),
                "journal": (best.get("container-title") or [""])[0],
                "doi": extract_clean_doi(best.get("DOI")) or "",
                "url": best.get("URL", ""),
                "abstract": re.sub(r"<[^>]+>", "", best.get("abstract", "") or "").strip(),
                "type": best.get("type", ""),
            }
    return None


def query_openalex(
    title: str,
    doi: Optional[str] = None,
    authors: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    clean_doi = extract_clean_doi(doi)
    if clean_doi:
        data, _err = _get_json(
            f"https://api.openalex.org/works/https://doi.org/{clean_doi}"
        )
        if data:
            return _normalise_openalex_work(data)

    search_str = title
    if authors and len(authors) > 3:
        first_auth = authors.split(",")[0].split()[0]
        search_str = f"{first_auth} {title}"
    if search_str and len(search_str) > 8:
        encoded = urllib.parse.quote(search_str[:180])
        data, _err = _get_json(
            f"https://api.openalex.org/works?search={encoded}&per_page=5"
        )
        results = (data or {}).get("results", []) if isinstance(data, dict) else []
        if results:
            best = max(
                results,
                key=lambda w: title_similarity(title, w.get("title") or ""),
            )
            return _normalise_openalex_work(best)
    return None


def query_semanticscholar(
    title: str, doi: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    clean_doi = extract_clean_doi(doi)
    fields = "title,authors,year,venue,abstract,openAccessPdf,externalIds,citationCount"
    if clean_doi:
        data, _err = _get_json(
            f"https://api.semanticscholar.org/graph/v1/paper/DOI:{clean_doi}?fields={fields}"
        )
        if data:
            return _normalise_s2(data, clean_doi)
    if title and len(title) > 12:
        encoded = urllib.parse.quote(title[:180])
        data, _err = _get_json(
            "https://api.semanticscholar.org/graph/v1/paper/search"
            f"?query={encoded}&limit=3&fields={fields}"
        )
        papers = (data or {}).get("data", []) if isinstance(data, dict) else []
        if papers:
            best = max(
                papers, key=lambda p: title_similarity(title, p.get("title", ""))
            )
            if title_similarity(title, best.get("title", "")) > 0.55:
                return _normalise_s2(best, "")
    return None


def _normalise_s2(data: Dict[str, Any], doi: str) -> Dict[str, Any]:
    return {
        "source": "Semantic Scholar",
        "title": data.get("title", ""),
        "authors": ", ".join(a.get("name", "") for a in data.get("authors", [])),
        "year": str(data.get("year") or ""),
        "journal": data.get("venue", "") or "",
        "doi": extract_clean_doi(
            (data.get("externalIds") or {}).get("DOI") or doi
        )
        or "",
        "url": data.get("url") or (f"https://doi.org/{doi}" if doi else ""),
        "abstract": data.get("abstract", "") or "",
        "is_oa": bool(data.get("openAccessPdf")),
        "oa_url": (data.get("openAccessPdf") or {}).get("url", ""),
        "citation_count": data.get("citationCount"),
    }


def _normalise_openalex_work(data: Dict[str, Any]) -> Dict[str, Any]:
    authors = [
        a.get("author", {}).get("display_name", "")
        for a in data.get("authorships", [])
        if a.get("author", {}).get("display_name")
    ]
    oa = data.get("open_access") or {}
    primary = data.get("primary_location") or {}
    return {
        "source": "OpenAlex",
        "title": data.get("title") or "",
        "authors": ", ".join(authors[:8]),
        "year": str(data.get("publication_year") or ""),
        "journal": ((primary.get("source") or {}) or {}).get("display_name", ""),
        "doi": extract_clean_doi(data.get("doi")) or "",
        "url": data.get("doi") or primary.get("landing_page_url", "") or "",
        "abstract": reconstruct_abstract(data.get("abstract_inverted_index")),
        "is_oa": oa.get("is_oa", False),
        "oa_url": oa.get("oa_url", "") or "",
        "citation_count": data.get("cited_by_count"),
        "type": data.get("type", ""),
    }


def verify_publication_metadata(
    cited_title: str,
    cited_authors: str,
    cited_year: str,
    cited_doi: Optional[str] = None,
) -> Dict[str, Any]:
    """Checks a cited reference against scholarly registries.

    Statuses: VERIFIED / POSSIBLE_MATCH / MISMATCH / UNVERIFIED / RETRIEVAL_FAILED.
    A failed request is never reported as a fake publication.
    """
    clean_doi = extract_clean_doi(cited_doi)
    errors: List[str] = []
    match: Optional[Dict[str, Any]] = None
    doi_resolved = False
    title = (cited_title or "").strip()

    if not title and not clean_doi:
        return {
            "authenticity_status": "UNVERIFIED",
            "authenticity_reason": "The citation did not contain a usable title or DOI.",
            "matched_title": None,
            "matched_authors": None,
            "matched_year": None,
            "matched_source": None,
            "url": None,
            "retrieval_level": "unavailable",
            "abstract": "",
        }

    # DOI first (most precise), then title-based search.
    if clean_doi:
        data, err = _get_json(f"https://api.crossref.org/works/{clean_doi}")
        if err:
            errors.append(f"Crossref ({err})")
        if data:
            work = data.get("message", {})
            match = {
                "source": "Crossref",
                "title": (work.get("title") or [""])[0],
                "authors": ", ".join(
                    f"{a.get('given', '')} {a.get('family', '')}".strip()
                    for a in work.get("author", [])
                ),
                "year": _year_from_crossref(work),
                "journal": (work.get("container-title") or [""])[0],
                "doi": work.get("DOI", clean_doi),
                "url": work.get("URL") or f"https://doi.org/{clean_doi}",
                "abstract": re.sub(
                    r"<[^>]+>", "", work.get("abstract", "") or ""
                ).strip(),
                "is_oa": False,
                "oa_url": "",
            }
            doi_resolved = True
        else:
            data, err = _get_json(
                f"https://api.openalex.org/works/https://doi.org/{clean_doi}"
            )
            if err:
                errors.append(f"OpenAlex ({err})")
            if data:
                match = _normalise_openalex_work(data)
                doi_resolved = True

    if not match:
        match = query_openalex(title, None, cited_authors)
        if not match:
            match = query_crossref(title, None, cited_authors)
        if not match:
            match = query_semanticscholar(title, None)

    if not match:
        if errors and len(errors) >= 2:
            return {
                "authenticity_status": "RETRIEVAL_FAILED",
                "authenticity_reason": (
                    "Scholarly metadata services could not be reached: "
                    + "; ".join(errors)
                    + ". This is a technical failure, not evidence that the "
                    "publication is fabricated."
                ),
                "matched_title": None,
                "matched_authors": None,
                "matched_year": None,
                "matched_source": None,
                "url": None,
                "retrieval_level": "unavailable",
                "abstract": "",
            }
        return {
            "authenticity_status": "UNVERIFIED",
            "authenticity_reason": (
                "No matching publication record was found in Crossref, OpenAlex or "
                "Semantic Scholar. This may be an unindexed, very recent, grey-"
                "literature or incorrect citation."
            ),
            "matched_title": None,
            "matched_authors": None,
            "matched_year": None,
            "matched_source": None,
            "url": None,
            "retrieval_level": "unavailable",
            "abstract": "",
        }

    sim = title_similarity(title, match.get("title", "")) if title else 0.0
    year_match = False
    if cited_year and match.get("year"):
        try:
            cy = int(re.sub(r"\D", "", str(cited_year)))
            my = int(re.sub(r"\D", "", str(match.get("year"))))
            year_match = abs(cy - my) <= 1
        except Exception:
            year_match = False

    author_overlap = False
    if cited_authors and match.get("authors"):
        cited_surname = clean_text(cited_authors.split(",")[0].split()[0])
        matched_names = clean_text(match.get("authors"))
        author_overlap = bool(cited_surname) and cited_surname in matched_names

    matched_doi = extract_clean_doi(match.get("doi"))
    doi_agrees = bool(clean_doi and matched_doi and clean_doi.lower() == matched_doi.lower())

    cited_title_is_usable = bool(title and len(title.split()) >= 4)
    title_materially_differs = cited_title_is_usable and sim < 0.5
    doi_points_to_another_title = doi_resolved and title_materially_differs
    title_points_to_another_doi = bool(
        clean_doi and matched_doi and not doi_agrees and sim >= 0.82
    )
    if clean_doi and (doi_points_to_another_title or title_points_to_another_doi):
        status = "MISMATCH"
        reason = (
            f"The DOI resolves to '{match.get('title', '')[:90]}', which materially "
            "differs from the title written in the bibliography. The DOI may have been "
            "copied from another work."
        )
    elif doi_agrees or (sim >= 0.82 and (year_match or author_overlap)):
        status = "VERIFIED"
        reason = (
            f"Confirmed in {match['source']}"
            + (" via DOI" if doi_agrees else f" ({int(sim * 100)}% title match)")
            + (" with author/year corroboration" if author_overlap or year_match else "")
            + "."
        )
    elif sim >= 0.6:
        status = "POSSIBLE_MATCH"
        reason = (
            f"Close title match in {match['source']} ({int(sim * 100)}%), but "
            + ("the publication year differs" if not year_match else "author names differ")
            + "; manual review recommended."
        )
    elif sim >= 0.5:
        status = "POSSIBLE_MATCH"
        reason = (
            f"A moderate title match ({int(sim * 100)}%) was found in "
            f"{match['source']}, but the remaining metadata is not strong enough to "
            "confirm the citation. Verify manually."
        )
    else:
        status = "UNVERIFIED"
        reason = (
            "A reliable match could not be established. Low-similarity results from a "
            "title search are not enough to call a publication or DOI fabricated."
        )

    abstract = (match.get("abstract") or "").strip()
    is_oa = bool(match.get("is_oa"))
    oa_url = match.get("oa_url") or ""
    citation_count = match.get("citation_count")
    enrichment_source = ""

    # Crossref rarely carries abstracts. Enrich from OpenAlex, then Semantic
    # Scholar, so claim-evidence comparison has real source text to work with.
    if not abstract and matched_doi:
        oa_data, _oa_err = _get_json(
            f"https://api.openalex.org/works/https://doi.org/{matched_doi}"
        )
        if oa_data:
            abstract = reconstruct_abstract(oa_data.get("abstract_inverted_index")).strip()
            oa = oa_data.get("open_access") or {}
            is_oa = is_oa or bool(oa.get("is_oa"))
            oa_url = oa_url or oa.get("oa_url") or ""
            if citation_count is None:
                citation_count = oa_data.get("cited_by_count")
            if abstract:
                enrichment_source = "OpenAlex"
    if not abstract:
        s2 = query_semanticscholar(match.get("title", ""), matched_doi or clean_doi)
        if s2 and s2.get("abstract"):
            abstract = s2["abstract"].strip()
            is_oa = is_oa or bool(s2.get("is_oa"))
            oa_url = oa_url or s2.get("oa_url") or ""
            if citation_count is None:
                citation_count = s2.get("citation_count")
            enrichment_source = "Semantic Scholar"

    full_text_snippet = ""
    full_text_source = ""
    # Only attempt full-text retrieval after the bibliographic identity was
    # verified and a registry supplied a DOI. Europe PMC's REST endpoint serves
    # the full-text XML OA subset; this avoids downloading paywalled articles.
    if status == "VERIFIED" and matched_doi:
        full_text_snippet, full_text_source = _get_full_text_xml(
            matched_doi, match.get("title") or title
        )

    if status == "MISMATCH":
        # A resolvable DOI/title mismatch is not the cited publication. Do not
        # present the mismatched work's abstract as claim evidence.
        abstract = ""
        full_text_snippet = ""
        full_text_source = ""
        retrieval_level = "unavailable"
    elif full_text_snippet:
        retrieval_level = "full_text"
    elif abstract:
        retrieval_level = "abstract_only"
    elif match.get("title"):
        retrieval_level = "metadata_only"
    else:
        retrieval_level = "unavailable"

    return {
        "authenticity_status": status,
        "authenticity_reason": reason,
        "matched_title": match.get("title"),
        "matched_authors": match.get("authors"),
        "matched_year": match.get("year"),
        "matched_source": match.get("source"),
        "url": match.get("oa_url") or match.get("url"),
        "retrieval_level": retrieval_level,
        "abstract": abstract,
        "full_text_snippet": full_text_snippet,
        "full_text_source": full_text_source,
        "matched_journal": match.get("journal", ""),
        "matched_doi": matched_doi or "",
        "title_similarity": round(sim, 3),
        "author_match": author_overlap,
        "year_match": year_match,
        "citation_count": citation_count,
        "is_open_access": is_oa,
        "oa_url": oa_url,
        "abstract_source": enrichment_source or (match.get("source") if abstract else ""),
    }


# ---------------------------------------------------------------------------
# Research discovery
# ---------------------------------------------------------------------------


def _paper_id(source: str, source_id: str, doi: str) -> str:
    if source == "openalex" and source_id:
        return f"oa:{source_id.replace('https://openalex.org/', '')}"
    if doi:
        return f"doi:{doi.lower()}"
    if source_id:
        return f"{source}:{source_id}"
    return ""


def normalise_openalex_paper(work: Dict[str, Any]) -> Dict[str, Any]:
    raw_id = (work.get("id") or "").replace("https://openalex.org/", "")
    doi = extract_clean_doi(work.get("doi")) or ""
    authorships = work.get("authorships", []) or []
    authors_list = []
    for a in authorships:
        author = a.get("author", {}) or {}
        institutions = a.get("institutions", []) or []
        authors_list.append(
            {
                "name": author.get("display_name", ""),
                "id": (author.get("id") or "").replace("https://openalex.org/", ""),
                "affiliation": ", ".join(
                    i.get("display_name", "") for i in institutions[:2] if i.get("display_name")
                ),
            }
        )
    topics = [
        t.get("display_name", "")
        for t in (work.get("topics") or [])[:6]
        if t.get("display_name")
    ]
    oa = work.get("open_access") or {}
    primary = work.get("primary_location") or {}
    source = primary.get("source") or {}
    referenced = [
        w.replace("https://openalex.org/", "")
        for w in (work.get("referenced_works") or [])
    ]
    return {
        "id": _paper_id("openalex", raw_id, doi),
        "source": "openalex",
        "source_id": raw_id,
        "doi": doi,
        "title": work.get("title") or "Untitled publication",
        "authors": ", ".join(
            a["name"] for a in authors_list if a.get("name")
        )[:400],
        "authors_list": authors_list,
        "year": str(work.get("publication_year") or ""),
        "publication_date": work.get("publication_date") or "",
        "journal": source.get("display_name", "") or "",
        "abstract": reconstruct_abstract(work.get("abstract_inverted_index")),
        "citation_count": work.get("cited_by_count") or 0,
        "is_open_access": bool(oa.get("is_oa")),
        "oa_url": oa.get("oa_url") or "",
        "url": work.get("doi") or primary.get("landing_page_url") or "",
        "type": work.get("type") or "",
        "topics": topics,
        "referenced_works": referenced,
    }


def normalise_crossref_paper(item: Dict[str, Any]) -> Dict[str, Any]:
    doi = extract_clean_doi(item.get("DOI")) or ""
    authors_list = []
    for a in item.get("author", []) or []:
        name = f"{a.get('given', '')} {a.get('family', '')}".strip() or a.get("name", "")
        if name:
            authors_list.append(
                {
                    "name": name,
                    "id": "",
                    "affiliation": ", ".join(
                        x.get("name", "") for x in (a.get("affiliation") or [])[:2]
                    ),
                }
            )
    return {
        "id": _paper_id("crossref", "", doi),
        "source": "crossref",
        "source_id": doi,
        "doi": doi,
        "title": (item.get("title") or ["Untitled publication"])[0],
        "authors": ", ".join(a["name"] for a in authors_list)[:400],
        "authors_list": authors_list,
        "year": _year_from_crossref(item),
        "publication_date": (item.get("issued") or {}).get("date-parts", [[""]])[0],
        "journal": (item.get("container-title") or [""])[0],
        "abstract": re.sub(r"<[^>]+>", "", item.get("abstract", "") or "").strip(),
        "citation_count": item.get("is-referenced-by-count") or 0,
        "is_open_access": False,
        "oa_url": "",
        "url": item.get("URL") or (f"https://doi.org/{doi}" if doi else ""),
        "type": item.get("type") or "",
        "topics": [s for s in (item.get("subject") or [])[:6]],
        "referenced_works": [],
    }


def search_works(
    query: str,
    page: int = 1,
    per_page: int = 20,
    year_from: Optional[int] = None,
    year_to: Optional[int] = None,
    is_oa: Optional[bool] = None,
    work_type: Optional[str] = None,
    min_citations: Optional[int] = None,
    author: Optional[str] = None,
    sort: str = "relevance",
) -> Dict[str, Any]:
    """Searches OpenAlex (with Crossref fallback) for publications."""
    results: List[Dict[str, Any]] = []
    warnings: List[str] = []
    source_used = "OpenAlex"

    filters = []
    if year_from and year_to:
        filters.append(f"publication_year:{year_from}-{year_to}")
    elif year_from:
        filters.append(f"publication_year:{year_from}-")
    elif year_to:
        filters.append(f"publication_year:-{year_to}")
    if is_oa:
        filters.append("is_oa:true")
    if work_type:
        filters.append(f"type:{work_type}")
    if min_citations:
        filters.append(f"cited_by_count:>{max(0, min_citations - 1)}")

    params = {
        "per_page": min(per_page, 50),
        "page": max(1, page),
    }
    if sort == "cited":
        params["sort"] = "cited_by_count:desc"
    elif sort == "recent":
        params["sort"] = "publication_date:desc"
    if filters:
        params["filter"] = ",".join(filters)
    if query:
        params["search"] = query[:200]
    if author:
        params["search"] = f"{query} {author}".strip()[:200]

    data, err = _get_json(
        "https://api.openalex.org/works?" + urllib.parse.urlencode(params),
        timeout=SEARCH_TIMEOUT,
    )
    if err:
        warnings.append(f"OpenAlex search failed ({err}); tried Crossref instead.")
    if data:
        for work in data.get("results", []):
            results.append(normalise_openalex_paper(work))
    else:
        cparams = {"rows": min(per_page, 50), "query.bibliographic": query[:200]}
        cfilters = []
        if year_from:
            cfilters.append(f"from-pub-date:{year_from}-01-01")
        if year_to:
            cfilters.append(f"until-pub-date:{year_to}-12-31")
        if cfilters:
            cparams["filter"] = ",".join(cfilters)
        cdata, cerr = _get_json(
            "https://api.crossref.org/works?" + urllib.parse.urlencode(cparams),
            timeout=SEARCH_TIMEOUT,
        )
        source_used = "Crossref"
        if cdata:
            for item in cdata.get("message", {}).get("items", []):
                results.append(normalise_crossref_paper(item))
        elif cerr:
            warnings.append(f"Crossref search also failed ({cerr}).")

    if min_citations:
        results = [r for r in results if (r.get("citation_count") or 0) >= min_citations]

    return {
        "query": query,
        "page": page,
        "per_page": per_page,
        "source": source_used,
        "results": results,
        "warnings": warnings,
        "total": len(results),
    }


def get_work(identifier: str) -> Tuple[Optional[Dict[str, Any]], List[str]]:
    """Fetches a single publication by OpenAlex id or DOI."""
    warnings: List[str] = []
    ident = identifier.strip()
    if ident.startswith("oa:"):
        ident = ident[3:]
    if ident.startswith("doi:"):
        ident = ident[4:]

    url = None
    if re.match(r"^W\d+$", ident):
        url = f"https://api.openalex.org/works/{ident}"
    elif ident.startswith("10."):
        url = f"https://api.openalex.org/works/https://doi.org/{ident}"
    elif ident.startswith("http"):
        url = f"https://api.openalex.org/works/{ident}"

    if url:
        data, err = _get_json(url)
        if data:
            return normalise_openalex_paper(data), warnings
        if err:
            warnings.append(f"OpenAlex lookup failed ({err}).")

    doi = extract_clean_doi(ident) or (ident if ident.startswith("10.") else "")
    if doi:
        data, err = _get_json(f"https://api.crossref.org/works/{doi}")
        if data:
            return normalise_crossref_paper(data.get("message", {})), warnings
        if err:
            warnings.append(f"Crossref lookup failed ({err}).")

    encoded = urllib.parse.quote(ident[:180])
    data, err = _get_json(f"https://api.openalex.org/works?search={encoded}&per_page=5")
    if data and data.get("results"):
        best = max(
            data["results"],
            key=lambda w: title_similarity(ident, w.get("title") or ""),
        )
        return normalise_openalex_paper(best), warnings
    return None, warnings


def _openalex_ids_from_paper(paper: Dict[str, Any]) -> List[str]:
    ids = []
    if paper.get("source_id"):
        ids.append(paper["source_id"])
    if paper.get("referenced_works"):
        ids.extend(paper["referenced_works"])
    return ids


def fetch_works_batch(ids: List[str], limit: int = 50) -> Dict[str, Any]:
    """Fetches many OpenAlex works in one request (filter=openalex:W..|W..)."""
    clean_ids = [i.replace("https://openalex.org/", "") for i in ids if i][:limit]
    if not clean_ids:
        return {"results": [], "warnings": []}
    joined = "|".join(clean_ids)
    params = {"filter": f"openalex:{joined}", "per_page": min(len(clean_ids), 50)}
    data, err = _get_json(
        "https://api.openalex.org/works?" + urllib.parse.urlencode(params),
        timeout=SEARCH_TIMEOUT,
        retries=0,
    )
    warnings = [f"OpenAlex batch lookup failed ({err})."] if err else []
    results = [normalise_openalex_paper(w) for w in (data or {}).get("results", [])]
    by_id = {r["source_id"]: r for r in results}
    ordered = [by_id[i] for i in clean_ids if i in by_id]
    return {"results": ordered, "warnings": warnings}


def get_references(paper: Dict[str, Any], limit: int = 50) -> Dict[str, Any]:
    refs = _openalex_ids_from_paper(paper)
    if not refs:
        return {
            "results": [],
            "warnings": [
                "This record does not expose a reference list in OpenAlex; references "
                "cannot be shown for it."
            ],
        }
    return fetch_works_batch(refs, limit=limit)


def get_citations(paper: Dict[str, Any], limit: int = 25) -> Dict[str, Any]:
    oa_id = paper.get("source_id")
    if not oa_id:
        return {
            "results": [],
            "warnings": [
                "Citing works are only available for records indexed in OpenAlex."
            ],
        }
    params = {"filter": f"cites:{oa_id}", "per_page": min(limit, 50), "sort": "publication_date:desc"}
    data, err = _get_json(
        "https://api.openalex.org/works?" + urllib.parse.urlencode(params),
        timeout=SEARCH_TIMEOUT,
    )
    warnings = [f"OpenAlex cited-by lookup failed ({err})."] if err else []
    results = [normalise_openalex_paper(w) for w in (data or {}).get("results", [])]
    return {"results": results, "warnings": warnings}


def get_related(paper: Dict[str, Any], limit: int = 20) -> Dict[str, Any]:
    """OpenAlex related works (computed from references/citations overlap)."""
    ids = paper.get("referenced_works") or []
    oa_id = paper.get("source_id")
    related_ids: List[str] = []
    if oa_id:
        data, err = _get_json(f"https://api.openalex.org/works/{oa_id}", timeout=SEARCH_TIMEOUT)
        if data:
            related_ids = [
                r.replace("https://openalex.org/", "")
                for r in (data.get("related_works") or [])
            ]
    if related_ids:
        batch = fetch_works_batch(related_ids, limit=limit)
        for item in batch["results"]:
            item["relationship_basis"] = "OpenAlex computes this as a related work"
        return batch

    # Fallback: co-citation via shared references is not available without more
    # requests, so report honestly rather than inventing relations.
    return {
        "results": [],
        "warnings": [
            "No related-work recommendations are available for this record from the "
            "scholarly APIs. CiteVerify does not invent similarity links."
        ],
    }
