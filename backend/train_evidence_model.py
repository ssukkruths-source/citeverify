"""Train and evaluate CiteVerify's advisory scientific evidence model on SciFact.

Uses the official labeled train/dev split. The dev split remains held out and is
reported as evaluation only; it is never used to fit the saved estimator.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.svm import LinearSVC
from sklearn.pipeline import FeatureUnion, Pipeline

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "scifact"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "scifact_evidence.joblib"
METRICS_PATH = MODEL_DIR / "scifact_evaluation.json"
LABELS = ["SUPPORTS", "REFUTES", "NOT_ENOUGH_INFO"]


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open(encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def pair_text(claim: str, document: dict[str, Any], sentence_indices: list[int] | None = None) -> str:
    title = document.get("title", "")
    abstract = document.get("abstract", [])
    evidence = (
        " ".join(abstract[i] for i in sentence_indices if 0 <= i < len(abstract))
        if sentence_indices is not None else " ".join(abstract)
    )
    return f"claim: {claim}\nsource title: {title}\nsource evidence: {evidence}"


def make_pairs(claim_rows: list[dict[str, Any]], corpus: dict[int, dict[str, Any]]):
    texts: list[str] = []
    labels: list[str] = []
    claim_ids: list[int] = []
    for row in claim_rows:
        claim = row.get("claim", "").strip()
        if not claim:
            continue
        evidence = row.get("evidence") or {}
        if evidence:
            for raw_doc_id, annotations in evidence.items():
                doc = corpus.get(int(raw_doc_id))
                if not doc:
                    continue
                for annotation in annotations:
                    label = {"SUPPORT": "SUPPORTS", "CONTRADICT": "REFUTES"}.get(annotation.get("label"))
                    if label:
                        texts.append(pair_text(claim, doc, annotation.get("sentences", [])))
                        labels.append(label)
                        claim_ids.append(row["id"])
        else:
            # SciFact marks these claims as having no supporting/refuting
            # abstract; cited candidate abstracts become NOT_ENOUGH_INFO pairs.
            for raw_doc_id in row.get("cited_doc_ids", []):
                doc = corpus.get(int(raw_doc_id))
                if doc:
                    texts.append(pair_text(claim, doc))
                    labels.append("NOT_ENOUGH_INFO")
                    claim_ids.append(row["id"])
    return texts, labels, claim_ids


def build_model() -> Pipeline:
    features = FeatureUnion(
        [
            ("word", TfidfVectorizer(
                analyzer="word", ngram_range=(1, 2), min_df=2,
                max_features=80_000, sublinear_tf=True, strip_accents="unicode",
            )),
            ("character", TfidfVectorizer(
                analyzer="char_wb", ngram_range=(3, 5), min_df=2,
                max_features=100_000, sublinear_tf=True,
            )),
        ],
        transformer_weights={"word": 1.0, "character": 0.55},
    )
    return Pipeline(
        [
            ("features", features),
            ("classifier", LinearSVC(
                class_weight="balanced", C=1.0, random_state=42,
            )),
        ]
    )


def main() -> None:
    if not (DATA_DIR / "claims_train.jsonl").exists() or not (DATA_DIR / "claims_dev.jsonl").exists():
        raise SystemExit(f"SciFact train/dev data not found in {DATA_DIR}")

    corpus_rows = read_jsonl(DATA_DIR / "corpus.jsonl")
    corpus = {int(row["doc_id"]): row for row in corpus_rows}
    train_claims = read_jsonl(DATA_DIR / "claims_train.jsonl")
    dev_claims = read_jsonl(DATA_DIR / "claims_dev.jsonl")
    train_x, train_y, train_ids = make_pairs(train_claims, corpus)
    dev_x, dev_y, dev_ids = make_pairs(dev_claims, corpus)
    if not train_x or not dev_x:
        raise SystemExit("No labeled claim/evidence pairs were prepared.")

    model = build_model()
    model.fit(train_x, train_y)
    predictions = model.predict(dev_x)
    report = classification_report(
        dev_y, predictions, labels=LABELS, output_dict=True, zero_division=0,
    )
    metrics = {
        "dataset": "SciFact",
        "dataset_license": "CC BY-NC 2.0",
        "source": "https://github.com/allenai/scifact",
        "citation": "Wadden et al. (2020), Fact or Fiction: Verifying Scientific Claims",
        "training_claims": len(set(train_ids)),
        "training_pairs": len(train_x),
        "validation_claims": len(set(dev_ids)),
        "validation_pairs": len(dev_x),
        "accuracy": round(float(accuracy_score(dev_y, predictions)), 4),
        "macro_f1": round(float(f1_score(dev_y, predictions, labels=LABELS, average="macro", zero_division=0)), 4),
        "labels": LABELS,
        "classification_report": report,
        "confusion_matrix_labels": LABELS,
        "confusion_matrix": confusion_matrix(dev_y, predictions, labels=LABELS).tolist(),
        "model": "word+character TF-IDF with class-balanced linear SVM",
        "evaluation_policy": "Official dev split held out from model fitting.",
    }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump({"pipeline": model, "metadata": metrics}, MODEL_PATH, compress=3)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps({
        "model_path": str(MODEL_PATH),
        "metrics_path": str(METRICS_PATH),
        "training_claims": metrics["training_claims"],
        "training_pairs": metrics["training_pairs"],
        "validation_claims": metrics["validation_claims"],
        "validation_pairs": metrics["validation_pairs"],
        "accuracy": metrics["accuracy"],
        "macro_f1": metrics["macro_f1"],
        "per_class": {label: report[label] for label in LABELS},
    }, indent=2))


if __name__ == "__main__":
    main()
