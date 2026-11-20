import json
import os
import sqlite3
import time
from typing import Any, Dict, List, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "citeverify.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_columns(cursor, table: str, columns: Dict[str, str]):
    """Adds columns that are missing from an existing database (safe migration)."""
    cursor.execute(f"PRAGMA table_info({table})")
    existing = {row[1] for row in cursor.fetchall()}
    for name, ddl in columns.items():
        if name not in existing:
            try:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")
            except Exception:
                pass


def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS audits (
        id TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        title TEXT,
        authors TEXT,
        abstract TEXT,
        total_pages INTEGER DEFAULT 1,
        status TEXT DEFAULT 'pending',
        current_step INTEGER DEFAULT 0,
        total_steps INTEGER DEFAULT 9,
        step_message TEXT DEFAULT 'Initialized',
        created_at TEXT NOT NULL,
        pdf_path TEXT,
        summary_json TEXT
    )
    """
    )

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS claims (
        id TEXT PRIMARY KEY,
        audit_id TEXT NOT NULL,
        claim_text TEXT NOT NULL,
        page_number INTEGER DEFAULT 1,
        context TEXT,
        citation_marker TEXT,
        reference_id TEXT,
        claim_type TEXT DEFAULT 'scientific',
        confidence REAL DEFAULT 0.85,
        mapping_status TEXT DEFAULT 'mapped',
        verdict TEXT DEFAULT 'UNVERIFIED',
        verdict_explanation TEXT,
        evidence_passage TEXT,
        retrieval_level TEXT DEFAULT 'metadata_only',
        uncertainty_note TEXT,
        bounding_box TEXT,
        mapping_method TEXT DEFAULT 'numeric_index',
        mapping_confidence REAL DEFAULT 0.85,
        normalized_marker TEXT DEFAULT '',
        FOREIGN KEY (audit_id) REFERENCES audits (id) ON DELETE CASCADE
    )
    """
    )

    # Migrations for existing databases (never destructive).
    _ensure_columns(
        cursor,
        "claims",
        {
            "mapping_method": "TEXT DEFAULT 'numeric_index'",
            "mapping_confidence": "REAL DEFAULT 0.85",
            "normalized_marker": "TEXT DEFAULT ''",
            "all_markers": "TEXT DEFAULT ''",
            "evidence_source": "TEXT DEFAULT ''",
            "evidence_confidence": "REAL DEFAULT 0",
            "mapping_note": "TEXT DEFAULT ''",
            "learned_suggestion": "TEXT DEFAULT ''",
            "learned_confidence": "REAL DEFAULT 0",
            "source_grounded_wording": "TEXT DEFAULT ''",
            "correction_note": "TEXT DEFAULT ''",
        },
    )
    _ensure_columns(
        cursor,
        "audits",
        {
            "diagnostics_json": "TEXT",
            "doi": "TEXT DEFAULT ''",
            "journal": "TEXT DEFAULT ''",
            "year": "TEXT DEFAULT ''",
            "extraction_engine": "TEXT DEFAULT ''",
            "is_demo": "INTEGER DEFAULT 0",
            "authors_json": "TEXT DEFAULT '[]'",
            "affiliations_json": "TEXT DEFAULT '[]'",
            "corresponding_author": "TEXT DEFAULT ''",
            "publication_date": "TEXT DEFAULT ''",
            "consistency_json": "TEXT DEFAULT '[]'",
            "diagnostic_log_json": "TEXT DEFAULT '[]'",
        },
    )

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS document_consistency_findings (
        id TEXT PRIMARY KEY, audit_id TEXT NOT NULL, finding_type TEXT NOT NULL,
        severity TEXT DEFAULT 'review', title TEXT NOT NULL, explanation TEXT NOT NULL,
        evidence_json TEXT DEFAULT '[]', calculation TEXT DEFAULT '', created_at TEXT NOT NULL,
        FOREIGN KEY (audit_id) REFERENCES audits (id) ON DELETE CASCADE
    )
    """)

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS references_meta (
        id TEXT PRIMARY KEY,
        audit_id TEXT NOT NULL,
        raw_citation TEXT NOT NULL,
        title TEXT,
        authors TEXT,
        year TEXT,
        journal TEXT,
        doi TEXT,
        authenticity_status TEXT DEFAULT 'UNVERIFIED',
        authenticity_reason TEXT,
        matched_title TEXT,
        matched_authors TEXT,
        matched_year TEXT,
        matched_source TEXT,
        url TEXT,
        retrieval_level TEXT DEFAULT 'metadata_only',
        abstract TEXT,
        full_text_snippet TEXT,
        FOREIGN KEY (audit_id) REFERENCES audits (id) ON DELETE CASCADE
    )
    """
    )
    _ensure_columns(
        cursor,
        "references_meta",
        {
            "needs_review": "INTEGER DEFAULT 0",
            "entry_type": "TEXT DEFAULT ''",
            "matched_journal": "TEXT DEFAULT ''",
            "matched_doi": "TEXT DEFAULT ''",
            "title_similarity": "REAL DEFAULT 0",
            "author_match": "INTEGER DEFAULT 0",
            "year_match": "INTEGER DEFAULT 0",
            "citation_count": "INTEGER DEFAULT 0",
            "is_open_access": "INTEGER DEFAULT 0",
            "paper_id": "TEXT DEFAULT ''",
        },
    )

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """
    )

    # Human adjudications are durable training labels; automated predictions
    # never replace source-evidence verdicts.
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS claim_feedback (
        id TEXT PRIMARY KEY,
        claim_id TEXT NOT NULL UNIQUE,
        audit_id TEXT NOT NULL,
        claim_text TEXT NOT NULL,
        evidence_text TEXT DEFAULT '',
        corrected_verdict TEXT NOT NULL,
        rationale TEXT DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (audit_id) REFERENCES audits (id) ON DELETE CASCADE
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_claim_feedback_verdict ON claim_feedback(corrected_verdict)")

    # --- Research discovery models -------------------------------------
    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS research_papers (
        id TEXT PRIMARY KEY,
        source TEXT,
        source_id TEXT,
        doi TEXT,
        title TEXT,
        authors TEXT,
        authors_json TEXT,
        year TEXT,
        publication_date TEXT,
        journal TEXT,
        abstract TEXT,
        citation_count INTEGER DEFAULT 0,
        is_open_access INTEGER DEFAULT 0,
        oa_url TEXT,
        url TEXT,
        type TEXT,
        topics_json TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    """
    )
    cursor.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_research_papers_doi ON research_papers(doi)"
    )
    cursor.execute(
        "CREATE INDEX IF NOT EXISTS idx_research_papers_source ON research_papers(source_id)"
    )

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS paper_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_paper_id TEXT NOT NULL,
        target_paper_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        relationship_source TEXT,
        explanation TEXT,
        created_at TEXT,
        UNIQUE(source_paper_id, target_paper_id, relationship_type)
    )
    """
    )

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS research_seeds (
        id TEXT PRIMARY KEY,
        paper_id TEXT NOT NULL,
        note TEXT DEFAULT '',
        created_at TEXT,
        UNIQUE(paper_id)
    )
    """
    )

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS research_collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_at TEXT,
        updated_at TEXT
    )
    """
    )

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS collection_papers (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        note TEXT DEFAULT '',
        added_at TEXT,
        UNIQUE(collection_id, paper_id)
    )
    """
    )

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS authors (
        id TEXT PRIMARY KEY,
        source_id TEXT,
        name TEXT,
        works_count INTEGER DEFAULT 0,
        cited_by_count INTEGER DEFAULT 0,
        affiliations TEXT DEFAULT '',
        topics_json TEXT DEFAULT '[]',
        created_at TEXT
    )
    """
    )

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS author_publications (
        id TEXT PRIMARY KEY,
        author_id TEXT NOT NULL,
        paper_id TEXT NOT NULL,
        UNIQUE(author_id, paper_id)
    )
    """
    )

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS research_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        seed_paper_id TEXT,
        created_at TEXT
    )
    """
    )

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS research_alerts (
        id TEXT PRIMARY KEY,
        kind TEXT,
        message TEXT,
        paper_id TEXT,
        created_at TEXT,
        is_read INTEGER DEFAULT 0
    )
    """
    )

    cursor.execute(
        """
    CREATE TABLE IF NOT EXISTS research_networks (
        id TEXT PRIMARY KEY,
        seed_ids_json TEXT,
        graph_json TEXT,
        created_at TEXT
    )
    """
    )

    default_settings = {
        "strict_verification": "false",
        "openalex_enabled": "true",
        "crossref_enabled": "true",
        "semantic_scholar_enabled": "true",
        "ai_model": "CiteVerify Evidence-Reasoning v2.5 (Biomed/STEM)",
        "auto_download_report": "false",
        "privacy_mode": "true",
        "data_retention_days": "30",
        "auto_cleanup": "true",
        "external_ai_disclosure": "true",
    }
    for k, v in default_settings.items():
        cursor.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v)
        )

    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Audits
