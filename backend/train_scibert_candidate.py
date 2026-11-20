"""Train and evaluate a claim-grouped SciBERT evidence-verification candidate.

SciFact's official development split remains untouched by gradient updates.
An internal split of the official training claims selects the epoch count, so
multiple evidence pairs from one claim cannot leak across that split.
"""
from __future__ import annotations

import json
import os
import random
from pathlib import Path
from typing import Any

# Keep Hugging Face cache inside this project. This model is already cached
# here, and training must work without attempting external downloads.
_model_cache = Path(__file__).resolve().parent / "models" / "hf_cache"
os.environ.setdefault("HF_HOME", str(_model_cache))
os.environ.setdefault("TRANSFORMERS_CACHE", str(_model_cache / "hub"))

import numpy as np
import torch
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score
from sklearn.model_selection import GroupShuffleSplit
from torch.utils.data import DataLoader, Subset
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from train_evidence_model import DATA_DIR, LABELS, MODEL_DIR, make_pairs, read_jsonl
from train_scibert_evidence import MODEL_NAME, MAX_LENGTH, TRAIN_BATCH, tensor_data

ROOT = Path(__file__).resolve().parent
CANDIDATE_DIR = MODEL_DIR / "scibert_finetuned_candidate"
METRICS_PATH = MODEL_DIR / "scibert_candidate_evaluation.json"
MAX_EPOCHS = 4
PATIENCE = 1
LEARNING_RATE = 2e-5
WEIGHT_DECAY = 0.01
SEED = 42


def load_model() -> AutoModelForSequenceClassification:
    return AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=len(LABELS),
        id2label={i: label for i, label in enumerate(LABELS)},
        label2id={label: i for i, label in enumerate(LABELS)},
        local_files_only=True,
    )


def prepare_loader(dataset, indices, *, shuffle: bool) -> DataLoader:
    generator = torch.Generator().manual_seed(SEED) if shuffle else None
    return DataLoader(
        Subset(dataset, indices),
        batch_size=TRAIN_BATCH,
        shuffle=shuffle,
        generator=generator,
    )


def run_epoch(model, loader, optimizer, device) -> float:
    model.train()
    total_loss = 0.0
    for input_ids, attention_mask, labels in loader:
        input_ids = input_ids.to(device)
        attention_mask = attention_mask.to(device)
        labels = labels.to(device)
        optimizer.zero_grad(set_to_none=True)
        output = model(input_ids=input_ids, attention_mask=attention_mask, labels=labels)
        output.loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        total_loss += float(output.loss.detach().cpu())
    return total_loss / max(1, len(loader))


def predict(model, loader, device) -> list[str]:
    model.eval()
    predictions: list[str] = []
    with torch.no_grad():
        for input_ids, attention_mask, _labels in loader:
            logits = model(
                input_ids=input_ids.to(device),
                attention_mask=attention_mask.to(device),
            ).logits
            predictions.extend(LABELS[int(i)] for i in logits.argmax(dim=1).cpu())
    return predictions


def metric_summary(gold: list[str], predicted: list[str]) -> dict[str, Any]:
    return {
        "accuracy": round(float(accuracy_score(gold, predicted)), 4),
        "macro_f1": round(
            float(f1_score(gold, predicted, labels=LABELS, average="macro", zero_division=0)),
            4,
        ),
        "classification_report": classification_report(
            gold, predicted, labels=LABELS, output_dict=True, zero_division=0
        ),
        "confusion_matrix": confusion_matrix(gold, predicted, labels=LABELS).tolist(),
    }


