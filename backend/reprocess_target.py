import asyncio
import os
import sys

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import (
    clear_audit_findings,
    get_audit,
    get_claims_by_audit,
    get_references_by_audit,
    init_db,
    update_audit,
)
import database as db
import main as pipeline_module
process_audit_pipeline = pipeline_module.process_audit_pipeline


async def _yield_without_delay(_seconds):
    """Avoid artificial UI progress pauses in this one-off diagnostic run."""
    return None

TARGET_AUDIT_ID = "audit-d2ad1fbd31"
PDF_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "uploads",
    "audit-d2ad1fbd31_CiteVerify_Synthetic_Flawed_Research_Paper.pdf",
)


def main():
    print(f"Target Audit ID: {TARGET_AUDIT_ID}")
    print(f"PDF Path: {PDF_PATH}")
    print(f"PDF exists: {os.path.exists(PDF_PATH)}")

    if not os.path.exists(PDF_PATH):
        print("ERROR: Target PDF not found!")
        return

    init_db()
    print("Clearing old findings...")
    clear_audit_findings(TARGET_AUDIT_ID)

    print("Running process_audit_pipeline...")
    # The desktop runner's event-loop timer can stall in this environment; the
    # pipeline's pauses are presentation-only, so omit those during reprocess.
    pipeline_module.asyncio.sleep = _yield_without_delay
    pipeline = process_audit_pipeline(TARGET_AUDIT_ID, PDF_PATH)
    try:
        pipeline.send(None)
    except StopIteration:
        pass

    print("\n" + "=" * 60)
    print("AUDIT PIPELINE EXECUTION FINISHED")
    print("=" * 60)

    audit = get_audit(TARGET_AUDIT_ID)
    print(f"Title: {audit.get('title')}")
    print(f"Authors: {audit.get('authors')}")
    print(f"Author names: {audit.get('authors_list')}")
    print(f"Affiliations: {audit.get('affiliations')}")
    print(f"Corresponding author: {audit.get('corresponding_author')}")
    print(f"Publication date: {audit.get('publication_date')}")
    print(f"Status: {audit.get('status')}")
    print(f"Summary: {audit.get('summary')}")
    print(f"Diagnostics: {audit.get('diagnostics')}")
    print(f"Diagnostic log: {audit.get('diagnostic_log')}")
    print(f"Internal consistency findings: {db.get_consistency_findings(TARGET_AUDIT_ID)}")

    refs = get_references_by_audit(TARGET_AUDIT_ID)
    print(f"\nTotal References Extracted: {len(refs)}")
    for r in refs[:5]:
        print(
            f"  [{r['id']}] {r.get('authors', '')[:30]} | {r.get('year', '')} | {r.get('title', '')[:50]} | Status: {r.get('authenticity_status')} ({r.get('authenticity_reason')})"
        )

    claims = get_claims_by_audit(TARGET_AUDIT_ID)
    print(f"\nTotal Claims Extracted: {len(claims)}")
    for c in claims[:10]:
        print(
            f"  Claim #{c['id'][-4:]} [Page {c.get('page_number')}] Marker: '{c.get('citation_marker')}' Ref: '{c.get('reference_id')}' MapStatus: {c.get('mapping_status')} (Method: {c.get('mapping_method')}, Conf: {c.get('mapping_confidence')})"
        )
        print(
            f"    Text: {c.get('claim_text')[:110]}... Verdict: {c.get('verdict')} (Conf: {c.get('confidence')})"
        )


if __name__ == "__main__":
    main()
