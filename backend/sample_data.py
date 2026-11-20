import os
import time
from typing import Any, Dict, List
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

SAMPLE_AUDIT_ID = "audit-sample-biomed-ai"


def create_sample_paper_pdf(output_path: str):
    """Generates a genuine sample research paper PDF for testing and demonstration."""
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54,
    )
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "PaperTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        alignment=1,  # Center
        spaceAfter=12,
    )

    authors_style = ParagraphStyle(
        "PaperAuthors",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        alignment=1,
        textColor=colors.HexColor("#4A5568"),
        spaceAfter=18,
    )

    abstract_heading = ParagraphStyle(
        "AbstractHead",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        alignment=1,
        spaceAfter=6,
    )

    abstract_body = ParagraphStyle(
        "AbstractBody",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=9.5,
        leading=14,
        leftIndent=24,
        rightIndent=24,
        spaceAfter=20,
    )

    h1_style = ParagraphStyle(
        "Heading1Style",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        spaceBefore=14,
        spaceAfter=6,
    )

    body_style = ParagraphStyle(
        "BodyStyle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=15,
        spaceAfter=10,
    )

    story = []

    # Title & Authors
    story.append(
        Paragraph(
            "Empirical Evaluation of Generative AI Hallucinations in"
            " Biomedicine and Academic Citations",
            title_style,
        )
    )
    story.append(
        Paragraph(
            "Elena Rostova, Ph.D.<sup>1,2</sup>, Marcus Vance,"
            " M.D.<sup>1</sup>, and Devina Thorne, M.Sc.<sup>3</sup><br/>"
            "<sup>1</sup>Institute for Clinical Informatics &bull;"
            " <sup>2</sup>Department of Computational Biology &bull;"
            " <sup>3</sup>Center for Meta-Research",
            authors_style,
        )
    )

    # Abstract
    story.append(Paragraph("ABSTRACT", abstract_heading))
    story.append(
        Paragraph(
            "Large language models (LLMs) are increasingly utilized to draft scientific reviews and clinical summaries. "
            "However, unverified references and non-existent empirical claims present severe risks to scientific integrity. "
            "In this investigation, we analyze citation fidelity across 1,200 automated biomedical reviews. We evaluate reference existence, "
            "bibliographic agreement, and semantic claim support against primary literature. Our findings demonstrate that 28.4% of generated "
            "citations do not exist in Crossref or OpenAlex indices, and 14.2% of citations attribute conclusions directly contrary to the cited study's findings.",
            abstract_body,
        )
    )

    # Section 1: Introduction
    story.append(Paragraph("1. Introduction and Background", h1_style))
    story.append(
        Paragraph(
            "The rapid adoption of artificial intelligence in scientific communication has intensified concerns regarding scholarly rigor. "
            "Prior investigations demonstrated that LLMs frequently construct persuasive but fabricated citations [1]. "
            "Such 'hallucinated references' often mimic authentic journal naming conventions, authentic DOI prefixes, and reputable author names [2]. "
            "Consequently, peer reviewers and domain specialists expend substantial manual effort attempting to verify claims that possess no factual basis in literature.",
            body_style,
        )
    )

    # Section 2: Results & Claims
    story.append(Paragraph("2. Results & Empirical Analysis", h1_style))
    story.append(
        Paragraph(
            "In automated diagnostic benchmarking, foundational models achieved an average sensitivity of 94.2% across clinical vignettes [3]. "
            "However, when asked to provide original epidemiological citations, models produced statistically inflated effect sizes in 41% of tested summaries [4]. "
            "Furthermore, early trials in oncology literature suggested that neural semantic search models consistently reduce false citation mapping to zero [5]. "
            "Finally, retrospective cohort comparisons revealed a significant 34% reduction in literature synthesis time when structured reference auditing protocols were deployed [6].",
            body_style,
        )
    )

    # Section 3: References
    story.append(Paragraph("References", h1_style))
    references = [
        (
            "[1] Ji, Z., Lee, N., Frieske, R., et al. (2023). Survey of"
            " hallucination in natural language generation. ACM Computing"
            " Surveys, 55(12), 1-38. https://doi.org/10.1145/3571730"
        ),
        (
            "[2] Walters, W. H. (2023). The fake citation epidemic in"
            " AI-assisted academic writing. Scientific Information Review,"
            " 44(2), 112-124."
        ),
        (
            "[3] Rajpurkar, P., Chen, E., Banerjee, O., & Topol, E. J. (2022)."
            " AI in health and medicine. Nature Medicine, 28(1), 31-38."
            " https://doi.org/10.1038/s41591-021-01614-0"
        ),
        (
            "[4] Athaley, S. R., & Morris, K. (2021). Spurious statistical"
            " precision in biomedical meta-reviews. Journal of Clinical"
            " Epidemiology, 138, 45-56."
        ),
        (
            "[5] Kensington, B., & Dupont, H. (2024). Elimination of citation"
            " mapping errors using multi-agent semantic cross-verification."
            " Neural Systems Letters, 19, 88-94."
        ),
        (
            "[6] Beller, E. M., Chen, J. K., Wang, U. L., & Glasziou, P. P."
            " (2018). Are systematic reviews becoming more efficient? A"
            " prospective cohort study of review production timelines."
            " Systematic Reviews, 7(1), 22. https://doi.org/10.1186/s13643-018-0683-1"
        ),
    ]

    for ref in references:
        story.append(Paragraph(ref, body_style))

    doc.build(story)
    return output_path


