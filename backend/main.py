import asyncio
import concurrent.futures
import os
import re
import shutil
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import (
    BackgroundTasks,
    FastAPI,
    File,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import database as db
import discovery
import learning
from academic_apis import verify_publication_metadata
from nlp_pipeline import (
    evaluate_evidence,
    extract_bibliography,
    extract_claims_from_pages,
    extract_cited_reference_numbers,
    extract_document_text,
    map_claims_to_references,
)
from report_generator import generate_pdf_report
from sample_data import create_sample_paper_pdf, get_sample_audit_data
from consistency import analyze_document_consistency

app = FastAPI(
    title="CiteVerify API",
    description="Academic Citation Auditing & Research Discovery Engine",
    version="2.5.0",
)

# CORS: local development origins plus explicitly configured production sites.
configured_cors_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys([
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        *configured_cors_origins,
    ])),
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOADS_DIR = os.path.join(BASE_DIR, "uploads")
REPORTS_DIR = os.path.join(BASE_DIR, "reports")
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
TOTAL_STEPS = 11

app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

PIPELINE_STAGES = [
    "Document uploaded",
    "Text extracted",
    "Metadata identified",
    "Research claims extracted",
    "Citations identified",
    "References extracted",
    "Claims mapped to references",
    "Academic records searched",
    "Original sources retrieved",
    "Evidence analysed",
    "Report generated",
]


@app.on_event("startup")
def startup_event():
    db.init_db()
    sample_pdf_path = os.path.join(UPLOADS_DIR, "sample_paper.pdf")
    if not os.path.exists(sample_pdf_path):
        try:
            create_sample_paper_pdf(sample_pdf_path)
        except Exception as exc:
            print(f"Error creating sample PDF: {exc}")

    try:
        # Idempotent: creates the demo on a fresh database and refreshes its
        # pipeline metadata when the bundled sample already exists.
        seed_sample_audit()
    except Exception as exc:
        print(f"Sample audit seeding skipped: {exc}")

    # Retention policy enforcement (privacy setting).
    try:
        settings = db.get_settings()
        if settings.get("auto_cleanup", "true") == "true":
            days = int(settings.get("data_retention_days", "30") or 30)
            run_retention_cleanup(days)
    except Exception as exc:
        print(f"Retention cleanup skipped: {exc}")


def run_retention_cleanup(days: int) -> List[str]:
    expired = db.purge_expired_audits(days)
    removed = []
    for item in expired:
        audit_id = item["id"]
        audit = db.get_audit(audit_id)
        if audit and audit.get("pdf_path") and "sample_paper.pdf" not in audit["pdf_path"]:
            path = os.path.join(BASE_DIR, audit["pdf_path"])
            if os.path.exists(path):
                try:
                    os.remove(path)
                except Exception:
                    pass
        report_path = os.path.join(REPORTS_DIR, f"{audit_id}_report.pdf")
        if os.path.exists(report_path):
            try:
                os.remove(report_path)
            except Exception:
                pass
        db.delete_audit(audit_id)
        removed.append(audit_id)
    return removed


def seed_sample_audit():
    sample = get_sample_audit_data()
    sample["audit"]["is_demo"] = True
    sample["audit"]["total_steps"] = TOTAL_STEPS
    sample["audit"]["current_step"] = TOTAL_STEPS
    existing_sample = db.get_audit(sample["audit"]["id"])
    if not existing_sample:
        db.create_audit(sample["audit"])
        for ref in sample["references"]:
            ref["audit_id"] = sample["audit"]["id"]
        for claim in sample["claims"]:
            claim["audit_id"] = sample["audit"]["id"]
        db.save_references(sample["references"])
        db.save_claims(sample["claims"])
    else:
        # Keep the bundled demo aligned with the current pipeline metadata.
        db.update_audit(
            sample["audit"]["id"],
            {"is_demo": 1, "total_steps": TOTAL_STEPS, "current_step": TOTAL_STEPS},
        )
    report_id = sample["audit"]["id"]
    report_path = os.path.join(REPORTS_DIR, f"{report_id}_report.pdf")
    if not os.path.exists(report_path):
        try:
            generate_pdf_report(
                sample["audit"], sample["claims"], sample["references"], report_path
            )
        except Exception as exc:
            print(f"Error generating sample report: {exc}")


# ---------------------------------------------------------------------------
# Audit pipeline
# ---------------------------------------------------------------------------


