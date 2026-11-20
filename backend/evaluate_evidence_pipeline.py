"""Evaluate the production evidence policy on SciFact's official dev split.

This uses only the held-out development data for evaluation. It does not fit or
modify the production pipeline. SciFact is CC BY-NC 2.0; see data/scifact/NOTICE.md.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score

from nlp_pipeline import evaluate_evidence

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "scifact"
OUTPUT_PATH = ROOT / "models" / "production_policy_scifact_dev.json"
GOLD_LABELS = ["SUPPORTS", "REFUTES", "NOT_ENOUGH_INFO"]
PREDICTION_MAP = {
    "SUPPORTED": "SUPPORTS",
    "CONTRADICTED": "REFUTES",
    "PARTIALLY_SUPPORTED": "NOT_ENOUGH_INFO",
    "INSUFFICIENT_EVIDENCE": "NOT_ENOUGH_INFO",
    "UNVERIFIED": "NOT_ENOUGH_INFO",
}


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def make_dev_cases() -> list[tuple[str, str, str]]:
    corpus = {
        int(row["doc_id"]): row
        for row in read_jsonl(DATA_DIR / "corpus.jsonl")
    }
    claims = read_jsonl(DATA_DIR / "claims_dev.jsonl")
    cases: list[tuple[str, str, str]] = []
    for row in claims:
        claim_text = row.get("claim", "").strip()
        if not claim_text:
            continue
        evidence = row.get("evidence") or {}
        if evidence:
            for raw_doc_id, annotations in evidence.items():
                document = corpus.get(int(raw_doc_id))
                if not document:
                    continue
                sentences = document.get("abstract") or []
                for annotation in annotations:
                    label = annotation.get("label")
                    gold = {"SUPPORT": "SUPPORTS", "CONTRADICT": "REFUTES"}.get(label)
                    indices = annotation.get("sentences") or []
                    passage = " ".join(
                        sentences[index]
                        for index in indices
                        if isinstance(index, int) and 0 <= index < len(sentences)
                    )
                    if gold and passage:
                        cases.append((claim_text, passage, gold))
        else:
            for raw_doc_id in row.get("cited_doc_ids", []):
                document = corpus.get(int(raw_doc_id))
                if document:
                    passage = " ".join(document.get("abstract") or [])
                    if passage:
                        cases.append((claim_text, passage, "NOT_ENOUGH_INFO"))
    return cases


def main() -> None:
    cases = make_dev_cases()
    gold: list[str] = []
    predicted: list[str] = []
    verdict_counts: dict[str, int] = {}
    for claim_text, passage, label in cases:
        result = evaluate_evidence(
            {"claim_text": claim_text},
            {
                "authenticity_status": "VERIFIED",
                "retrieval_level": "abstract_only",
                "matched_source": "SciFact held-out abstract",
                "matched_title": "SciFact evidence document",
                "abstract": passage,
            },
        )
        verdict = result.get("verdict", "UNVERIFIED")
        verdict_counts[verdict] = verdict_counts.get(verdict, 0) + 1
        gold.append(label)
        predicted.append(PREDICTION_MAP.get(verdict, "NOT_ENOUGH_INFO"))

    report = classification_report(
        gold, predicted, labels=GOLD_LABELS, output_dict=True, zero_division=0
    )
    metrics = {
        "dataset": "SciFact official development split",
        "dataset_license": "CC BY-NC 2.0",
        "source": "https://github.com/allenai/scifact",
        "evaluation_cases": len(cases),
        "accuracy": round(float(accuracy_score(gold, predicted)), 4),
        "macro_f1": round(float(f1_score(gold, predicted, labels=GOLD_LABELS, average="macro", zero_division=0)), 4),
        "labels": GOLD_LABELS,
        "classification_report": report,
        "confusion_matrix": confusion_matrix(gold, predicted, labels=GOLD_LABELS).tolist(),
        "verdict_counts": verdict_counts,
        "prediction_mapping": PREDICTION_MAP,
        "evaluation_policy": "Production evidence evaluator, official dev split only; no fitting.",
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    main()