# ---------------------------------------------------------------------------


def create_audit(audit: Dict[str, Any]):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO audits (id, filename, title, authors, abstract, total_pages, status, current_step, total_steps, step_message, created_at, pdf_path, summary_json, doi, journal, year, extraction_engine, is_demo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
        (
            audit["id"],
            audit["filename"],
            audit.get("title", "Untitled Document"),
            audit.get("authors", "Unknown"),
            audit.get("abstract", ""),
            audit.get("total_pages", 1),
            audit.get("status", "pending"),
            audit.get("current_step", 0),
            audit.get("total_steps", 9),
            audit.get("step_message", "Initialized"),
            audit["created_at"],
            audit.get("pdf_path", ""),
            json.dumps(audit.get("summary", {})),
            audit.get("doi", ""),
            audit.get("journal", ""),
            audit.get("year", ""),
            audit.get("extraction_engine", ""),
            1 if audit.get("is_demo") else 0,
        ),
    )
    conn.commit()
    conn.close()


def update_audit(audit_id: str, updates: Dict[str, Any]):
    conn = get_db()
    cursor = conn.cursor()
    fields = []
    values = []
    for k, v in updates.items():
        if k == "summary":
            fields.append("summary_json = ?")
            values.append(json.dumps(v))
        elif k == "diagnostics":
            fields.append("diagnostics_json = ?")
            values.append(json.dumps(v))
        elif k in ("authors_list", "affiliations", "consistency_findings", "diagnostic_log"):
            column = {"authors_list": "authors_json", "affiliations": "affiliations_json", "consistency_findings": "consistency_json", "diagnostic_log": "diagnostic_log_json"}[k]
            fields.append(f"{column} = ?")
            values.append(json.dumps(v, ensure_ascii=False))
        else:
            fields.append(f"{k} = ?")
            values.append(v)
    values.append(audit_id)
    query = f"UPDATE audits SET {', '.join(fields)} WHERE id = ?"
    cursor.execute(query, values)
    conn.commit()
    conn.close()