def get_sample_audit_data() -> Dict[str, Any]:
    """Provides complete, verified sample audit findings reflecting real-world nuances."""
    audit = {
        "id": SAMPLE_AUDIT_ID,
        "filename": "evaluation_of_genai_hallucinations_biomed.pdf",
        "title": (
            "Empirical Evaluation of Generative AI Hallucinations in"
            " Biomedicine and Academic Citations"
        ),
        "authors": "Elena Rostova, Ph.D., Marcus Vance, M.D., Devina Thorne, M.Sc.",
        "abstract": (
            "Large language models (LLMs) are increasingly utilized to draft"
            " scientific reviews and clinical summaries. However, unverified"
            " references and non-existent empirical claims present severe risks"
            " to scientific integrity. In this investigation, we analyze"
            " citation fidelity across 1,200 automated biomedical reviews."
            " Our findings demonstrate that 28.4% of generated citations do not"
            " exist in Crossref or OpenAlex indices, and 14.2% of citations"
            " attribute conclusions directly contrary to the cited study's"
            " findings."
        ),
        "total_pages": 3,
        "status": "completed",
        "current_step": 11,
        "total_steps": 11,
        "is_demo": 1,
        "step_message": "Audit completed. Report generated.",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pdf_path": "uploads/sample_paper.pdf",
        "summary": {
            "claims": {
                "total": 6,
                "supported": 2,
                "partial": 1,
                "contradicted": 1,
                "insufficient": 1,
                "unverified": 1,
            },
            "references": {
                "total": 6,
                "verified": 3,
                "possible_match": 1,
                "mismatch": 1,
                "unverified": 1,
                "retrieval_failed": 0,
            },
            "retrieval": {
                "full_text": 1,
                "abstract_only": 3,
                "metadata_only": 1,
                "unavailable": 1,
            },
        },
    }

    references = [
        {
            "id": "ref-1",
            "audit_id": SAMPLE_AUDIT_ID,
            "raw_citation": (
                "[1] Ji, Z., Lee, N., Frieske, R., et al. (2023). Survey of"
                " hallucination in natural language generation. ACM Computing"
                " Surveys, 55(12), 1-38. https://doi.org/10.1145/3571730"
            ),
            "title": (
                "Survey of Hallucination in Natural Language Generation"
            ),
            "authors": "Ji, Ziwei; Lee, Nayeon; Frieske, Rita; et al.",
            "year": "2023",
            "journal": "ACM Computing Surveys",
            "doi": "10.1145/3571730",
            "authenticity_status": "VERIFIED",
            "authenticity_reason": (
                "Confirmed match in OpenAlex and Crossref index (title match:"
                " 100%, DOI confirmed)."
            ),
            "matched_title": (
                "Survey of Hallucination in Natural Language Generation"
            ),
            "matched_authors": "Ziwei Ji, Nayeon Lee, Rita Frieske",
            "matched_year": "2023",
            "matched_source": "OpenAlex",
            "url": "https://doi.org/10.1145/3571730",
            "retrieval_level": "full_text",
            "abstract": (
                "Natural language generation (NLG) has experienced rapid"
                " advancement. However, a prominent challenge is hallucination,"
                " where the generated content is nonsensical or unfaithful to"
                " the provided source input. In this comprehensive survey, we"
                " categorize metrics, detection strategies, and quantify the"
                " widespread phenomenon of fabricated citations and"
                " unfaithful statements across generative architectures."
            ),
        },
        {
            "id": "ref-2",
            "audit_id": SAMPLE_AUDIT_ID,
            "raw_citation": (
                "[2] Walters, W. H. (2023). The fake citation epidemic in"
                " AI-assisted academic writing. Scientific Information Review,"
                " 44(2), 112-124."
            ),
            "title": (
                "The fake citation epidemic in AI-assisted academic writing"
            ),
            "authors": "Walters, W. H.",
            "year": "2023",
            "journal": "Scientific Information Review",
            "doi": "",
            "authenticity_status": "UNVERIFIED",
            "authenticity_reason": (
                "No indexing record matching this title or journal volume was"
                " found in Crossref, OpenAlex, or PubMed. Journal 'Scientific"
                " Information Review' appears to be non-existent or"
                " misidentified."
            ),
            "matched_title": None,
            "matched_authors": None,
            "matched_year": None,
            "matched_source": None,
            "url": None,
            "retrieval_level": "unavailable",
            "abstract": "",
        },
        {
            "id": "ref-3",
            "audit_id": SAMPLE_AUDIT_ID,
            "raw_citation": (
                "[3] Rajpurkar, P., Chen, E., Banerjee, O., & Topol, E. J."
                " (2022). AI in health and medicine. Nature Medicine, 28(1),"
                " 31-38. https://doi.org/10.1038/s41591-021-01614-0"
            ),
            "title": "AI in health and medicine",
            "authors": "Rajpurkar, Pranav; Chen, Emma; Banerjee, Oishi; Topol, Eric J.",
            "year": "2022",
            "journal": "Nature Medicine",
            "doi": "10.1038/s41591-021-01614-0",
            "authenticity_status": "VERIFIED",
            "authenticity_reason": (
                "Confirmed match in Crossref and OpenAlex. High-impact landmark"
                " review."
            ),
            "matched_title": "AI in health and medicine",
            "matched_authors": (
                "Pranav Rajpurkar, Emma Chen, Oishi Banerjee, Eric J. Topol"
            ),
            "matched_year": "2022",
            "matched_source": "Crossref",
            "url": "https://doi.org/10.1038/s41591-021-01614-0",
            "retrieval_level": "abstract_only",
            "abstract": (
                "Artificial intelligence (AI) has made notable advances in"
                " health and medicine. Here, we discuss opportunities for"
                " multimodal AI to assist diagnostic decision-making, patient"
                " monitoring, and clinical workflows, while emphasizing that"
                " retrospective vignette diagnostic sensitivity often diverges"
                " in prospective randomized trials."
            ),
        },
        {
            "id": "ref-4",
            "audit_id": SAMPLE_AUDIT_ID,
            "raw_citation": (
                "[4] Athaley, S. R., & Morris, K. (2021). Spurious statistical"
                " precision in biomedical meta-reviews. Journal of Clinical"
                " Epidemiology, 138, 45-56."
            ),
            "title": (
                "Spurious statistical precision in biomedical meta-reviews"
            ),
            "authors": "Athaley, S. R.; Morris, K.",
            "year": "2021",
            "journal": "Journal of Clinical Epidemiology",
            "doi": "10.1016/j.jclinepi.2021.05.012",
            "authenticity_status": "POSSIBLE_MATCH",
            "authenticity_reason": (
                "Title and authors match close publication in Journal of"
                " Clinical Epidemiology; publication year in registry shows"
                " 2021 online first vs 2022 volume print."
            ),
            "matched_title": (
                "Spurious Statistical Precision in Evidence Synthesis"
            ),
            "matched_authors": "Athaley, S.; Morris, K.",
            "matched_year": "2022",
            "matched_source": "OpenAlex",
            "url": "https://doi.org/10.1016/j.jclinepi.2021.05.012",
            "retrieval_level": "metadata_only",
            "abstract": "",
        },
        {
            "id": "ref-5",
            "audit_id": SAMPLE_AUDIT_ID,
            "raw_citation": (
                "[5] Kensington, B., & Dupont, H. (2024). Elimination of"
                " citation mapping errors using multi-agent semantic"
                " cross-verification. Neural Systems Letters, 19, 88-94."
            ),
            "title": (
                "Elimination of citation mapping errors using multi-agent"
                " semantic cross-verification"
            ),
            "authors": "Kensington, B.; Dupont, H.",
            "year": "2024",
            "journal": "Neural Systems Letters",
            "doi": "",
            "authenticity_status": "MISMATCH",
            "authenticity_reason": (
                "Retrieved publication under this author pairing in Neural"
                " Systems Letters actually addressed 'Energy optimization in"
                " neuromorphic spiking arrays', showing a severe citation"
                " mismatch."
            ),
            "matched_title": (
                "Energy optimization in neuromorphic spiking arrays"
            ),
            "matched_authors": "B. Kensington, H. Dupont",
            "matched_year": "2024",
            "matched_source": "Crossref",
            "url": "https://doi.org/10.1016/j.neunet.2024.01.002",
            "retrieval_level": "abstract_only",
            "abstract": (
                "We investigate energy efficiency across neuromorphic hardware"
                " architectures. We show that multi-agent routing does not"
                " eliminate synchronization latency or error propagation"
                " across distributed networks."
            ),
        },
        {
            "id": "ref-6",
            "audit_id": SAMPLE_AUDIT_ID,
            "raw_citation": (
                "[6] Beller, E. M., Chen, J. K., Wang, U. L., & Glasziou, P. P."
                " (2018). Are systematic reviews becoming more efficient? A"
                " prospective cohort study of review production timelines."
                " Systematic Reviews, 7(1), 22."
                " https://doi.org/10.1186/s13643-018-0683-1"
            ),
            "title": (
                "Are systematic reviews becoming more efficient? A prospective"
                " cohort study of review production timelines"
            ),
            "authors": "Beller, Elaine M.; Chen, J.; Glasziou, Paul P.",
            "year": "2018",
            "journal": "Systematic Reviews",
            "doi": "10.1186/s13643-018-0683-1",
            "authenticity_status": "VERIFIED",
            "authenticity_reason": (
                "Exact record verified in OpenAlex and Crossref databases."
            ),
            "matched_title": (
                "Are systematic reviews becoming more efficient? A prospective"
                " cohort study of review production timelines"
            ),
            "matched_authors": (
                "Elaine M. Beller, Justin K. Chen, Paul P. Glasziou"
            ),
            "matched_year": "2018",
            "matched_source": "OpenAlex",
            "url": "https://doi.org/10.1186/s13643-018-0683-1",
            "retrieval_level": "abstract_only",
            "abstract": (
                "Background: Systematic reviews are considered the cornerstone"
                " of evidence-based health care. However, producing them is"
                " time-consuming. We followed 24 review teams and found that"
                " structured reference protocols reduced title-screening"
                " duration by approximately 30-35%."
            ),
        },
    ]

    claims = [
        {
            "id": "claim-1",
            "audit_id": SAMPLE_AUDIT_ID,
            "claim_text": (
                "Prior investigations demonstrated that LLMs frequently"
                " construct persuasive but fabricated citations [1]."
            ),
            "page_number": 1,
            "context": (
                "The rapid adoption of artificial intelligence in scientific"
                " communication has intensified concerns regarding scholarly"
                " rigor. Prior investigations demonstrated that LLMs frequently"
                " construct persuasive but fabricated citations [1]. Such"
                " 'hallucinated references' often mimic authentic journal"
                " naming conventions."
            ),
            "citation_marker": "[1]",
            "reference_id": "ref-1",
            "claim_type": "scientific",
            "confidence": 0.96,
            "mapping_status": "mapped",
            "verdict": "SUPPORTED",
            "verdict_explanation": (
                "The cited paper by Ji et al. (2023) in ACM Computing Surveys"
                " directly analyzes and quantifies citation hallucination"
                " rates across foundational language models."
            ),
            "evidence_passage": (
                "In this comprehensive survey, we categorize metrics, detection"
                " strategies, and quantify the widespread phenomenon of"
                " fabricated citations and unfaithful statements across"
                " generative architectures."
            ),
            "retrieval_level": "full_text",
            "uncertainty_note": (
                "Verified against full survey text with high empirical"
                " consistency."
            ),
            "bounding_box": {
                "x": 54,
                "y": 280,
                "width": 504,
                "height": 28,
            },
        },
        {
            "id": "claim-2",
            "audit_id": SAMPLE_AUDIT_ID,
            "claim_text": (
                "Such 'hallucinated references' often mimic authentic journal"
                " naming conventions, authentic DOI prefixes, and reputable"
                " author names [2]."
            ),
            "page_number": 1,
            "context": (
                "Prior investigations demonstrated that LLMs frequently"
                " construct persuasive but fabricated citations [1]. Such"
                " 'hallucinated references' often mimic authentic journal"
                " naming conventions, authentic DOI prefixes, and reputable"
                " author names [2]. Consequently, peer reviewers and domain"
                " specialists expend substantial manual effort."
            ),
            "citation_marker": "[2]",
            "reference_id": "ref-2",
            "claim_type": "factual",
            "confidence": 0.91,
            "mapping_status": "mapped",
            "verdict": "UNVERIFIED",
            "verdict_explanation": (
                "The cited publication ('Walters, W. H. (2023)') could not be"
                " located in Crossref, OpenAlex, or PubMed records. The journal"
                " title appears fictitious. Evidence cannot be verified against"
                " an unauthenticated source."
            ),
            "evidence_passage": (
                "No authoritative indexing record exists for this publication."
            ),
            "retrieval_level": "unavailable",
            "uncertainty_note": (
                "High risk: The reference cited to support this claim may"
                " itself be an AI hallucination."
            ),
            "bounding_box": {
                "x": 54,
                "y": 312,
                "width": 504,
                "height": 30,
            },
        },
        {
            "id": "claim-3",
            "audit_id": SAMPLE_AUDIT_ID,
            "claim_text": (
                "In automated diagnostic benchmarking, foundational models"
                " achieved an average sensitivity of 94.2% across clinical"
                " vignettes [3]."
            ),
            "page_number": 2,
            "context": (
                "In automated diagnostic benchmarking, foundational models"
                " achieved an average sensitivity of 94.2% across clinical"
                " vignettes [3]. However, when asked to provide original"
                " epidemiological citations, models produced statistically"
                " inflated effect sizes in 41% of tested summaries [4]."
            ),
            "citation_marker": "[3]",
            "reference_id": "ref-3",
            "claim_type": "statistical",
            "confidence": 0.88,
            "mapping_status": "mapped",
            "verdict": "PARTIALLY_SUPPORTED",
            "verdict_explanation": (
                "Rajpurkar et al. (Nature Medicine 2022) discuss high"
                " retrospective diagnostic sensitivity metrics in AI models,"
                " but caution that vignette benchmarks do not generalize"
                " uniformly to prospective clinical deployments."
            ),
            "evidence_passage": (
                "Here, we discuss opportunities for multimodal AI to assist"
                " diagnostic decision-making... while emphasizing that"
                " retrospective vignette diagnostic sensitivity often diverges"
                " in prospective randomized trials."
            ),
            "retrieval_level": "abstract_only",
            "uncertainty_note": (
                "Qualified support: The paper reports benchmark successes but"
                " contextualizes the 94% figure with significant real-world"
                " caveats not mentioned in the author's claim."
            ),
            "bounding_box": {
                "x": 54,
                "y": 140,
                "width": 504,
                "height": 28,
            },
        },
        {
            "id": "claim-4",
            "audit_id": SAMPLE_AUDIT_ID,
            "claim_text": (
                "However, when asked to provide original epidemiological"
                " citations, models produced statistically inflated effect"
                " sizes in 41% of tested summaries [4]."
            ),
            "page_number": 2,
            "context": (
                "In automated diagnostic benchmarking, foundational models"
                " achieved an average sensitivity of 94.2% across clinical"
                " vignettes [3]. However, when asked to provide original"
                " epidemiological citations, models produced statistically"
                " inflated effect sizes in 41% of tested summaries [4]."
                " Furthermore, early trials in oncology literature suggested"
                " that neural semantic search models consistently reduce false"
                " citation mapping to zero [5]."
            ),
            "citation_marker": "[4]",
            "reference_id": "ref-4",
            "claim_type": "statistical",
            "confidence": 0.84,
            "mapping_status": "mapped",
            "verdict": "INSUFFICIENT_EVIDENCE",
            "verdict_explanation": (
                "The cited publication ('Spurious Statistical Precision in"
                " Evidence Synthesis', 2022) is indexed in OpenAlex, but"
                " open-access abstract and full text were restricted behind"
                " publisher access. The specific 41% statistic cannot be"
                " verified without subscription access."
            ),
            "evidence_passage": (
                "Publication metadata confirmed (DOI:"
                " 10.1016/j.jclinepi.2021.05.012). Full text not accessible"
                " via open repositories."
            ),
            "retrieval_level": "metadata_only",
            "uncertainty_note": (
                "Paywall restriction prevents definitive verification of"
                " effect-size percentages."
            ),
            "bounding_box": {
                "x": 54,
                "y": 172,
                "width": 504,
                "height": 32,
            },
        },
        {
            "id": "claim-5",
            "audit_id": SAMPLE_AUDIT_ID,
            "claim_text": (
                "Furthermore, early trials in oncology literature suggested"
                " that neural semantic search models consistently reduce false"
                " citation mapping to zero [5]."
            ),
            "page_number": 2,
            "context": (
                "Furthermore, early trials in oncology literature suggested"
                " that neural semantic search models consistently reduce false"
                " citation mapping to zero [5]. Finally, retrospective cohort"
                " comparisons revealed a significant 34% reduction in"
                " literature synthesis time."
            ),
            "citation_marker": "[5]",
            "reference_id": "ref-5",
            "claim_type": "finding",
            "confidence": 0.89,
            "mapping_status": "mapped",
            "verdict": "CONTRADICTED",
            "verdict_explanation": (
                "Direct contradiction: The paper cited does not discuss"
                " oncology or citation mapping, and the actual authors"
                " explicitly concluded that multi-agent routing 'does not"
                " eliminate synchronization latency or error propagation'."
            ),
            "evidence_passage": (
                "We show that multi-agent routing does not eliminate"
                " synchronization latency or error propagation across"
                " distributed networks."
            ),
            "retrieval_level": "abstract_only",
            "uncertainty_note": (
                "High confidence of misattribution: The cited publication"
                " directly disputes the assertion of zero mapping errors."
            ),
            "bounding_box": {
                "x": 54,
                "y": 210,
                "width": 504,
                "height": 30,
            },
        },
        {
            "id": "claim-6",
            "audit_id": SAMPLE_AUDIT_ID,
            "claim_text": (
                "Finally, retrospective cohort comparisons revealed a"
                " significant 34% reduction in literature synthesis time when"
                " structured reference auditing protocols were deployed [6]."
            ),
            "page_number": 2,
            "context": (
                "Furthermore, early trials in oncology literature suggested"
                " that neural semantic search models consistently reduce false"
                " citation mapping to zero [5]. Finally, retrospective cohort"
                " comparisons revealed a significant 34% reduction in"
                " literature synthesis time when structured reference auditing"
                " protocols were deployed [6]."
            ),
            "citation_marker": "[6]",
            "reference_id": "ref-6",
            "claim_type": "quantitative",
            "confidence": 0.94,
            "mapping_status": "mapped",
            "verdict": "SUPPORTED",
            "verdict_explanation": (
                "Beller et al. (Systematic Reviews 2018) prospectively"
                " evaluated 24 review teams and reported that structured"
                " reference protocols reduced screening time by approximately"
                " 30-35%."
            ),
            "evidence_passage": (
                "We followed 24 review teams and found that structured"
                " reference protocols reduced title-screening duration by"
                " approximately 30-35%."
            ),
            "retrieval_level": "abstract_only",
            "uncertainty_note": (
                "Corroborated by prospective cohort data in primary source."
            ),
            "bounding_box": {
                "x": 54,
                "y": 244,
                "width": 504,
                "height": 32,
            },
        },
    ]

    return {"audit": audit, "references": references, "claims": claims}
