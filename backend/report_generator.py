"""Publication-grade PDF audit report generation (ReportLab).

The report is generated from the stored audit findings only. It explicitly
documents retrieval limitations and unresolved items rather than hiding them.
"""

import time
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

INK = colors.HexColor("#172522")
MUTED = colors.HexColor("#747B78")
BORDER = colors.HexColor("#E7E5DD")
COBALT = colors.HexColor("#4F5FEA")
PAPER = colors.HexColor("#F7F6F1")

VERDICT_COLORS = {
    "SUPPORTED": ("#ECFDF5", "#065F46"),
    "PARTIALLY_SUPPORTED": ("#FFFBEF", "#92400E"),
    "CONTRADICTED": ("#FEF2F2", "#991B1B"),
    "INSUFFICIENT_EVIDENCE": ("#F1F5F9", "#334155"),
    "UNVERIFIED": ("#EFF6FF", "#1E40AF"),
}
AUTH_COLORS = {
    "VERIFIED": ("#ECFDF5", "#065F46"),
    "POSSIBLE_MATCH": ("#FFFBEF", "#92400E"),
    "MISMATCH": ("#FEF2F2", "#991B1B"),
    "UNVERIFIED": ("#EFF6FF", "#1E40AF"),
    "RETRIEVAL_FAILED": ("#F5F3FF", "#5B21B6"),
}
VERDICT_LABEL = {
    "SUPPORTED": "Supported",
    "PARTIALLY_SUPPORTED": "Partially supported",
    "CONTRADICTED": "Contradicted",
    "INSUFFICIENT_EVIDENCE": "Insufficient evidence",
    "UNVERIFIED": "Unverified",
}
AUTH_LABEL = {
    "VERIFIED": "Verified",
    "POSSIBLE_MATCH": "Possible match",
    "MISMATCH": "Mismatch",
    "UNVERIFIED": "Unverified",
    "RETRIEVAL_FAILED": "Retrieval failed",
}
RETRIEVAL_LABEL = {
    "full_text": "Full text retrieved",
    "abstract_only": "Abstract only",
    "metadata_only": "Metadata only",
    "unavailable": "Source unavailable",
}


def _p(text: Any, style) -> Paragraph:
    return Paragraph(escape(str(text or "")), style)