def save_consistency_findings(audit_id: str, findings: List[Dict[str, Any]]):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM document_consistency_findings WHERE audit_id = ?", (audit_id,))
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    for f in findings:
        cur.execute("INSERT INTO document_consistency_findings (id,audit_id,finding_type,severity,title,explanation,evidence_json,calculation,created_at) VALUES (?,?,?,?,?,?,?,?,?)", (f["id"], audit_id, f["finding_type"], f.get("severity", "review"), f["title"], f["explanation"], json.dumps(f.get("evidence", [])), f.get("calculation", ""), now))
    conn.commit()
    conn.close()


def get_consistency_findings(audit_id: str) -> List[Dict[str, Any]]:
    conn = get_db()
    rows = conn.execute("SELECT * FROM document_consistency_findings WHERE audit_id = ? ORDER BY id", (audit_id,)).fetchall()
    conn.close()
    result = []
    for row in rows:
        item = dict(row)
        try: item["evidence"] = json.loads(item.pop("evidence_json") or "[]")
        except Exception: item["evidence"] = []
        result.append(item)
    return result


def _row_to_audit(row) -> Dict[str, Any]:
    d = dict(row)
    for key, target in (("summary_json", "summary"), ("diagnostics_json", "diagnostics")):
        if d.get(key):
            try:
                d[target] = json.loads(d[key])
            except Exception:
                d[target] = {}
        else:
            d[target] = {}
    for key, target in (("authors_json", "authors_list"), ("affiliations_json", "affiliations"), ("consistency_json", "consistency_findings"), ("diagnostic_log_json", "diagnostic_log")):
        try:
            d[target] = json.loads(d.get(key) or "[]")
        except Exception:
            d[target] = []
    return d


