# Scientific evidence model baseline

The project now has a reproducible training script for the official SciFact scientific claim/evidence benchmark:

```powershell
python backend/train_evidence_model.py
```

It trains a word/character TF-IDF linear SVM on the official training split and evaluates on the official development split. The development split is not used to fit the estimator. The fitted artifact and metrics are written to `backend/models/`.

## Held-out results

- Training: 809 claims, 1,287 claim/evidence pairs.
- Development: 300 claims, 452 claim/evidence pairs.
- Accuracy: 51.11%.
- Macro F1: 50.80%.
- `REFUTES` precision: 12.04%.

The separately fine-tuned SciBERT model is saved in `backend/models/scibert_finetuned/` and achieved 75.88% accuracy / 77.04% macro F1 on the same held-out set. Per-class precision was 76.70% for SUPPORTS, 55.88% for REFUTES and 99.09% for NOT_ENOUGH_INFO. The refutation precision means many predicted contradictions are still wrong, so the model is not allowed to decide or overwrite production verdicts. The model is an offline experiment only.

An evaluation-only confidence check found that even at a 0.95 softmax score, REFUTES precision was 56.92% on 65 predictions. The score is not calibrated, and confidence filtering did not make automatic contradiction safe. SUPPORTS precision at that cutoff was 87.50%; that is also insufficient to replace source-grounded review. Results are reproducible with `python backend/evaluate_scibert_selective.py` and are stored in `backend/models/scibert_selective_evaluation.json`.

The live evidence policy was also evaluated without fitting against those same 452 held-out pairs: 26.99% accuracy / 16.78% macro F1 when its five statuses are mapped into SciFact's three labels. It abstains heavily because abstracts and lexical overlap often do not expose the evidence relation. This is a measured limitation, not a reason to promote the less reliable class predictions. Run `python backend/evaluate_evidence_pipeline.py` to reproduce the policy evaluation after changing evidence rules.

The next model gate is evaluation on a separate, broader, rights-cleared reviewer-labeled set, including source retrieval, passage selection and document-level holdouts. SciFact is narrow in subject area and its train/dev split is not enough to certify production behavior. Human feedback remains separately stored; it is not automatically mixed into training or made to overwrite automated evidence analysis.

The data is licensed CC BY-NC 2.0. See [data/scifact/NOTICE.md](data/scifact/NOTICE.md); do not use it for a commercial service without separate rights.