async def process_audit_pipeline(audit_id: str, pdf_path: str):
    """Runs the full evidence pipeline with real stage progress."""
    diagnostic_log: List[Dict[str, Any]] = []
    def log_stage(stage: str, detail: str):
        diagnostic_log.append({"stage": stage, "detail": detail, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ")})
    try:
        db.update_audit(
            audit_id,
            {
                "status": "processing",
                "current_step": 1,
                "total_steps": TOTAL_STEPS,
                "step_message": "Document uploaded — secure workspace created",
            },
        )
        await asyncio.sleep(0.05)

        # Stage 2: real text extraction
        try:
            full_text, pages_data, metadata = extract_document_text(pdf_path)
        except Exception as exc:
            db.update_audit(
                audit_id,
                {
                    "status": "failed",
                    "step_message": f"Text extraction failed: {str(exc)[:220]}",
                },
            )
            return

        warnings = metadata.get("extraction_warnings", [])
        log_stage("text_extraction", f"{metadata.get('total_pages', 1)} pages via {metadata.get('extraction_engine', 'PDF parser')}")
        db.update_audit(
            audit_id,
            {
                "current_step": 2,
                "step_message": (
                    f"Extracted {metadata.get('total_pages', 1)} pages with "
                    f"{metadata.get('extraction_engine', 'PDF parser')}"
                    + (f" — {len(warnings)} extraction warning(s)" if warnings else "")
                ),
            },
        )
        await asyncio.sleep(0.05)

        # Stage 3: metadata
        db.update_audit(
            audit_id,
            {
                "current_step": 3,
                "title": metadata.get("title", "Untitled Document"),
                "authors": metadata.get("authors", "Unknown Authors"),
                "authors_list": metadata.get("authors_list", []),
                "affiliations": metadata.get("affiliations", []),
                "corresponding_author": metadata.get("corresponding_author", ""),
                "publication_date": metadata.get("publication_date", ""),
                "abstract": metadata.get("abstract", ""),
                "total_pages": metadata.get("total_pages", 1),
                "doi": metadata.get("doi", ""),
                "journal": metadata.get("journal", ""),
                "year": metadata.get("year", ""),
                "extraction_engine": metadata.get("extraction_engine", ""),
                "step_message": (
                    "Identified manuscript metadata"
                    + (f" · DOI {metadata['doi']}" if metadata.get("doi") else "")
                ),
            },
        )
        await asyncio.sleep(0.05)
        log_stage("metadata_extraction", f"Title and {len(metadata.get('authors_list', []))} author names recovered; affiliations separately identified")

        consistency_findings = analyze_document_consistency(full_text)
        db.save_consistency_findings(audit_id, consistency_findings)
        db.update_audit(audit_id, {"consistency_findings": consistency_findings})
        log_stage("document_consistency", f"{len(consistency_findings)} internal reporting findings")

        # Stage 4: claims
        references, marker_map, diagnostics = extract_bibliography(full_text, pages_data)
        log_stage("reference_extraction", f"{len(references)} bibliography entries segmented")
        # IDs are primary keys across the whole SQLite database, not just an
        # individual audit. Prefix generated IDs before saving so processing a
        # second paper cannot replace claim/ref rows from an earlier audit.
        ref_id_map: Dict[str, str] = {}
        for ref_index, ref in enumerate(references, start=1):
            old_ref_id = str(ref.get("id") or f"ref-{ref_index}")
            ref["id"] = f"{audit_id}-ref-{ref.get('number') or ref_index}"
            ref_id_map[old_ref_id] = ref["id"]
            ref["audit_id"] = audit_id
        marker_map = {
            marker: ref_id_map.get(ref_id, ref_id)
            for marker, ref_id in marker_map.items()
        }
        claims = extract_claims_from_pages(pages_data, references)
        for claim_index, claim in enumerate(claims, start=1):
            claim["id"] = f"{audit_id}-claim-{claim_index}"
            claim["audit_id"] = audit_id
        db.update_audit(
            audit_id,
            {
                "current_step": 4,
                "step_message": f"Extracted {len(claims)} research claims",
            },
        )
        log_stage("claim_extraction", f"{len(claims)} deduplicated evidence-bearing claims")
        await asyncio.sleep(0.05)

        # Stage 5: citations
        cited = sum(1 for c in claims if c.get("citation_marker"))
        db.update_audit(
            audit_id,
            {
                "current_step": 5,
                "step_message": (
                    f"Detected in-text citations on {cited} of {len(claims)} claims"
                ),
            },
        )
        await asyncio.sleep(0.05)

        # Stage 6: references
        db.update_audit(
            audit_id,
            {
                "current_step": 6,
                "step_message": (
                    f"Segmented {len(references)} bibliography entries "
                    f"({diagnostics.get('manual_review_needed', 0)} need manual review)"
                ),
            },
        )
        await asyncio.sleep(0.05)

        # Stage 7: mapping
        map_claims_to_references(claims, references, marker_map)
        mapped = sum(1 for c in claims if c.get("reference_id"))
        db.update_audit(
            audit_id,
            {
                "current_step": 7,
                "step_message": (
                    f"Mapped {mapped} claims to bibliography entries "
                    f"({len(claims) - mapped} without a detectable citation)"
                ),
            },
        )
        await asyncio.sleep(0.05)
        citation_numbers = set(extract_cited_reference_numbers(pages_data, references))
        bibliography_numbers = {int(r.get("number")) for r in references if str(r.get("number", "")).isdigit()}
        reference_issues = {"missing_bibliography_entries": sorted(citation_numbers - bibliography_numbers), "uncited_bibliography_entries": sorted(bibliography_numbers - citation_numbers)}
        log_stage("citation_mapping", f"{mapped} claims mapped; missing entries {reference_issues['missing_bibliography_entries']}; uncited entries {reference_issues['uncited_bibliography_entries']}")

        # Stage 8: scholarly lookups (real network calls)
        db.update_audit(
            audit_id,
            {
                "current_step": 8,
                "step_message": f"Searching Crossref, OpenAlex and Semantic Scholar for {len(references)} references",
            },
        )

        def _verify(ref_entry: Dict[str, Any]) -> Dict[str, Any]:
            try:
                result = verify_publication_metadata(
                    ref_entry.get("title", ""),
                    ref_entry.get("authors", ""),
                    ref_entry.get("year", ""),
                    ref_entry.get("doi", ""),
                )
                ref_entry.update(result)
                matched_doi = result.get("matched_doi") or ref_entry.get("doi")
                if matched_doi:
                    paper_id = db.upsert_paper(
                        {
                            "id": f"doi:{matched_doi.lower()}",
                            "source": "crossref",
                            "source_id": matched_doi,
                            "doi": matched_doi,
                            "title": result.get("matched_title") or ref_entry.get("title"),
                            "authors": result.get("matched_authors") or ref_entry.get("authors"),
                            "year": result.get("matched_year") or ref_entry.get("year"),
                            "journal": result.get("matched_journal") or ref_entry.get("journal"),
                            "abstract": result.get("abstract", ""),
                            "url": result.get("url", ""),
                            "oa_url": result.get("oa_url", ""),
                            "is_open_access": result.get("is_open_access", False),
                            "citation_count": result.get("citation_count") or 0,
                            "type": "article",
                        }
                    )
                    ref_entry["paper_id"] = paper_id
            except Exception as exc:  # never lose a reference to an exception
                ref_entry.update(
                    {
                        "authenticity_status": "RETRIEVAL_FAILED",
                        "authenticity_reason": f"Scholarly lookup error: {str(exc)[:120]}",
                        "retrieval_level": "unavailable",
                    }
                )
            return ref_entry

        if references:
            with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
                list(executor.map(_verify, references))
        log_stage("publication_verification", f"Lookups completed for {len(references)} bibliography records")

        db.save_references(references)
        verified = sum(
            1 for r in references if r.get("authenticity_status") == "VERIFIED"
        )
        await asyncio.sleep(0.05)

        # Stage 9: source retrieval level summary
        full_text_sources = sum(
            1 for r in references if r.get("retrieval_level") == "full_text"
        )
        abstract_sources = sum(
            1 for r in references if r.get("retrieval_level") == "abstract_only"
        )
        log_stage("source_retrieval", f"{full_text_sources} full text and {abstract_sources} abstract sources available")
        db.update_audit(
            audit_id,
            {
                "current_step": 9,
                "step_message": (
                    f"Retrieved source material for {abstract_sources + full_text_sources} "
                    f"references ({verified} publications verified)"
                ),
            },
        )
        await asyncio.sleep(0.05)

        # Stage 10: evidence analysis
        db.update_audit(
            audit_id,
            {"current_step": 10, "step_message": "Comparing claims against retrieved source text"},
        )
        ref_by_id = {r["id"]: r for r in references}
        training_rows = db.get_claim_feedback()
        for claim in claims:
            target = ref_by_id.get(claim.get("reference_id"))
            claim.update(evaluate_evidence(claim, target))
            # Offer source wording only when the source was actually retrieved and
            # the comparison found a meaningful mismatch. This is verbatim evidence,
            # not an LLM-generated rewrite of the manuscript claim.
            if (
                claim.get("verdict") in {"PARTIALLY_SUPPORTED", "CONTRADICTED"}
                and claim.get("evidence_passage")
                and claim.get("retrieval_level") in {"abstract_only", "full_text"}
            ):
                claim["source_grounded_wording"] = claim["evidence_passage"]
                claim["correction_note"] = (
                    "This is exact wording from the retrieved source, not an automatically "
                    "rewritten claim. Use it to revise the claim only after checking that "
                    "the source passage addresses the same population, outcome and time period."
                )
            else:
                claim["source_grounded_wording"] = ""
                claim["correction_note"] = ""
            suggestion = learning.predict({
                "claim_text": claim.get("claim_text", ""),
                "evidence_text": "\n".join(filter(None, [claim.get("evidence_passage", ""), claim.get("verdict_explanation", "")])),
            }, training_rows)
            if suggestion:
                claim["learned_suggestion"] = suggestion["verdict"]
                claim["learned_confidence"] = suggestion["confidence"]
        db.save_claims(claims)
        log_stage("evidence_analysis", f"Verdicts assigned across {len(claims)} claims using retrieved source material")

        claim_counts = {
            "total": len(claims),
            "supported": sum(1 for c in claims if c.get("verdict") == "SUPPORTED"),
            "partial": sum(
                1 for c in claims if c.get("verdict") == "PARTIALLY_SUPPORTED"
            ),
            "contradicted": sum(1 for c in claims if c.get("verdict") == "CONTRADICTED"),
            "insufficient": sum(
                1 for c in claims if c.get("verdict") == "INSUFFICIENT_EVIDENCE"
            ),
            "unverified": sum(1 for c in claims if c.get("verdict") == "UNVERIFIED"),
        }
        ref_counts = {
            "total": len(references),
            "verified": verified,
            "possible_match": sum(
                1 for r in references if r.get("authenticity_status") == "POSSIBLE_MATCH"
            ),
            "mismatch": sum(
                1 for r in references if r.get("authenticity_status") == "MISMATCH"
            ),
            "unverified": sum(
                1 for r in references if r.get("authenticity_status") == "UNVERIFIED"
            ),
            "retrieval_failed": sum(
                1
                for r in references
                if r.get("authenticity_status") == "RETRIEVAL_FAILED"
            ),
            "needs_review": sum(1 for r in references if r.get("needs_review")),
        }
        retrieval_counts = {
            "full_text": full_text_sources,
            "abstract_only": abstract_sources,
            "metadata_only": sum(
                1 for r in references if r.get("retrieval_level") == "metadata_only"
            ),
            "unavailable": sum(
                1 for r in references if r.get("retrieval_level") == "unavailable"
            ),
        }
        mapping_counts = {
            "mapped": sum(1 for c in claims if c.get("mapping_status") == "MAPPED"),
            "ambiguous": sum(
                1 for c in claims if c.get("mapping_status") == "AMBIGUOUS"
            ),
            "unmapped": sum(1 for c in claims if c.get("mapping_status") == "UNMAPPED"),
        }
        summary = {
            "claims": claim_counts,
            "references": ref_counts,
            "retrieval": retrieval_counts,
            "mapping": mapping_counts,
            "diagnostics": diagnostics,
            "extraction_warnings": warnings,
            "document_consistency": {"total": len(consistency_findings), "by_type": {kind: sum(1 for f in consistency_findings if f["finding_type"] == kind) for kind in sorted({f["finding_type"] for f in consistency_findings})}},
            "reference_issues": reference_issues,
        }

        # Stage 11: report
        db.update_audit(
            audit_id,
            {"current_step": 11, "step_message": "Generating the audit report PDF"},
        )
        audit_data = db.get_audit(audit_id) or {}
        audit_data["summary"] = summary
        report_path = os.path.join(REPORTS_DIR, f"{audit_id}_report.pdf")
        try:
            generate_pdf_report(audit_data, claims, references, report_path)
        except Exception as exc:
            print(f"Report generation failed: {exc}")
            warnings.append(f"Report generation failed: {str(exc)[:120]}")
        log_stage("report_generation", "Audit PDF report generated" if os.path.exists(report_path) else "Audit PDF report generation failed")

        db.update_audit(
            audit_id,
            {
                "status": "completed",
                "current_step": TOTAL_STEPS,
                "total_steps": TOTAL_STEPS,
                "step_message": "Verification complete",
                "summary": summary,
                "diagnostics": diagnostics,
                "diagnostic_log": diagnostic_log + [{"stage": "complete", "detail": "Audit report generated", "at": time.strftime("%Y-%m-%dT%H:%M:%SZ")}],
            },
        )

    except Exception as exc:
        print(f"Pipeline error for audit {audit_id}: {exc}")
        db.update_audit(
            audit_id,
            {
                "status": "failed",
                "step_message": f"Pipeline halted: {str(exc)[:240]}",
            },
        )


# ---------------------------------------------------------------------------
# Audit endpoints
# ---------------------------------------------------------------------------


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "CiteVerify", "version": app.version}


@app.post("/api/upload")
async def upload_document(
    background_tasks: BackgroundTasks, file: UploadFile = File(...)
):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Invalid file format. Only PDF research papers are supported.",
        )

    audit_id = f"audit-{uuid.uuid4().hex[:10]}"
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(file.filename))[:120]
    dest_filename = f"{audit_id}_{safe_name}"
    dest_path = os.path.join(UPLOADS_DIR, dest_filename)

    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = os.path.getsize(dest_path)
    if file_size > MAX_UPLOAD_BYTES:
        os.remove(dest_path)
        raise HTTPException(
            status_code=400,
            detail="File exceeds the 50 MB limit.",
        )
    if file_size == 0:
        os.remove(dest_path)
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    header = b""
    with open(dest_path, "rb") as fh:
        header = fh.read(5)
    if header[:4] != b"%PDF":
        os.remove(dest_path)
        raise HTTPException(
            status_code=400,
            detail="This file is not a valid PDF (missing PDF header).",
        )

    new_audit = {
        "id": audit_id,
        "filename": file.filename,
        "title": os.path.splitext(file.filename)[0],
        "authors": "Identifying authors…",
        "abstract": "",
        "total_pages": 1,
        "status": "processing",
        "current_step": 1,
        "total_steps": TOTAL_STEPS,
        "step_message": "PDF uploaded and verification pipeline queued",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pdf_path": f"uploads/{dest_filename}",
        "summary": {},
        "is_demo": 0,
    }
    db.create_audit(new_audit)
    background_tasks.add_task(process_audit_pipeline, audit_id, dest_path)

    return {
        "audit_id": audit_id,
        "filename": file.filename,
        "status": "processing",
        "message": "Audit successfully initialized",
    }