def get_audit(audit_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audits WHERE id = ?", (audit_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    return _row_to_audit(row)


def list_audits() -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM audits ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    return [_row_to_audit(r) for r in rows]


def clear_audit_findings(audit_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM claims WHERE audit_id = ?", (audit_id,))
    cursor.execute("DELETE FROM references_meta WHERE audit_id = ?", (audit_id,))
    cursor.execute("DELETE FROM document_consistency_findings WHERE audit_id = ?", (audit_id,))
    cursor.execute("UPDATE audits SET consistency_json = '[]', diagnostic_log_json = '[]' WHERE id = ?", (audit_id,))
    conn.commit()
    conn.close()


def delete_audit(audit_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM claim_feedback WHERE audit_id = ?", (audit_id,))
    cursor.execute("DELETE FROM claims WHERE audit_id = ?", (audit_id,))
    cursor.execute("DELETE FROM references_meta WHERE audit_id = ?", (audit_id,))
    cursor.execute("DELETE FROM document_consistency_findings WHERE audit_id = ?", (audit_id,))
    cursor.execute("DELETE FROM audits WHERE id = ?", (audit_id,))
    conn.commit()
    conn.close()


def save_claims(claims: List[Dict[str, Any]]):
    conn = get_db()
    cursor = conn.cursor()
    for c in claims:
        cursor.execute(
            """
            INSERT OR REPLACE INTO claims (
                id, audit_id, claim_text, page_number, context, citation_marker,
                reference_id, claim_type, confidence, mapping_status, verdict,
                verdict_explanation, evidence_passage, retrieval_level, uncertainty_note, bounding_box,
                mapping_method, mapping_confidence, normalized_marker,
                all_markers, evidence_source, evidence_confidence, mapping_note,
                learned_suggestion, learned_confidence, source_grounded_wording, correction_note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                c["id"],
                c["audit_id"],
                c["claim_text"],
                c.get("page_number", 1),
                c.get("context", ""),
                c.get("citation_marker", ""),
                c.get("reference_id", None),
                c.get("claim_type", "scientific"),
                c.get("confidence", 0.85),
                c.get("mapping_status", "UNMAPPED"),
                c.get("verdict", "UNVERIFIED"),
                c.get("verdict_explanation", ""),
                c.get("evidence_passage", ""),
                c.get("retrieval_level", "metadata_only"),
                c.get("uncertainty_note", ""),
                json.dumps(c.get("bounding_box", {})),
                c.get("mapping_method", "none"),
                c.get("mapping_confidence", 0.0),
                c.get("normalized_marker", c.get("citation_marker", "")),
                json.dumps(c.get("all_markers", [])),
                c.get("evidence_source", ""),
                c.get("evidence_confidence", 0),
                c.get("mapping_note", ""),
                c.get("learned_suggestion", ""),
                c.get("learned_confidence", 0),
                c.get("source_grounded_wording", ""),
                c.get("correction_note", ""),
            ),
        )
    conn.commit()
    conn.close()


def get_claims_by_audit(audit_id: str) -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM claims WHERE audit_id = ? ORDER BY page_number ASC", (audit_id,)
    )
    rows = cursor.fetchall()
    conn.close()
    result = []
    for r in rows:
        d = dict(r)
        if d.get("bounding_box"):
            try:
                d["bounding_box"] = json.loads(d["bounding_box"])
            except Exception:
                d["bounding_box"] = {}
        else:
            d["bounding_box"] = {}
        if d.get("all_markers"):
            try:
                d["all_markers"] = json.loads(d["all_markers"])
            except Exception:
                d["all_markers"] = []
        else:
            d["all_markers"] = []
        result.append(d)
    return result


def get_claim(claim_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    row = conn.execute("SELECT * FROM claims WHERE id = ?", (claim_id,)).fetchone()
    conn.close()
    if not row:
        return None
    result = dict(row)
    for key, fallback in (("bounding_box", {}), ("all_markers", [])):
        try:
            result[key] = json.loads(result.get(key) or ("{}" if key == "bounding_box" else "[]"))
        except Exception:
            result[key] = fallback
    return result


def update_claim(claim_id: str, updates: Dict[str, Any]):
    conn = get_db()
    cursor = conn.cursor()
    fields = []
    values = []
    for k, v in updates.items():
        if k in ("bounding_box", "all_markers"):
            fields.append(f"{k} = ?")
            values.append(json.dumps(v))
        else:
            fields.append(f"{k} = ?")
            values.append(v)
    values.append(claim_id)
    cursor.execute(f"UPDATE claims SET {', '.join(fields)} WHERE id = ?", values)
    conn.commit()
    conn.close()


def save_claim_feedback(feedback: Dict[str, Any]):
    conn = get_db()
    conn.execute("""
        INSERT INTO claim_feedback
        (id, claim_id, audit_id, claim_text, evidence_text, corrected_verdict, rationale, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(claim_id) DO UPDATE SET
            claim_text=excluded.claim_text, evidence_text=excluded.evidence_text,
            corrected_verdict=excluded.corrected_verdict, rationale=excluded.rationale,
            updated_at=excluded.updated_at
    """, (feedback["id"], feedback["claim_id"], feedback["audit_id"],
          feedback["claim_text"], feedback.get("evidence_text", ""),
          feedback["corrected_verdict"], feedback.get("rationale", ""),
          feedback["created_at"], feedback["updated_at"]))
    conn.commit()
    conn.close()


def get_claim_feedback() -> List[Dict[str, Any]]:
    conn = get_db()
    rows = conn.execute("SELECT * FROM claim_feedback ORDER BY updated_at DESC").fetchall()
    conn.close()
    return [dict(row) for row in rows]


def save_references(references: List[Dict[str, Any]]):
    conn = get_db()
    cursor = conn.cursor()
    for r in references:
        cursor.execute(
            """
            INSERT OR REPLACE INTO references_meta (
                id, audit_id, raw_citation, title, authors, year, journal, doi,
                authenticity_status, authenticity_reason, matched_title, matched_authors,
                matched_year, matched_source, url, retrieval_level, abstract, full_text_snippet,
                needs_review, entry_type, matched_journal, matched_doi, title_similarity,
                author_match, year_match, citation_count, is_open_access, paper_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                r["id"],
                r["audit_id"],
                r.get("raw_citation", ""),
                r.get("title", ""),
                r.get("authors", ""),
                r.get("year", ""),
                r.get("journal", ""),
                r.get("doi", ""),
                r.get("authenticity_status", "UNVERIFIED"),
                r.get("authenticity_reason", ""),
                r.get("matched_title", ""),
                r.get("matched_authors", ""),
                r.get("matched_year", ""),
                r.get("matched_source", ""),
                r.get("url", ""),
                r.get("retrieval_level", "metadata_only"),
                r.get("abstract", ""),
                r.get("full_text_snippet", ""),
                1 if r.get("needs_review") else 0,
                r.get("entry_type", ""),
                r.get("matched_journal", ""),
                r.get("matched_doi", ""),
                r.get("title_similarity", 0),
                1 if r.get("author_match") else 0,
                1 if r.get("year_match") else 0,
                r.get("citation_count") or 0,
                1 if r.get("is_open_access") else 0,
                r.get("paper_id", ""),
            ),
        )
    conn.commit()
    conn.close()


def get_references_by_audit(audit_id: str) -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM references_meta WHERE audit_id = ?", (audit_id,))
    rows = cursor.fetchall()
    conn.close()
    refs = [dict(r) for r in rows]
    refs.sort(key=lambda r: int(re.sub(r"\D", "", r.get("id", "0")) or 0))
    return refs


def get_settings() -> Dict[str, str]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM settings")
    rows = cursor.fetchall()
    conn.close()
    return {row["key"]: row["value"] for row in rows}


def save_settings(settings_dict: Dict[str, str]):
    conn = get_db()
    cursor = conn.cursor()
    for k, v in settings_dict.items():
        cursor.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, str(v))
        )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Research discovery storage
# ---------------------------------------------------------------------------


def _paper_row_to_dict(row) -> Dict[str, Any]:
    d = dict(row)
    for key, target in (("authors_json", "authors_list"), ("topics_json", "topics")):
        if d.get(key):
            try:
                d[target] = json.loads(d[key])
            except Exception:
                d[target] = []
        else:
            d[target] = []
    d["is_open_access"] = bool(d.get("is_open_access"))
    return d


def _authors_text(value: Any) -> str:
    """SQLite cannot bind lists; scholarly APIs may return author objects."""
    if isinstance(value, (list, tuple)):
        names: List[str] = []
        for author in value:
            if isinstance(author, dict):
                names.append(str(author.get("name") or ""))
            elif author:
                names.append(str(author))
        return ", ".join(name for name in names if name)
    return value or ""


def _date_text(value: Any) -> str:
    if isinstance(value, (list, tuple)) and value and all(
        isinstance(part, int) for part in value
    ):
        parts = [f"{part:02d}" if index else str(part) for index, part in enumerate(value)]
        return "-".join(parts)
    return _scalar_text(value)


def _scalar_text(value: Any) -> str:
    """Coerces scholarly API payloads into text columns SQLite can bind."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, dict):
        for key in ("display_name", "name", "title"):
            if value.get(key):
                return str(value[key])
        return ""
    if isinstance(value, (list, tuple)):
        return ", ".join(part for part in (_scalar_text(item) for item in value) if part)
    return str(value)


_PAPER_TEXT_FIELDS = (
    "source",
    "source_id",
    "doi",
    "title",
    "year",
    "journal",
    "abstract",
    "oa_url",
    "url",
    "type",
)


def _sanitize_paper(paper: Dict[str, Any]) -> Dict[str, Any]:
    clean = dict(paper)
    for field in _PAPER_TEXT_FIELDS:
        if field in clean:
            clean[field] = _scalar_text(clean[field])
    if "publication_date" in clean:
        clean["publication_date"] = _date_text(clean["publication_date"])
    if "authors" in clean:
        clean["authors"] = _authors_text(clean["authors"])
    return clean


def upsert_paper(paper: Dict[str, Any]) -> str:
    """Stores a publication, de-duplicating by DOI then by source id."""
    if not paper:
        return ""
    paper = _sanitize_paper(paper)
    conn = get_db()
    cursor = conn.cursor()
    doi = (paper.get("doi") or "").lower()
    existing = None
    if doi:
        cursor.execute("SELECT * FROM research_papers WHERE doi = ?", (doi,))
        existing = cursor.fetchone()
    if not existing and paper.get("source_id"):
        cursor.execute(
            "SELECT * FROM research_papers WHERE source_id = ? AND source = ?",
            (paper["source_id"], paper.get("source") or ""),
        )
        existing = cursor.fetchone()
    if not existing and paper.get("id"):
        cursor.execute("SELECT * FROM research_papers WHERE id = ?", (paper["id"],))
        existing = cursor.fetchone()

    now = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    if existing:
        current = _paper_row_to_dict(existing)
        merged = dict(current)
        for key in (
            "title", "authors", "year", "journal", "abstract", "url", "oa_url",
            "publication_date", "type",
        ):
            if paper.get(key):
                merged[key] = paper[key]
        for key in ("citation_count", "is_open_access"):
            if paper.get(key) not in (None, "", 0, False) or current.get(key) in (None, ""):
                merged[key] = paper[key]
        if paper.get("source_id") and not current.get("source_id"):
            merged["source_id"] = paper["source_id"]
            merged["source"] = paper.get("source", current.get("source"))
        if paper.get("authors_list"):
            merged["authors_list"] = paper["authors_list"]
        if paper.get("topics"):
            merged["topics"] = paper["topics"]
        cursor.execute(
            """
            UPDATE research_papers SET source=?, source_id=?, doi=?, title=?, authors=?,
                authors_json=?, year=?, publication_date=?, journal=?, abstract=?,
                citation_count=?, is_open_access=?, oa_url=?, url=?, type=?, topics_json=?, updated_at=?
            WHERE id=?
            """,
            (
                merged.get("source"),
                merged.get("source_id"),
                merged.get("doi") or doi,
                merged.get("title"),
                _authors_text(merged.get("authors")),
                json.dumps(merged.get("authors_list") or []),
                merged.get("year"),
                merged.get("publication_date"),
                merged.get("journal"),
                merged.get("abstract"),
                merged.get("citation_count") or 0,
                1 if merged.get("is_open_access") else 0,
                merged.get("oa_url"),
                merged.get("url"),
                merged.get("type"),
                json.dumps(merged.get("topics") or []),
                now,
                current["id"],
            ),
        )
        conn.commit()
        conn.close()
        return current["id"]

    paper_id = paper.get("id") or f"paper-{int(time.time() * 1000)}"
    cursor.execute(
        """
        INSERT INTO research_papers (id, source, source_id, doi, title, authors, authors_json,
            year, publication_date, journal, abstract, citation_count, is_open_access, oa_url,
            url, type, topics_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            paper_id,
            paper.get("source"),
            paper.get("source_id"),
            doi,
            paper.get("title"),
            _authors_text(paper.get("authors")),
            json.dumps(paper.get("authors_list") or []),
            paper.get("year"),
            paper.get("publication_date"),
            paper.get("journal"),
            paper.get("abstract"),
            paper.get("citation_count") or 0,
            1 if paper.get("is_open_access") else 0,
            paper.get("oa_url"),
            paper.get("url"),
            paper.get("type"),
            json.dumps(paper.get("topics") or []),
            now,
            now,
        ),
    )
    conn.commit()
    conn.close()
    return paper_id


def get_paper(paper_id: str) -> Optional[Dict[str, Any]]:
    if not paper_id:
        return None
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM research_papers WHERE id = ?", (paper_id,))
    row = cursor.fetchone()
    conn.close()
    return _paper_row_to_dict(row) if row else None


def get_papers_by_ids(ids: List[str]) -> Dict[str, Dict[str, Any]]:
    if not ids:
        return {}
    conn = get_db()
    cursor = conn.cursor()
    placeholders = ",".join("?" for _ in ids)
    cursor.execute(
        f"SELECT * FROM research_papers WHERE id IN ({placeholders})", tuple(ids)
    )
    rows = cursor.fetchall()
    conn.close()
    return {r["id"]: _paper_row_to_dict(r) for r in rows}


def list_papers(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM research_papers ORDER BY updated_at DESC LIMIT ? OFFSET ?",
        (limit, offset),
    )
    rows = cursor.fetchall()
    conn.close()
    return [_paper_row_to_dict(r) for r in rows]


def add_relationship(
    source_paper_id: str,
    target_paper_id: str,
    relationship_type: str,
    source: str = "",
    explanation: str = "",
):
    if not source_paper_id or not target_paper_id or source_paper_id == target_paper_id:
        return
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT OR IGNORE INTO paper_relationships
        (source_paper_id, target_paper_id, relationship_type, relationship_source, explanation, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            source_paper_id,
            target_paper_id,
            relationship_type,
            source,
            explanation,
            time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        ),
    )
    conn.commit()
    conn.close()


