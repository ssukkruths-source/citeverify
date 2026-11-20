"""Measure high-confidence SciBERT behavior on SciFact's held-out dev split.

This is evaluation only. It does not fit weights or select production verdicts.
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import accuracy_score
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from train_evidence_model import DATA_DIR, LABELS, MODEL_DIR, make_pairs, read_jsonl

ROOT = Path(__file__).resolve().parent
MODEL_PATH = MODEL_DIR / "scibert_finetuned"
OUTPUT_PATH = MODEL_DIR / "scibert_selective_evaluation.json"
MAX_LENGTH = 256
BATCH_SIZE = 8


def main() -> None:
    torch.set_num_threads(min(6, torch.get_num_threads()))
    corpus = {int(row["doc_id"]): row for row in read_jsonl(DATA_DIR / "corpus.jsonl")}
    dev_x, dev_y, _ = make_pairs(read_jsonl(DATA_DIR / "claims_dev.jsonl"), corpus)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH, local_files_only=True)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_PATH, local_files_only=True
    )
    model.eval()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)
    probabilities: list[list[float]] = []
    for start in range(0, len(dev_x), BATCH_SIZE):
        encoded = tokenizer(
            dev_x[start:start + BATCH_SIZE], padding="max_length", truncation=True,
            max_length=MAX_LENGTH, return_tensors="pt",
        )
        with torch.no_grad():
            logits = model(
                input_ids=encoded["input_ids"].to(device),
                attention_mask=encoded["attention_mask"].to(device),
            ).logits
            probabilities.extend(torch.softmax(logits, dim=1).cpu().numpy().tolist())

    probs = np.asarray(probabilities)
    gold = np.asarray([LABELS.index(label) for label in dev_y])
    predicted = probs.argmax(axis=1)
    max_conf = probs.max(axis=1)
    rows = []
    for threshold in (0.70, 0.80, 0.90, 0.95):
        selected = max_conf >= threshold
        rows.append({
            "minimum_confidence": threshold,
            "selected_pairs": int(selected.sum()),
            "coverage": round(float(selected.mean()), 4) if len(selected) else 0.0,
            "selective_accuracy": round(float(accuracy_score(gold[selected], predicted[selected])), 4)
            if selected.any() else None,
            "per_predicted_class": {
                LABELS[class_id]: {
                    "selected": int(((predicted == class_id) & selected).sum()),
                    "precision": round(float((gold[(predicted == class_id) & selected] == class_id).mean()), 4)
                    if ((predicted == class_id) & selected).any() else None,
                }
                for class_id in range(len(LABELS))
            },
        })

    artifact = {
        "dataset": "SciFact official development split",
        "dataset_license": "CC BY-NC 2.0",
        "source": "https://github.com/allenai/scifact",
        "base_model": "allenai/scibert_scivocab_uncased fine-tuned on official SciFact train split",
        "evaluation_pairs": len(dev_x),
        "argmax_accuracy": round(float(accuracy_score(gold, predicted)), 4),
        "thresholds": rows,
        "policy": "Evaluation only; confidence values are not calibrated probabilities and are not production verdicts.",
    }
    OUTPUT_PATH.write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    print(json.dumps(artifact, indent=2))


if __name__ == "__main__":
    main()
