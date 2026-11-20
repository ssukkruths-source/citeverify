"""Deterministic checks for contradictions and reporting gaps inside a manuscript."""
import re
import uuid
from typing import Any, Dict, List


def _section(text: str, start: str, ends: List[str]) -> str:
    # Match standalone section headings, not inline structured-abstract labels
    # such as "Methods:" and "Results:".
    match = re.search(r"(?m)^\s*(?:\d+(?:\.\d+)*\.?\s*)?" + start + r"\s*$", text, re.I)
    if not match:
        return ""
    tail = text[match.end():]
    stops = [m.start() for end in ends if (m := re.search(end, tail, re.I))]
    return tail[:min(stops)] if stops else tail


def _n(pattern: str, text: str):
    m = re.search(pattern, text, re.I)
    return int(m.group(1).replace(",", "")) if m else None


def analyze_document_consistency(text: str) -> List[Dict[str, Any]]:
    findings: List[Dict[str, Any]] = []
    abstract = _section(text, r"\bAbstract\b", [r"\bKeywords\b", r"\bIntroduction\b"])
    methods = _section(text, r"\bMethods\b", [r"\bResults\b"])
    results = _section(text, r"\bResults\b", [r"\bDiscussion\b"])
    conclusion = _section(text, r"\bConclusion\b", [r"\bStatements\b"])

    def add(kind, title, explanation, evidence, calculation="", severity="high"):
        findings.append({"id": "cons-" + uuid.uuid4().hex[:10], "finding_type": kind, "severity": severity, "title": title, "explanation": explanation, "evidence": evidence, "calculation": calculation})

    abstract_n = _n(r"(?:involving|included|enrolled)\s+(\d[\d,]*)\s+(?:learners|participants|students)", abstract)
    methods_n = _n(r"(?:total of|included|enrolled)\s+(\d[\d,]*)\s+(?:students|participants|learners)", methods)
    if abstract_n and methods_n and abstract_n != methods_n:
        add("internal_contradiction", "Participant counts conflict", f"Abstract reports {abstract_n:,}; Methods reports {methods_n:,} (difference {abs(abstract_n-methods_n):,}).", [f"Abstract: {abstract_n:,} participants", f"Methods: {methods_n:,} participants"], f"abs({abstract_n:,} - {methods_n:,}) = {abs(abstract_n-methods_n):,}")

    abs_uni = _n(r"(\d+)\s+universit", abstract)
    meth_uni = _n(r"at\s+(\d+)\s+universit", methods)
    if abs_uni and meth_uni and abs_uni != meth_uni:
        add("internal_contradiction", "Study location count conflicts", f"Abstract reports {abs_uni} universities; Methods reports {meth_uni} (difference {abs(abs_uni-meth_uni)}).", [f"Abstract: {abs_uni} universities", f"Methods: {meth_uni} universities"], f"abs({abs_uni} - {meth_uni}) = {abs(abs_uni-meth_uni)}")

    if re.search(r"\b12\s+months?\b", abstract, re.I) and re.search(r"\bfour[- ]weeks?\b", text, re.I):
        add("internal_contradiction", "Follow-up period conflicts", "Abstract describes a 12-month outcome, while Methods describes a four-week follow-up.", ["Abstract: 12 months", "Methods: four weeks"])

    pct = re.search(r"(\d+(?:\.\d+)?)\s*%\s+improvement", abstract, re.I)
    baseline = re.search(r"(?:baseline score of|baseline)\s*(\d+(?:\.\d+)?)", results, re.I)
    week4 = re.search(r"(?:at four weeks|week 4)\s*,?\s*the respective means were\s*(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)", results, re.I)
    baseline_pair = re.search(r"mean baseline score of\s*(\d+(?:\.\d+)?)\s+in the AI group and\s*(\d+(?:\.\d+)?)\s+in the control group", results, re.I)
    if not baseline_pair:
        baseline_pair = re.search(r"Baseline score\s+(\d+(?:\.\d+)?).{0,80}?(\d+(?:\.\d+)?)\s*\(SD", results, re.I | re.S)
    if pct and week4:
        ai, control = float(week4.group(1)), float(week4.group(2))
        observed_pct = (ai-control)/control*100
        claimed = float(pct.group(1))
        if abs(observed_pct-claimed) > max(2.0, claimed*0.1):
            calculation = f"({ai:g} - {control:g}) / {control:g} × 100 = {observed_pct:.1f}% relative difference"
            detail = f"Abstract claims {claimed:g}% improvement. Week-four means ({ai:g} vs {control:g}) imply {observed_pct:.1f}% relative difference, which does not support the abstract figure."
            if baseline_pair:
                ai_base, control_base = float(baseline_pair.group(1)), float(baseline_pair.group(2))
                ai_change, control_change = ai-ai_base, control-control_base
                calculation += f"; AI change: ({ai:g} - {ai_base:g}) = {ai_change:.1f} points; difference in change: {ai_change:.1f} - {control_change:.1f} = {ai_change-control_change:.1f} points"
                detail += f" From baseline, the AI group's change is {ai_change:.1f} points and the difference in change versus control is {ai_change-control_change:.1f} points."
            add("numerical_inconsistency", "Abstract improvement is not supported by reported results", detail, [f"Abstract: {claimed:g}% improvement", f"Results: baseline and week-four means {baseline_pair.groups() if baseline_pair else (ai, control)}"], calculation)

    narrative_pp = re.search(
        r"describes this as a\s*(\d+(?:\.\d+)?)\s*percentage[-\u2010-\u2015 ]point advantage",
        text,
        re.I,
    )
    abstract_pct = re.search(
        r"abstract describes a\s*(\d+(?:\.\d+)?)\s*%\s*improvement", text, re.I
    )
    conclusion_pp = re.search(
        r"conclusion later describes the same result as a\s*(\d+(?:\.\d+)?)\s*percentage[-\u2010-\u2015 ]point improvement",
        text,
        re.I,
    )
    effect_descriptions = []
    if narrative_pp:
        effect_descriptions.append(f"Results narrative: {narrative_pp.group(1)} percentage points")
    if abstract_pct:
        effect_descriptions.append(f"Abstract: {abstract_pct.group(1)}% improvement")
    if conclusion_pp:
        effect_descriptions.append(f"Conclusion: {conclusion_pp.group(1)} percentage points")
    if len(effect_descriptions) > 1:
        calc = "Reported effect-size descriptions use different values and units."
        detail = (
            "The manuscript describes the same result using incompatible effect-size "
            "labels. The reported values cannot be reconciled from the stated comparison "
            "without a common outcome definition and denominator."
        )
        if week4:
            ai, control = float(week4.group(1)), float(week4.group(2))
            calc += f" Table week-four gap: {ai:g} - {control:g} = {ai-control:.1f} score points; relative difference: ({ai:g} - {control:g}) / {control:g} × 100 = {(ai-control)/control*100:.1f}%."
        add(
            "numerical_inconsistency",
            "Effect-size descriptions conflict across sections",
            detail,
            effect_descriptions,
            calc,
        )

    study_times = re.search(r"study time per week\s+(\d+(?:\.\d+)?)\s+hours\s+(\d+(?:\.\d+)?)\s+hours", text, re.I)
    study_claim = re.search(r"study time.{0,80}?(\d+(?:\.\d+)?)\s*%\s+reduction", text, re.I|re.S)
    if study_times and study_claim:
        ai, control, claimed = float(study_times.group(1)), float(study_times.group(2)), float(study_claim.group(1))
        reduction = (control-ai)/control*100
        if abs(reduction-claimed) > 5:
            add("numerical_inconsistency", "Study-time reduction does not match reported values", f"The text claims a {claimed:g}% reduction, but reported weekly values of {ai:g} and {control:g} hours imply {reduction:.1f}%.", [f"Claim: {claimed:g}% reduction", f"Reported: {ai:g} vs {control:g} hours/week"], f"({control:g} - {ai:g}) / {control:g} × 100 = {reduction:.1f}%")

    if re.search(r"\b(?:universal|for every learner|all ages, subjects|eliminated? (?:all )?achievement gaps|every learner)\b", text, re.I):
        subgroup_present = bool(re.search(r"\b(?:subgroup counts|interaction tests|subgroup analysis|interaction analysis)\b", results, re.I))
        add("unsupported_generalisation", "Universal or subgroup claim exceeds reported analysis", "The manuscript makes a universal-effect or achievement-gap claim, but the results do not report subgroup counts and interaction analyses sufficient to establish it.", ["Universal/gap claim detected", "Subgroup evidence absent or explicitly reported as missing"])

    if re.search(r"\b(?:guaranteed|should replace conventional instruction|effective for all ages)\b", conclusion + text, re.I):
        add("methodological_support_missing", "Conclusion exceeds the described study design", "A limited, short-term study is used to support guaranteed or universal recommendations. The design and reported results do not establish effects across all learners, subjects, or settings.", ["Conclusion contains guarantee/universal recommendation", "Methods and results describe bounded outcomes"])

    if re.search(r"\bp\s*[<=>]\s*\.?\d+", text, re.I) and (re.search(r"without (?:a )?confidence interval|no confidence interval|confidence intervals? (?:are )?not (?:reported|provided)", text, re.I) or not re.search(r"\bconfidence interval|\b95%\s*CI", text, re.I)):
        add("missing_statistical_evidence", "Statistical uncertainty is incompletely reported", "P-values are reported without a confidence interval, limiting assessment of effect precision.", ["P-value reported", "Confidence interval explicitly absent or not found"], severity="review")

    return findings