def get_relationships_for(paper_id: str) -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT * FROM paper_relationships
        WHERE source_paper_id = ? OR target_paper_id = ?
        """,
        (paper_id, paper_id),
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


# --- Seeds -----------------------------------------------------------------


def add_seed(paper_id: str, note: str = "") -> Dict[str, Any]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM research_seeds WHERE paper_id = ?", (paper_id,))
    row = cursor.fetchone()
    if row:
        conn.close()
        return dict(row)
    seed_id = f"seed-{os.urandom(4).hex()}"
    cursor.execute(
        "INSERT INTO research_seeds (id, paper_id, note, created_at) VALUES (?, ?, ?, ?)",
        (seed_id, paper_id, note, time.strftime("%Y-%m-%dT%H:%M:%SZ")),
    )
    conn.commit()
    conn.close()
    return {"id": seed_id, "paper_id": paper_id, "note": note}


def remove_seed(seed_id: str) -> bool:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM research_seeds WHERE id = ? OR paper_id = ?", (seed_id, seed_id))
    changed = cursor.rowcount
    conn.commit()
    conn.close()
    return changed > 0


def list_seeds() -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM research_seeds ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    seeds = [dict(r) for r in rows]
    papers = get_papers_by_ids([s["paper_id"] for s in seeds])
    for seed in seeds:
        seed["paper"] = papers.get(seed["paper_id"])
    return seeds


# --- Collections -----------------------------------------------------------


def create_collection(name: str, description: str = "") -> Dict[str, Any]:
    conn = get_db()
    cursor = conn.cursor()
    coll_id = f"col-{os.urandom(4).hex()}"
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    cursor.execute(
        "INSERT INTO research_collections (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (coll_id, name.strip()[:120], description[:400], now, now),
    )
    conn.commit()
    conn.close()
    return {
        "id": coll_id,
        "name": name,
        "description": description,
        "created_at": now,
        "updated_at": now,
        "paper_count": 0,
    }


def list_collections() -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT c.*, (SELECT COUNT(*) FROM collection_papers cp WHERE cp.collection_id = c.id) AS paper_count
        FROM research_collections c ORDER BY c.updated_at DESC
        """
    )
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def rename_collection(collection_id: str, name: str, description: Optional[str] = None) -> bool:
    conn = get_db()
    cursor = conn.cursor()
    if description is None:
        cursor.execute(
            "UPDATE research_collections SET name = ?, updated_at = ? WHERE id = ?",
            (name[:120], time.strftime("%Y-%m-%dT%H:%M:%SZ"), collection_id),
        )
    else:
        cursor.execute(
            "UPDATE research_collections SET name = ?, description = ?, updated_at = ? WHERE id = ?",
            (name[:120], description[:400], time.strftime("%Y-%m-%dT%H:%M:%SZ"), collection_id),
        )
    changed = cursor.rowcount
    conn.commit()
    conn.close()
    return changed > 0