def main() -> None:
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    torch.set_num_threads(min(6, torch.get_num_threads()))

    corpus = {
        int(row["doc_id"]): row
        for row in read_jsonl(DATA_DIR / "corpus.jsonl")
    }
    train_x, train_y, train_ids = make_pairs(
        read_jsonl(DATA_DIR / "claims_train.jsonl"), corpus
    )
    dev_x, dev_y, _ = make_pairs(read_jsonl(DATA_DIR / "claims_dev.jsonl"), corpus)
    if not train_x or not dev_x:
        raise SystemExit("No labeled SciFact claim/evidence pairs were prepared.")

    unique_claim_ids = np.asarray(train_ids)
    pair_indices = np.arange(len(train_x))
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.20, random_state=SEED)
    fit_indices, tune_indices = next(
        splitter.split(pair_indices, train_y, groups=unique_claim_ids)
    )
    fit_claims = len(set(unique_claim_ids[fit_indices]))
    tune_claims = len(set(unique_claim_ids[tune_indices]))

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, local_files_only=True)
    train_dataset = tensor_data(train_x, train_y, tokenizer)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    tuning_model = load_model().to(device)
    tuning_loader = prepare_loader(train_dataset, fit_indices, shuffle=True)
    tuning_eval_loader = prepare_loader(train_dataset, tune_indices, shuffle=False)
    optimizer = torch.optim.AdamW(
        tuning_model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY
    )
    best_epoch = 1
    best_score: tuple[float, float] | None = None
    best_internal: dict[str, Any] = {}
    stale_epochs = 0
    tuning_history: list[dict[str, Any]] = []
    tuning_gold = [train_y[i] for i in tune_indices]

    for epoch in range(1, MAX_EPOCHS + 1):
        mean_loss = run_epoch(tuning_model, tuning_loader, optimizer, device)
        epoch_predictions = predict(tuning_model, tuning_eval_loader, device)
        epoch_metrics = metric_summary(tuning_gold, epoch_predictions)
        tuning_history.append({
            "epoch": epoch,
            "mean_training_loss": round(mean_loss, 4),
            "accuracy": epoch_metrics["accuracy"],
            "macro_f1": epoch_metrics["macro_f1"],
        })
        # Primary objective is accuracy; macro-F1 breaks ties and guards against
        # a model that improves only by favoring the largest class.
        score = (epoch_metrics["accuracy"], epoch_metrics["macro_f1"])
        print(
            f"internal epoch {epoch}/{MAX_EPOCHS}: loss={mean_loss:.4f} "
            f"accuracy={score[0]:.4f} macro_f1={score[1]:.4f}",
            flush=True,
        )
        if best_score is None or score > best_score:
            best_epoch = epoch
            best_score = score
            best_internal = epoch_metrics
            stale_epochs = 0
        else:
            stale_epochs += 1
            if stale_epochs >= PATIENCE:
                break

    # Refit from the original SciBERT checkpoint on all official train claims,
    # using only the epoch count selected on the grouped internal split.
    del tuning_model, optimizer, tuning_loader, tuning_eval_loader
    final_model = load_model().to(device)
    final_dataset = tensor_data(train_x, train_y, tokenizer)
    final_loader = prepare_loader(final_dataset, pair_indices, shuffle=True)
    final_optimizer = torch.optim.AdamW(
        final_model.parameters(), lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY
    )
    for epoch in range(1, best_epoch + 1):
        mean_loss = run_epoch(final_model, final_loader, final_optimizer, device)
        print(
            f"final fit epoch {epoch}/{best_epoch}: mean training loss={mean_loss:.4f}",
            flush=True,
        )

    dev_dataset = tensor_data(dev_x, dev_y, tokenizer)
    dev_loader = DataLoader(dev_dataset, batch_size=TRAIN_BATCH, shuffle=False)
    dev_predictions = predict(final_model, dev_loader, device)
    dev_metrics = metric_summary(dev_y, dev_predictions)

    prior_metrics_path = MODEL_DIR / "scibert_evaluation.json"
    prior_metrics = (
        json.loads(prior_metrics_path.read_text(encoding="utf-8"))
        if prior_metrics_path.exists() else None
    )
    candidate_metrics = {
        "dataset": "SciFact",
        "dataset_license": "CC BY-NC 2.0",
        "dataset_source": "https://github.com/allenai/scifact",
        "base_model": MODEL_NAME,
        "base_model_license": "Apache-2.0",
        "training_claims": len(set(train_ids)),
        "training_pairs": len(train_x),
        "internal_tuning_claims": tune_claims,
        "internal_fit_claims": fit_claims,
        "internal_selection": "GroupShuffleSplit by claim; maximize accuracy, then macro-F1; early stopping on internal train-only holdout.",
        "internal_best_epoch": best_epoch,
        "internal_best_metrics": best_internal,
        "internal_epoch_history": tuning_history,
        "official_dev_claims": 300,
        "official_dev_pairs": len(dev_x),
        "official_dev_metrics": dev_metrics,
        "previous_model_metrics": prior_metrics,
        "epochs_final_fit": best_epoch,
        "max_length": MAX_LENGTH,
        "batch_size": TRAIN_BATCH,
        "learning_rate": LEARNING_RATE,
        "class_labels": LABELS,
        "promotion_note": "Candidate artifact only; it was not made an automatic production verdict source. Compare error types and class-wise precision before promotion.",
    }
    CANDIDATE_DIR.mkdir(parents=True, exist_ok=True)
    final_model.save_pretrained(CANDIDATE_DIR, safe_serialization=True)
    tokenizer.save_pretrained(CANDIDATE_DIR)
    METRICS_PATH.write_text(json.dumps(candidate_metrics, indent=2), encoding="utf-8")
    print(json.dumps({
        "candidate_dir": str(CANDIDATE_DIR),
        "metrics_path": str(METRICS_PATH),
        "internal_best_epoch": best_epoch,
        "internal_accuracy": best_internal.get("accuracy"),
        "official_dev_accuracy": dev_metrics["accuracy"],
        "official_dev_macro_f1": dev_metrics["macro_f1"],
        "official_dev_per_class": {
            label: dev_metrics["classification_report"][label] for label in LABELS
        },
        "previous_official_dev_accuracy": (prior_metrics or {}).get("accuracy"),
        "previous_official_dev_macro_f1": (prior_metrics or {}).get("macro_f1"),
    }, indent=2))


if __name__ == "__main__":
    main()
