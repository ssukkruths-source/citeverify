"""Small, transparent Naive Bayes learner for reviewer-adjudicated verdicts.

It is intentionally advisory: source evidence remains the authority for each
automated verdict. Training labels come only from explicit reviewer feedback.
"""
from collections import Counter, defaultdict
import math
import re
from typing import Any, Dict, List, Optional

VERDICTS = {
    "SUPPORTED", "PARTIALLY_SUPPORTED", "CONTRADICTED",
    "INSUFFICIENT_EVIDENCE", "UNVERIFIED",
}
TOKEN_RE = re.compile(r"[a-z0-9]+(?:[.%/-][a-z0-9]+)*", re.I)


def _tokens(text: str) -> List[str]:
    return [token.lower() for token in TOKEN_RE.findall(text or "") if len(token) > 1]


def _features(row: Dict[str, Any]) -> List[str]:
    # Keep claim and source evidence together, while retaining field markers so
    # repeated words from the evidence cannot silently masquerade as the claim.
    return ([f"claim:{t}" for t in _tokens(row.get("claim_text", ""))]
            + [f"evidence:{t}" for t in _tokens(row.get("evidence_text", ""))])


def _dataset(rows: List[Dict[str, Any]]):
    usable = [r for r in rows if r.get("corrected_verdict") in VERDICTS and r.get("claim_text")]
    counts = Counter(r["corrected_verdict"] for r in usable)
    return usable, counts


def status(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    data, counts = _dataset(rows)
    ready = len(data) >= 6 and sum(1 for count in counts.values() if count >= 2) >= 2
    return {
        "training_examples": len(data),
        "verdict_counts": dict(counts),
        "trained": ready,
        "message": ("Reviewer-trained suggestions are available." if ready else
                    "Add at least six reviewed claims, with two examples for each of at least two verdicts, to enable suggestions."),
    }


def predict(example: Dict[str, Any], rows: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    data, counts = _dataset(rows)
    if not status(rows)["trained"]:
        return None

    classes = [label for label, count in counts.items() if count >= 2]
    vocab = set()
    docs: Dict[str, List[List[str]]] = defaultdict(list)
    for row in data:
        label = row["corrected_verdict"]
        if label not in classes:
            continue
        words = _features(row)
        vocab.update(words)
        docs[label].append(words)
    words = _features(example)
    if not words or not vocab:
        return None

    # Uniform priors avoid majority-label bias in small feedback collections.
    scores = {}
    for label in classes:
        token_counts = Counter(token for doc in docs[label] for token in doc)
        total = sum(token_counts.values())
        score = -math.log(len(classes))
        for token in words:
            score += math.log((token_counts[token] + 1) / (total + len(vocab)))
        scores[label] = score

    max_score = max(scores.values())
    exp_scores = {label: math.exp(score - max_score) for label, score in scores.items()}
    denominator = sum(exp_scores.values())
    label = max(scores, key=scores.get)
    confidence = exp_scores[label] / denominator if denominator else 0.0
    return {
        "verdict": label,
        "confidence": round(confidence, 3),
        "training_examples": len(data),
        "method": "multinomial_naive_bayes_from_reviewer_labels",
    }