def delete_collection(collection_id: str) -> bool:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM collection_papers WHERE collection_id = ?", (collection_id,))
    cursor.execute("DELETE FROM research_collections WHERE id = ?", (collection_id,))
    changed = cursor.rowcount
    conn.commit()
    conn.close()
    return changed > 0


def add_paper_to_collection(collection_id: str, paper_id: str, note: str = "") -> bool:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR IGNORE INTO collection_papers (id, collection_id, paper_id, note, added_at) VALUES (?, ?, ?, ?, ?)",
        (
            f"cp-{os.urandom(4).hex()}",
            collection_id,
            paper_id,
            note,
            time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        ),
    )
    conn.commit()
    cursor.execute(
        "UPDATE research_collections SET updated_at = ? WHERE id = ?",
        (time.strftime("%Y-%m-%dT%H:%M:%SZ"), collection_id),
    )
    conn.commit()
    conn.close()
    return True


def remove_paper_from_collection(collection_id: str, paper_id: str) -> bool:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM collection_papers WHERE collection_id = ? AND paper_id = ?",
        (collection_id, paper_id),
    )
    changed = cursor.rowcount
    conn.commit()
    conn.close()
    return changed > 0


def get_collection_papers(collection_id: str) -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM collection_papers WHERE collection_id = ? ORDER BY added_at DESC",
        (collection_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    items = [dict(r) for r in rows]
    papers = get_papers_by_ids([i["paper_id"] for i in items])
    for item in items:
        paper = papers.get(item["paper_id"])
        if paper:
            paper = dict(paper)
            paper["note"] = item.get("note", "")
            paper["added_at"] = item.get("added_at")
        item["paper"] = paper
    return items


def set_collection_note(collection_id: str, paper_id: str, note: str) -> bool:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE collection_papers SET note = ? WHERE collection_id = ? AND paper_id = ?",
        (note[:2000], collection_id, paper_id),
    )
    changed = cursor.rowcount
    conn.commit()
    conn.close()
    return changed > 0