def generate_pdf_report(
    audit: Dict[str, Any],
    claims: List[Dict[str, Any]],
    references: List[Dict[str, Any]],
    output_path: str,
):
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=34,
        bottomMargin=34,
        title="CiteVerify Audit Report",
        author="CiteVerify",
    )
    styles = getSampleStyleSheet()
    story: List[Any] = []

    brand = ParagraphStyle(
        "Brand", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=18,
        leading=22, textColor=INK,
    )
    meta_small = ParagraphStyle(
        "MetaSmall", parent=styles["Normal"], fontName="Helvetica", fontSize=8,
        leading=11, textColor=MUTED,
    )
    h2 = ParagraphStyle(
        "H2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12.5,
        leading=16, textColor=INK, spaceBefore=13, spaceAfter=5,
    )
    h3 = ParagraphStyle(
        "H3", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=9.5,
        leading=12, textColor=INK,
    )
    body = ParagraphStyle(
        "Body", parent=styles["Normal"], fontName="Helvetica", fontSize=8.4,
        leading=11.5, textColor=colors.HexColor("#2D3748"),
    )
    small = ParagraphStyle(
        "Small", parent=body, fontSize=7.6, leading=10.2,
    )
    claim_style = ParagraphStyle(
        "Claim", parent=styles["Normal"], fontName="Helvetica-Bold", fontSize=8.8,
        leading=12, textColor=colors.HexColor("#1A202C"),
    )
    evidence_style = ParagraphStyle(
        "Evidence", parent=styles["Normal"], fontName="Helvetica-Oblique",
        fontSize=7.8, leading=10.4, textColor=colors.HexColor("#334155"),
    )

    # 1. Brand header ------------------------------------------------------
    header = Table(
        [
            [
                Paragraph("CITEVERIFY", brand),
                Paragraph(
                    "Research Audit Report<br/>"
                    f"Generated {time.strftime('%d %b %Y, %H:%M UTC')}<br/>"
                    f"Audit ID: {escape(str(audit.get('id', '')))}",
                    meta_small,
                ),
            ]
        ],
        colWidths=[4.3 * inch, 3.2 * inch],
    )
    header.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (1, 0), (1, 0), "RIGHT"),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(header)
    story.append(Spacer(1, 6))
    story.append(
        HRFlowable(width="100%", thickness=1.4, color=COBALT, spaceBefore=2, spaceAfter=10)
    )
    story.append(
        Paragraph(
            "Don't just trust the citation. Verify the evidence.",
            ParagraphStyle(
                "Tag", parent=body, fontSize=8.6, textColor=MUTED, spaceAfter=10
            ),
        )
    )

    summary = audit.get("summary") or {}
    claim_stats = summary.get("claims") or {}
    ref_stats = summary.get("references") or {}
    retrieval_stats = summary.get("retrieval") or {}
    mapping_stats = summary.get("mapping") or {}
    demo_note = (
        "<br/><b>DEMO DATA:</b> this audit is the bundled demonstration dataset, "
        "not a real uploaded manuscript."
        if audit.get("is_demo")
        else ""
    )

    # 2. Document information ---------------------------------------------
    info_rows = [
        [
            Paragraph("<b>Target document</b>", body),
            _p(audit.get("title") or audit.get("filename") or "Untitled", claim_style),
        ],
        [Paragraph("<b>Authors</b>", body), _p(audit.get("authors") or "Unknown", body)],
        [Paragraph("<b>Affiliations</b>", body), _p("; ".join(audit.get("affiliations") or []) or "Not identified", body)],
        [Paragraph("<b>Corresponding author</b>", body), _p(audit.get("corresponding_author") or "Not identified", body)],
        [Paragraph("<b>Publication date</b>", body), _p(audit.get("publication_date") or "Not identified", body)],
        [
            Paragraph("<b>Publication record</b>", body),
            _p(
                " · ".join(
                    [
                        audit.get("journal") or "Journal not identified",
                        audit.get("year") or "year unknown",
                        f"DOI {audit['doi']}" if audit.get("doi") else "no DOI detected",
                    ]
                ),
                body,
            ),
        ],
        [
            Paragraph("<b>File</b>", body),
            _p(
                f"{audit.get('filename', '')} · {audit.get('total_pages', 1)} pages · "
                f"extracted with {audit.get('extraction_engine') or 'PDF parser'}",
                body,
            ),
        ],
        [
            Paragraph("<b>Audit date</b>", body),
            _p(audit.get("created_at", ""), body),
        ],
    ]
    info = Table(info_rows, colWidths=[1.5 * inch, 6.0 * inch])
    info.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PAPER),
                ("BOX", (0, 0), (-1, -1), 0.7, BORDER),
                ("INNERGRID", (0, 0), (-1, -1), 0.35, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    story.append(info)
    if demo_note:
        story.append(Paragraph(demo_note, small))

    # 3. Analysis summary --------------------------------------------------
    story.append(Paragraph("1 · Analysis summary", h2))
    total_claims = claim_stats.get("total", len(claims))
    total_refs = ref_stats.get("total", len(references))
    summary_rows = [
        ["Documents processed", "Total claims", "Claims mapped", "References checked"],
        [
            "1",
            str(total_claims),
            f"{mapping_stats.get('mapped', 0)} mapped · {mapping_stats.get('ambiguous', 0)} ambiguous · {mapping_stats.get('unmapped', 0)} unmapped",
            str(total_refs),
        ],
    ]
    summary_table = Table(summary_rows, colWidths=[1.6 * inch, 1.1 * inch, 3.1 * inch, 1.7 * inch])
    summary_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EFEFEA")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("TEXTCOLOR", (0, 0), (-1, -1), INK),
                ("GRID", (0, 0), (-1, -1), 0.4, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(summary_table)

    # Internal consistency is a separate assessment from external source evidence.
    consistency_findings = audit.get("consistency_findings") or []
    story.append(Paragraph("Internal document consistency", h2))
    story.append(Paragraph("These findings assess the manuscript's own reporting. They do not change citation authenticity or external claim-evidence verdicts.", small))
    if consistency_findings:
        for finding in consistency_findings:
            story.append(Paragraph(f"<b>{escape(str(finding.get('title', 'Consistency finding')))}</b> · {escape(str(finding.get('finding_type', '')).replace('_', ' '))}", body))
            story.append(Paragraph(escape(str(finding.get("explanation", ""))), small))
            if finding.get("calculation"):
                story.append(Paragraph(escape(str(finding["calculation"])), small))
            for evidence in finding.get("evidence", []):
                story.append(Paragraph(f"• {escape(str(evidence))}", small))
            story.append(Spacer(1, 4))
    else:
        story.append(Paragraph("No internal consistency findings were detected.", body))

    # 4. Claim verification statistics ------------------------------------
    story.append(Paragraph("2 · Claim verification", h2))
    claim_table_data = [["Verdict", "Claims", "Share"]]
    for key in ("supported", "partial", "contradicted", "insufficient", "unverified"):
        label_map = {
            "supported": "Supported",
            "partial": "Partially supported",
            "contradicted": "Contradicted",
            "insufficient": "Insufficient evidence",
            "unverified": "Unverified",
        }
        count = claim_stats.get(key, 0)
        pct = f"{(count / total_claims * 100):.0f}%" if total_claims else "—"
        claim_table_data.append([label_map[key], str(count), pct])
    claim_table = Table(claim_table_data, colWidths=[3.0 * inch, 1.0 * inch, 1.0 * inch])
    claim_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.35, BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 3.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(claim_table)
    story.append(Spacer(1, 4))
    story.append(
        Paragraph(
            "A verdict of <i>insufficient evidence</i> means the source could not be read "
            "in enough depth to decide; it is not a negative finding. A verdict of "
            "<i>unverified</i> means either no source was mapped or the reference itself "
            "could not be confirmed.",
            small,
        )
    )

    # 5. Reference authenticity -------------------------------------------
    story.append(Paragraph("3 · Reference authenticity", h2))
    ref_summary_rows = [
        ["Status", "References"],
        ["Verified", str(ref_stats.get("verified", 0))],
        ["Possible match", str(ref_stats.get("possible_match", 0))],
        ["Mismatch", str(ref_stats.get("mismatch", 0))],
        ["Unverified", str(ref_stats.get("unverified", 0))],
        ["Retrieval failed (technical)", str(ref_stats.get("retrieval_failed", 0))],
        ["Parsed but flagged for manual review", str(ref_stats.get("needs_review", 0))],
    ]
    ref_summary = Table(ref_summary_rows, colWidths=[3.2 * inch, 1.0 * inch])
    ref_summary.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.35, BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 3.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    story.append(ref_summary)

    # 6. Claim-by-claim findings ------------------------------------------
    story.append(PageBreak())
    story.append(Paragraph("4 · Claim-by-claim findings", h2))
    story.append(
        Paragraph(
            "Each finding records the exact claim wording, its mapped citation, the "
            "retrieved source material and the level of access CiteVerify achieved.",
            small,
        )
    )
    story.append(Spacer(1, 6))

    ref_map = {r["id"]: r for r in references}
    for idx, claim in enumerate(claims, start=1):
        verdict = claim.get("verdict", "UNVERIFIED")
        bg, fg = VERDICT_COLORS.get(verdict, ("#F1F5F9", "#334155"))
        ref = ref_map.get(claim.get("reference_id") or "", {})
        marker = claim.get("citation_marker") or "no citation detected"
        auth = ref.get("authenticity_status", "—")
        retrieval = RETRIEVAL_LABEL.get(claim.get("retrieval_level"), "Source unavailable")

        row_one = [
            Paragraph(
                f"<b>Claim {idx}</b> · Page {escape(str(claim.get('page_number', 1)))} · "
                f"Citation {escape(str(marker))} · Mapping "
                f"{escape(str(claim.get('mapping_status', 'UNMAPPED')))}",
                claim_style,
            ),
            Paragraph(
                f"<font color='{fg}'><b>{escape(VERDICT_LABEL.get(verdict, verdict))}</b></font>",
                small,
            ),
        ]
        detail = [
            Paragraph(f"&ldquo;{escape(str(claim.get('claim_text', '')))}&rdquo;", claim_style),
            "",
        ]
        evidence_lines = [
            f"<b>Finding:</b> {escape(str(claim.get('verdict_explanation', '')))}",
        ]
        if claim.get("evidence_passage"):
            evidence_lines.append(
                f"<b>Retrieved evidence ({escape(retrieval)}):</b> "
                f"<i>&ldquo;{escape(str(claim['evidence_passage'])[:900])}&rdquo;</i>"
            )
        if ref:
            evidence_lines.append(
                f"<b>Cited source:</b> {escape(str(ref.get('title', '') or ref.get('raw_citation', ''))[:220])} "
                f"({escape(str(ref.get('year', '')))}) · {escape(str(ref.get('journal', '')))}"
            )
            if ref.get("doi"):
                evidence_lines.append(
                    f"<b>DOI:</b> https://doi.org/{escape(str(ref['doi']))}"
                )
            elif ref.get("url"):
                evidence_lines.append(f"<b>Source:</b> {escape(str(ref['url'])[:200])}")
            evidence_lines.append(
                f"<b>Reference authenticity:</b> {escape(AUTH_LABEL.get(auth, str(auth)))} · "
                f"{escape(str(claim.get('evidence_source') or ref.get('matched_source') or 'n/a')[:180])}"
            )
        else:
            evidence_lines.append(
                "<b>Cited source:</b> none — no in-text citation could be mapped to this statement."
            )
        if claim.get("uncertainty_note"):
            evidence_lines.append(
                f"<b>Uncertainty:</b> {escape(str(claim['uncertainty_note']))}"
            )
        detail_two = [Paragraph("<br/>".join(evidence_lines), body), ""]

        table = Table([row_one, detail, detail_two], colWidths=[6.2 * inch, 1.3 * inch])
        table.setStyle(
            TableStyle(
                [
                    ("SPAN", (0, 1), (1, 1)),
                    ("SPAN", (0, 2), (1, 2)),
                    ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#F8FAFC")),
                    ("BACKGROUND", (1, 0), (1, 0), colors.HexColor(bg)),
                    ("BOX", (0, 0), (-1, -1), 0.7, BORDER),
                    ("LINEBELOW", (0, 0), (-1, 0), 0.4, BORDER),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ]
            )
        )
        story.append(KeepTogether([table, Spacer(1, 7)]))

    # 7. Reference metadata ledger ----------------------------------------
    story.append(PageBreak())
    story.append(Paragraph("5 · Reference metadata ledger", h2))
    story.append(
        Paragraph(
            "Cited metadata is compared against the record retrieved from Crossref, "
            "OpenAlex or Semantic Scholar.",
            small,
        )
    )
    story.append(Spacer(1, 5))

    ledger = [["Ref", "Cited work", "Status / access", "Registry record"]]
    for ref in references:
        auth = ref.get("authenticity_status", "UNVERIFIED")
        _bg, tc = AUTH_COLORS.get(auth, ("#F1F5F9", "#334155"))
        ledger.append(
            [
                Paragraph(f"<b>{escape(str(ref.get('id', '')))}</b>", small),
                Paragraph(
                    f"<b>{escape(str(ref.get('title', '') or ref.get('raw_citation', ''))[:200])}</b><br/>"
                    f"{escape(str(ref.get('authors', ''))[:160])} ({escape(str(ref.get('year', '')))}"
                    + (f") · {escape(str(ref.get('journal', '')))}" if ref.get("journal") else ")")
                    + (f"<br/>doi:{escape(str(ref['doi']))}" if ref.get("doi") else ""),
                    small,
                ),
                Paragraph(
                    f"<font color='{tc}'><b>{escape(AUTH_LABEL.get(auth, auth))}</b></font><br/>"
                    f"{escape(RETRIEVAL_LABEL.get(ref.get('retrieval_level'), 'Unavailable'))}",
                    small,
                ),
                Paragraph(
                    (escape(str(ref.get("matched_title", ""))[:160]) or "—")
                    + (
                        f"<br/>{escape(str(ref.get('matched_source', '')))}"
                        if ref.get("matched_source")
                        else ""
                    )
                    + (
                        f"<br/>{escape(str(ref.get('authenticity_reason', ''))[:150])}"
                        if ref.get("authenticity_reason")
                        else ""
                    ),
                    small,
                ),
            ]
        )
    ledger_table = Table(
        ledger, colWidths=[0.45 * inch, 2.7 * inch, 1.35 * inch, 3.0 * inch], repeatRows=1
    )
    ledger_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E2E8F0")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.35, BORDER),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    story.append(ledger_table)

    # 8. Unresolved items --------------------------------------------------
    unmapped = [c for c in claims if not c.get("reference_id")]
    failed = [
        r for r in references if r.get("authenticity_status") == "RETRIEVAL_FAILED"
    ]
    unverified_refs = [
        r for r in references if r.get("authenticity_status") == "UNVERIFIED"
    ]
    needs_review = [r for r in references if r.get("needs_review")]
    limitations: List[str] = list(summary.get("extraction_warnings") or [])
    diagnostics = summary.get("diagnostics") or audit.get("diagnostics") or {}
    limitations.extend(diagnostics.get("notes") or [])

    story.append(Paragraph("6 · Unresolved items and limitations", h2))
    unresolved_lines = [
        f"<b>{len(unmapped)}</b> claim(s) have no detectable in-text citation and could not be verified.",
        f"<b>{len(failed)}</b> reference(s) could not be checked because a scholarly service failed (technical, not evidence of fabrication).",
        f"<b>{len(unverified_refs)}</b> reference(s) could not be matched to a scholarly record.",
        f"<b>{len(needs_review)}</b> bibliography entry/entries were parsed with incomplete metadata.",
        f"Retrieval depth: {retrieval_stats.get('abstract_only', 0)} abstract only, "
        f"{retrieval_stats.get('metadata_only', 0)} metadata only, "
        f"{retrieval_stats.get('unavailable', 0)} unavailable, "
        f"{retrieval_stats.get('full_text', 0)} full text.",
    ]
    for line in unresolved_lines:
        story.append(Paragraph(f"• {line}", body))
    if limitations:
        story.append(Spacer(1, 5))
        story.append(Paragraph("<b>Extraction and retrieval notes</b>", h3))
        for note in dict.fromkeys(limitations):
            story.append(Paragraph(f"• {escape(str(note))}", small))

    # 9. Manual review recommendations ------------------------------------
    story.append(Paragraph("7 · Recommended manual review", h2))
    recommendations = []
    if any(c.get("verdict") == "CONTRADICTED" for c in claims):
        recommendations.append(
            "Claims marked <b>contradicted</b> should be read against the full source "
            "text before submission; the verdict is based on the retrieved abstract sentence."
        )
    if any(c.get("mapping_status") == "AMBIGUOUS" for c in claims):
        recommendations.append(
            "Several claims map to more than one or to a contextually inferred citation. "
            "Confirm the intended reference in the manuscript."
        )
    if unverified_refs:
        recommendations.append(
            "Unverified references may be unindexed, grey literature, or incorrectly "
            "cited. Check the original citation string against the publisher record."
        )
    if retrieval_stats.get("metadata_only") or retrieval_stats.get("unavailable"):
        recommendations.append(
            "For references available only as metadata, obtain the full text through your "
            "institution before relying on the corresponding claims."
        )
    if not recommendations:
        recommendations.append(
            "No claim-level contradictions or ambiguous mappings were detected. A human "
            "review of the evidence passages is still recommended."
        )
    for item in recommendations:
        story.append(Paragraph(f"• {item}", body))

    story.append(Spacer(1, 14))
    story.append(
        HRFlowable(width="100%", thickness=0.7, color=BORDER, spaceBefore=2, spaceAfter=8)
    )
    story.append(
        Paragraph(
            "<b>Methodological notice.</b> CiteVerify verifies bibliographic records against "
            "Crossref, OpenAlex and Semantic Scholar and compares claims with retrieved "
            "abstracts or open-access text. It never fabricates quotations, citations or "
            "verdicts. A missing DOI, an unreachable API or an unavailable source is "
            "reported as such and is never treated as proof that a publication is fake or "
            "that a claim is contradicted. Verdicts are decision support, not peer review.",
            meta_small,
        )
    )

    doc.build(story)
    return output_path
