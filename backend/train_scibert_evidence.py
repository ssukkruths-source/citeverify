"""Fine-tune SciBERT for scientific claim/evidence alignment on SciFact."""
from __future__ import annotations

import json
import random
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from torch.utils.data import DataLoader, TensorDataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from train_evidence_model import LABELS, DATA_DIR, MODEL_DIR, make_pairs, read_jsonl

ROOT = Path(__file__).resolve().parent
MODEL_NAME = "allenai/scibert_scivocab_uncased"
OUTPUT_DIR = MODEL_DIR / "scibert_finetuned"
METRICS_PATH = MODEL_DIR / "scibert_evaluation.json"
MAX_LENGTH = 256
TRAIN_BATCH = 8
EPOCHS = 2


def tensor_data(texts, labels, tokenizer):
    encoded = tokenizer(
        texts, padding="max_length", truncation=True, max_length=MAX_LENGTH,
        return_tensors="pt",
    )
    label_ids = torch.tensor([LABELS.index(label) for label in labels], dtype=torch.long)
    return TensorDataset(encoded["input_ids"], encoded["attention_mask"], label_ids)


def main() -> None:
    random.seed(42)
    np.random.seed(42)
    torch.manual_seed(42)
    torch.set_num_threads(min(6, torch.get_num_threads()))

    corpus = {int(row["doc_id"]): row for row in read_jsonl(DATA_DIR / "corpus.jsonl")}
    train_x, train_y, train_ids = make_pairs(read_jsonl(DATA_DIR / "claims_train.jsonl"), corpus)
    dev_x, dev_y, dev_ids = make_pairs(read_jsonl(DATA_DIR / "claims_dev.jsonl"), corpus)

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME, num_labels=len(LABELS),
        id2label={i: label for i, label in enumerate(LABELS)},
        label2id={label: i for i, label in enumerate(LABELS)},
    )
    train_set = tensor_data(train_x, train_y, tokenizer)
    dev_set = tensor_data(dev_x, dev_y, tokenizer)
    train_loader = DataLoader(train_set, batch_size=TRAIN_BATCH, shuffle=True)
    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-5, weight_decay=0.01)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)

    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0.0
        for input_ids, attention_mask, labels in train_loader:
            input_ids, attention_mask, labels = input_ids.to(device), attention_mask.to(device), labels.to(device)
            optimizer.zero_grad(set_to_none=True)
            output = model(input_ids=input_ids, attention_mask=attention_mask, labels=labels)
            output.loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += float(output.loss.detach().cpu())
        print(f"epoch {epoch + 1}/{EPOCHS}: mean training loss {total_loss / max(1, len(train_loader)):.4f}", flush=True)

    model.eval()
    dev_loader = DataLoader(dev_set, batch_size=TRAIN_BATCH, shuffle=False)
    predictions: list[str] = []
    with torch.no_grad():
        for input_ids, attention_mask, _labels in dev_loader:
            logits = model(input_ids=input_ids.to(device), attention_mask=attention_mask.to(device)).logits
            predictions.extend(LABELS[int(i)] for i in logits.argmax(dim=1).cpu())

    report = classification_report(dev_y, predictions, labels=LABELS, output_dict=True, zero_division=0)
    metrics = {
        "dataset": "SciFact",
        "dataset_license": "CC BY-NC 2.0",
        "dataset_source": "https://github.com/allenai/scifact",
        "base_model": MODEL_NAME,
        "base_model_license": "Apache-2.0",
        "training_claims": len(set(train_ids)),
        "training_pairs": len(train_x),
        "validation_claims": len(set(dev_ids)),
        "validation_pairs": len(dev_x),
        "accuracy": round(float(accuracy_score(dev_y, predictions)), 4),
        "macro_f1": round(float(f1_score(dev_y, predictions, labels=LABELS, average="macro", zero_division=0)), 4),
        "labels": LABELS,
        "classification_report": report,
        "confusion_matrix": confusion_matrix(dev_y, predictions, labels=LABELS).tolist(),
        "epochs": EPOCHS,
        "max_length": MAX_LENGTH,
        "evaluation_policy": "Official SciFact dev split held out from gradient updates.",
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(OUTPUT_DIR, safe_serialization=True)
    tokenizer.save_pretrained(OUTPUT_DIR)
    METRICS_PATH.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps({
        "model_dir": str(OUTPUT_DIR),
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