# --- Authors ---------------------------------------------------------------


def upsert_author(author: Dict[str, Any]) -> str:
    conn = get_db()
    cursor = conn.cursor()
    author_id = author.get("id") or f"author-{os.urandom(4).hex()}"
    cursor.execute("SELECT * FROM authors WHERE id = ?", (author_id,))
    row = cursor.fetchone()
    if row:
        cursor.execute(
            "UPDATE authors SET name=?, works_count=?, cited_by_count=?, affiliations=?, topics_json=? WHERE id=?",
            (
                author.get("name") or row["name"],
                author.get("works_count") or row["works_count"],
                author.get("cited_by_count") or row["cited_by_count"],
                author.get("affiliations") or row["affiliations"],
                json.dumps(author.get("topics") or json.loads(row["topics_json"] or "[]")),
                author_id,
            ),
        )
    else:
        cursor.execute(
            "INSERT INTO authors (id, source_id, name, works_count, cited_by_count, affiliations, topics_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                author_id,
                author.get("source_id", ""),
                author.get("name", ""),
                author.get("works_count") or 0,
                author.get("cited_by_count") or 0,
                author.get("affiliations", ""),
                json.dumps(author.get("topics") or []),
                time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            ),
        )
    conn.commit()
    conn.close()
    return author_id