@app.post("/api/sample-audit")
async def load_sample_audit():
    sample = get_sample_audit_data()
    if not db.get_audit(sample["audit"]["id"]):
        seed_sample_audit()
    return {
        "audit_id": sample["audit"]["id"],
        "message": "Sample audit loaded successfully",
        "demo": True,
    }


@app.get("/api/audits")
async def get_all_audits():
    return db.list_audits()


@app.get("/api/audits/{audit_id}")
async def get_audit_details(audit_id: str):
    audit = db.get_audit(audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    return audit


@app.get("/api/audits/{audit_id}/claims")
async def get_audit_claims(audit_id: str):
    if not db.get_audit(audit_id):
        raise HTTPException(status_code=404, detail="Audit not found")
    return db.get_claims_by_audit(audit_id)


class ClaimFeedbackRequest(BaseModel):
    corrected_verdict: str
    rationale: str = Field(default="", max_length=2000)


@app.get("/api/learning/status")
async def get_learning_status():
    return learning.status(db.get_claim_feedback())


@app.get("/api/audits/{audit_id}/feedback")
async def get_audit_feedback(audit_id: str):
    if not db.get_audit(audit_id):
        raise HTTPException(status_code=404, detail="Audit not found")
    return [item for item in db.get_claim_feedback() if item.get("audit_id") == audit_id]


@app.post("/api/claims/{claim_id}/feedback")
async def label_claim(claim_id: str, payload: ClaimFeedbackRequest):
    verdict = payload.corrected_verdict.strip().upper()
    if verdict not in learning.VERDICTS:
        raise HTTPException(status_code=422, detail="Choose a valid evidence verdict.")
    claim = db.get_claim(claim_id)
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ")
    evidence_text = "\n".join(filter(None, [claim.get("evidence_passage", ""), claim.get("verdict_explanation", "")]))
    db.save_claim_feedback({
        "id": f"feedback-{uuid.uuid4().hex[:12]}", "claim_id": claim_id,
        "audit_id": claim["audit_id"], "claim_text": claim["claim_text"],
        "evidence_text": evidence_text, "corrected_verdict": verdict,
        "rationale": payload.rationale.strip(), "created_at": now, "updated_at": now,
    })
    explanation = "Reviewer adjudication: " + (payload.rationale.strip() or f"Verdict confirmed as {verdict.replace('_', ' ').lower()}.")
    db.update_claim(claim_id, {"verdict": verdict, "verdict_explanation": explanation})
    reviewed_claims = db.get_claims_by_audit(claim["audit_id"])
    audit = db.get_audit(claim["audit_id"]) or {}
    summary = audit.get("summary") or {}
    summary["claims"] = {
        "total": len(reviewed_claims),
        "supported": sum(c.get("verdict") == "SUPPORTED" for c in reviewed_claims),
        "partial": sum(c.get("verdict") == "PARTIALLY_SUPPORTED" for c in reviewed_claims),
        "contradicted": sum(c.get("verdict") == "CONTRADICTED" for c in reviewed_claims),
        "insufficient": sum(c.get("verdict") == "INSUFFICIENT_EVIDENCE" for c in reviewed_claims),
        "unverified": sum(c.get("verdict") == "UNVERIFIED" for c in reviewed_claims),
    }
    db.update_audit(claim["audit_id"], {"summary": summary})
    rows = db.get_claim_feedback()
    return {
        "learning": learning.status(rows),
        "suggestion": learning.predict({"claim_text": claim["claim_text"], "evidence_text": evidence_text}, rows),
        "saved_verdict": verdict,
    }


@app.get("/api/audits/{audit_id}/references")
async def get_audit_references(audit_id: str):
    if not db.get_audit(audit_id):
        raise HTTPException(status_code=404, detail="Audit not found")
    return db.get_references_by_audit(audit_id)


@app.get("/api/audits/{audit_id}/consistency")
async def get_audit_consistency(audit_id: str):
    if not db.get_audit(audit_id):
        raise HTTPException(status_code=404, detail="Audit not found")
    return db.get_consistency_findings(audit_id)


@app.get("/api/audits/{audit_id}/pages/{page_number}")
async def get_audit_page(audit_id: str, page_number: int):
    """Returns extracted page text for the PDF workspace.

    Text-based highlighting is used because exact glyph coordinates are not
    always recoverable; we never draw a highlight we cannot justify.
    """
    audit = db.get_audit(audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    if not audit.get("pdf_path"):
        raise HTTPException(status_code=404, detail="No PDF attached to this audit")
    pdf_path = os.path.join(BASE_DIR, audit["pdf_path"])
    if not os.path.exists(pdf_path):
        raise HTTPException(status_code=404, detail="PDF file is no longer available")
    try:
        _full, pages_data, _meta = extract_document_text(pdf_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not read PDF: {exc}")
    page = next((p for p in pages_data if p["page_number"] == page_number), None)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    claims = [
        c
        for c in db.get_claims_by_audit(audit_id)
        if c.get("page_number") == page_number
    ]
    return {
        "page_number": page_number,
        "total_pages": len(pages_data),
        "text": page.get("clean_text") or page.get("text", ""),
        "claims": [
            {
                "id": c["id"],
                "claim_text": c["claim_text"],
                "verdict": c["verdict"],
                "citation_marker": c.get("citation_marker", ""),
            }
            for c in claims
        ],
    }


@app.get("/api/audits/{audit_id}/report")
async def download_report(audit_id: str):
    audit = db.get_audit(audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    report_path = os.path.join(REPORTS_DIR, f"{audit_id}_report.pdf")
    if not os.path.exists(report_path):
        claims = db.get_claims_by_audit(audit_id)
        references = db.get_references_by_audit(audit_id)
        try:
            generate_pdf_report(audit, claims, references, report_path)
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail=f"Report generation failed: {exc}"
            )
    return FileResponse(
        path=report_path,
        filename=f"CiteVerify_Audit_Report_{audit_id[:8]}.pdf",
        media_type="application/pdf",
    )


@app.delete("/api/audits/{audit_id}")
async def remove_audit(audit_id: str):
    audit = db.get_audit(audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")

    if audit.get("pdf_path"):
        full_pdf_path = os.path.join(BASE_DIR, audit["pdf_path"])
        if os.path.exists(full_pdf_path) and "sample_paper.pdf" not in full_pdf_path:
            try:
                os.remove(full_pdf_path)
            except Exception:
                pass

    report_path = os.path.join(REPORTS_DIR, f"{audit_id}_report.pdf")
    if os.path.exists(report_path):
        try:
            os.remove(report_path)
        except Exception:
            pass

    db.delete_audit(audit_id)
    return {"message": "Audit and associated findings deleted"}


@app.post("/api/audits/{audit_id}/reprocess")
async def reprocess_audit(audit_id: str, background_tasks: BackgroundTasks):
    audit = db.get_audit(audit_id)
    if not audit:
        raise HTTPException(status_code=404, detail="Audit not found")
    pdf_rel_path = audit.get("pdf_path")
    if not pdf_rel_path:
        raise HTTPException(status_code=400, detail="Audit has no PDF file attached")
    full_pdf_path = os.path.join(BASE_DIR, pdf_rel_path)
    if not os.path.exists(full_pdf_path):
        raise HTTPException(status_code=404, detail="PDF file is no longer available")

    db.clear_audit_findings(audit_id)
    db.update_audit(
        audit_id,
        {
            "status": "pending",
            "current_step": 0,
            "step_message": "Queued for comprehensive re-audit",
        },
    )
    background_tasks.add_task(process_audit_pipeline, audit_id, full_pdf_path)
    return {"message": "Audit pipeline re-triggered", "audit_id": audit_id}


class SettingsUpdate(BaseModel):
    settings: Dict[str, str]


@app.get("/api/settings")
async def fetch_settings():
    return db.get_settings()


@app.post("/api/settings")
async def update_user_settings(payload: SettingsUpdate):
    allowed = {
        "strict_verification",
        "openalex_enabled",
        "crossref_enabled",
        "semantic_scholar_enabled",
        "ai_model",
        "auto_download_report",
        "privacy_mode",
        "data_retention_days",
        "auto_cleanup",
        "external_ai_disclosure",
    }
    clean = {k: str(v)[:120] for k, v in payload.settings.items() if k in allowed}
    db.save_settings(clean)
    return {"message": "Settings updated", "settings": db.get_settings()}


@app.post("/api/maintenance/cleanup")
async def trigger_cleanup():
    settings = db.get_settings()
    days = int(settings.get("data_retention_days", "30") or 30)
    removed = run_retention_cleanup(days)
    return {"removed": removed, "count": len(removed), "retention_days": days}


@app.get("/api/dashboard")
async def dashboard():
    """Aggregated, real metrics across audits and research discovery."""
    audits = db.list_audits()
    claims = {
        "total": 0,
        "supported": 0,
        "partial": 0,
        "contradicted": 0,
        "insufficient": 0,
        "unverified": 0,
        "needs_review": 0,
    }
    references = {
        "total": 0,
        "verified": 0,
        "possible_match": 0,
        "mismatch": 0,
        "unverified": 0,
        "retrieval_failed": 0,
    }
    mapping = {"mapped": 0, "ambiguous": 0, "unmapped": 0}
    for audit in audits:
        summary = audit.get("summary") or {}
        for key in claims:
            claims[key] += (summary.get("claims") or {}).get(key, 0) or 0
        for key in references:
            references[key] += (summary.get("references") or {}).get(key, 0) or 0
        for key in mapping:
            mapping[key] += (summary.get("mapping") or {}).get(key, 0) or 0

    recent_claims: List[Dict[str, Any]] = []
    if audits:
        recent_claims = db.get_claims_by_audit(audits[0]["id"])
    flagged = [
        c
        for c in recent_claims
        if c.get("verdict") in ("CONTRADICTED", "PARTIALLY_SUPPORTED")
        or c.get("mapping_status") == "AMBIGUOUS"
    ][:6]

    return {
        "audits": {
            "total": len(audits),
            "completed": sum(1 for a in audits if a.get("status") == "completed"),
            "processing": sum(
                1 for a in audits if a.get("status") in ("processing", "pending")
            ),
            "documents": sum(
                1 for a in audits if a.get("status") == "completed"
            ),
        },
        "claims": claims,
        "references": references,
        "mapping": mapping,
        "manual_review": claims["needs_review"],
        "recent_audits": audits[:5],
        "flagged_claims": flagged,
        "discovery": db.research_metrics(),
        "pipeline_stages": PIPELINE_STAGES,
    }


# ---------------------------------------------------------------------------
# Discovery endpoints
# ---------------------------------------------------------------------------


def _parse_year(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    try:
        return int(value[:4])
    except Exception:
        return None


@app.get("/api/discovery/search")
async def discovery_search(
    q: str = Query("", max_length=200),
    page: int = 1,
    per_page: int = 20,
    year_from: Optional[str] = None,
    year_to: Optional[str] = None,
    is_oa: Optional[str] = None,
    work_type: Optional[str] = None,
    min_citations: Optional[str] = None,
    author: Optional[str] = None,
    sort: str = "relevance",
):
    if not q.strip():
        raise HTTPException(status_code=400, detail="A search query is required")
    return discovery.search(
        query=q,
        page=max(1, page),
        per_page=min(max(1, per_page), 50),
        year_from=_parse_year(year_from),
        year_to=_parse_year(year_to),
        is_oa=(is_oa == "true") if is_oa else None,
        work_type=work_type or None,
        min_citations=int(min_citations) if min_citations and min_citations.isdigit() else None,
        author=author or None,
        sort=sort,
    )


@app.get("/api/discovery/papers/{paper_id:path}")
async def discovery_paper(paper_id: str):
    detail = discovery.paper_detail(paper_id)
    if not detail.get("paper"):
        raise HTTPException(status_code=404, detail="Publication not found")
    return detail


@app.get("/api/discovery/papers/{paper_id:path}/references")
async def discovery_references(paper_id: str, limit: int = 50):
    return discovery.references(paper_id, limit=min(limit, 50))


@app.get("/api/discovery/papers/{paper_id:path}/citations")
async def discovery_citations(paper_id: str, limit: int = 25):
    return discovery.citations(paper_id, limit=min(limit, 50))


@app.get("/api/discovery/papers/{paper_id:path}/similar")
async def discovery_similar(paper_id: str, limit: int = 15):
    return discovery.similar(paper_id, limit=min(limit, 30))


@app.get("/api/discovery/papers/{paper_id:path}/authors")
async def discovery_authors(paper_id: str):
    return {"authors": discovery.paper_authors(paper_id)}


class SeedCreate(BaseModel):
    paper_id: str
    note: str = ""


@app.post("/api/discovery/seeds")
async def add_seed(payload: SeedCreate):
    paper = db.get_paper(payload.paper_id) or discovery._ensure_paper(payload.paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Publication not found")
    seed = db.add_seed(paper["id"], payload.note)
    seed["paper"] = db.get_paper(paper["id"])
    return seed


@app.delete("/api/discovery/seeds/{seed_id:path}")
async def delete_seed(seed_id: str):
    if not db.remove_seed(seed_id):
        raise HTTPException(status_code=404, detail="Seed not found")
    return {"message": "Seed removed"}


@app.get("/api/discovery/seeds")
async def get_seeds():
    return db.list_seeds()


class NetworkRequest(BaseModel):
    seed_ids: List[str] = Field(default_factory=list)
    include_references: bool = True
    include_citations: bool = True
    include_similar: bool = True
    max_nodes: int = 40


@app.post("/api/discovery/network")
async def create_network(payload: NetworkRequest):
    graph = discovery.build_network(
        payload.seed_ids,
        include_references=payload.include_references,
        include_citations=payload.include_citations,
        include_similar=payload.include_similar,
        max_nodes=max(5, min(payload.max_nodes, 80)),
    )
    network_id = db.save_network(payload.seed_ids, graph)
    graph["network_id"] = network_id
    return graph


@app.get("/api/discovery/network/{network_id}")
async def get_network(network_id: str):
    network = db.get_network(network_id)
    if not network:
        raise HTTPException(status_code=404, detail="Network not found")
    graph = network["graph"]
    graph["network_id"] = network_id
    return graph


@app.get("/api/discovery/demo-network")
async def get_demo_network():
    graph = discovery.demo_network()
    network_id = db.save_network(graph.get("seed_ids", []), graph)
    graph["network_id"] = network_id
    return graph


class CollectionCreate(BaseModel):
    name: str
    description: str = ""


class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class CollectionPaperRequest(BaseModel):
    paper_id: str
    note: str = ""


class NoteUpdate(BaseModel):
    note: str = ""


@app.get("/api/discovery/collections")
async def list_collections():
    return {"collections": db.list_collections()}


@app.post("/api/discovery/collections")
async def create_collection(payload: CollectionCreate):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Collection name is required")
    return db.create_collection(payload.name, payload.description)


@app.patch("/api/discovery/collections/{collection_id}")
async def update_collection(collection_id: str, payload: CollectionUpdate):
    if not payload.name and payload.description is None:
        raise HTTPException(status_code=400, detail="Nothing to update")
    ok = db.rename_collection(
        collection_id, payload.name or "", payload.description
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"message": "Collection updated"}


@app.delete("/api/discovery/collections/{collection_id}")
async def remove_collection(collection_id: str):
    if not db.delete_collection(collection_id):
        raise HTTPException(status_code=404, detail="Collection not found")
    return {"message": "Collection deleted"}


@app.get("/api/discovery/collections/{collection_id}")
async def collection_detail(collection_id: str):
    collections = [c for c in db.list_collections() if c["id"] == collection_id]
    if not collections:
        raise HTTPException(status_code=404, detail="Collection not found")
    papers = db.get_collection_papers(collection_id)
    return {"collection": collections[0], "papers": papers}


@app.post("/api/discovery/collections/{collection_id}/papers")
async def add_collection_paper(collection_id: str, payload: CollectionPaperRequest):
    if not any(c["id"] == collection_id for c in db.list_collections()):
        raise HTTPException(status_code=404, detail="Collection not found")
    paper = db.get_paper(payload.paper_id) or discovery._ensure_paper(payload.paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Publication not found")
    db.add_paper_to_collection(collection_id, paper["id"], payload.note)
    return {"message": "Publication saved", "paper": db.get_paper(paper["id"])}


@app.delete("/api/discovery/collections/{collection_id}/papers/{paper_id:path}")
async def remove_collection_paper(collection_id: str, paper_id: str):
    if not db.remove_paper_from_collection(collection_id, paper_id):
        raise HTTPException(status_code=404, detail="Publication not in collection")
    return {"message": "Publication removed"}


@app.patch("/api/discovery/collections/{collection_id}/papers/{paper_id:path}/note")
async def update_collection_note(
    collection_id: str, paper_id: str, payload: NoteUpdate
):
    if not db.set_collection_note(collection_id, paper_id, payload.note):
        raise HTTPException(status_code=404, detail="Publication not in collection")
    return {"message": "Note saved"}


@app.get("/api/discovery/timeline")
async def discovery_timeline(ids: str = Query("", max_length=4000)):
    paper_ids = [i for i in ids.split(",") if i]
    if not paper_ids:
        paper_ids = [p["id"] for p in db.list_papers(limit=200)]
    return discovery.timeline(paper_ids)


@app.get("/api/discovery/authors")
async def search_authors(q: str = Query("", max_length=160)):
    if not q.strip():
        return {"results": db.list_authors(limit=50), "warnings": []}
    return discovery.search_authors(q)


@app.get("/api/discovery/authors/{author_id}")
async def author_detail(author_id: str):
    return discovery.author_detail(author_id)


@app.get("/api/discovery/saved")
async def saved_papers():
    papers = db.list_papers(limit=200)
    return {"papers": papers, "total": len(papers)}


# ---------------------------------------------------------------------------
# Static frontend (production build)
# ---------------------------------------------------------------------------

FRONTEND_DIST = os.path.join(os.path.dirname(BASE_DIR), "frontend", "dist")
if os.path.exists(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith(("api", "uploads")):
            raise HTTPException(status_code=404, detail="Not Found")
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        index_file = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Not Found")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