def link_author_publication(author_id: str, paper_id: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR IGNORE INTO author_publications (id, author_id, paper_id) VALUES (?, ?, ?)",
        (f"ap-{os.urandom(4).hex()}", author_id, paper_id),
    )
    conn.commit()
    conn.close()


def get_author_publications(author_id: str) -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT paper_id FROM author_publications WHERE author_id = ?", (author_id,))
    ids = [r["paper_id"] for r in cursor.fetchall()]
    conn.close()
    return list(get_papers_by_ids(ids).values())


def list_authors(limit: int = 100) -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM authors ORDER BY works_count DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    out = []
    for r in rows:
        d = dict(r)
        try:
            d["topics"] = json.loads(d.get("topics_json") or "[]")
        except Exception:
            d["topics"] = []
        out.append(d)
    return out


# --- Networks --------------------------------------------------------------


def save_network(seed_ids: List[str], graph: Dict[str, Any]) -> str:
    conn = get_db()
    cursor = conn.cursor()
    network_id = f"net-{os.urandom(4).hex()}"
    cursor.execute(
        "INSERT INTO research_networks (id, seed_ids_json, graph_json, created_at) VALUES (?, ?, ?, ?)",
        (
            network_id,
            json.dumps(seed_ids),
            json.dumps(graph),
            time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        ),
    )
    conn.commit()
    conn.close()
    return network_id


def get_network(network_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM research_networks WHERE id = ?", (network_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    try:
        d["graph"] = json.loads(d.get("graph_json") or "{}")
        d["seed_ids"] = json.loads(d.get("seed_ids_json") or "[]")
    except Exception:
        d["graph"] = {}
        d["seed_ids"] = []
    return d


# --- Metrics ---------------------------------------------------------------


def research_metrics() -> Dict[str, Any]:
    conn = get_db()
    cursor = conn.cursor()

    def one(query: str, params=()):
        cursor.execute(query, params)
        row = cursor.fetchone()
        return row[0] if row and row[0] is not None else 0

    metrics = {
        "saved_papers": one("SELECT COUNT(*) FROM research_papers"),
        "collections": one("SELECT COUNT(*) FROM research_collections"),
        "seeds": one("SELECT COUNT(*) FROM research_seeds"),
        "relationships": one("SELECT COUNT(*) FROM paper_relationships"),
        "authors": one("SELECT COUNT(*) FROM authors"),
    }
    cursor.execute(
        "SELECT * FROM research_papers ORDER BY updated_at DESC LIMIT 6"
    )
    rows = cursor.fetchall()
    metrics["recent_papers"] = [_paper_row_to_dict(r) for r in rows]
    cursor.execute(
        """
        SELECT c.id, c.name, c.paper_count FROM (
            SELECT col.id, col.name,
              (SELECT COUNT(*) FROM collection_papers cp WHERE cp.collection_id = col.id) AS paper_count
            FROM research_collections col
        ) c ORDER BY c.paper_count DESC LIMIT 5
        """
    )
    metrics["top_collections"] = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return metrics


def purge_expired_audits(days: int) -> List[Dict[str, Any]]:
    """Deletes audits older than the configured retention window."""
    if days is None or days < 0:
        return []
    conn = get_db()
    cursor = conn.cursor()
    cutoff = time.time() - days * 86400
    cursor.execute("SELECT id, created_at, is_demo FROM audits")
    rows = cursor.fetchall()
    expired = []
    for row in rows:
        if row["is_demo"]:
            continue
        created = row["created_at"] or ""
        try:
            import datetime

            ts = datetime.datetime.strptime(created[:19], "%Y-%m-%dT%H:%M:%S").timestamp()
        except Exception:
            try:
                ts = datetime.datetime.fromisoformat(created.replace("Z", "")).timestamp()
            except Exception:
                continue
        if ts < cutoff:
            expired.append({"id": row["id"], "created_at": created})
    conn.close()
    return expired


import re  # noqa: E402  (used by get_references_by_audit sorting)
