from typing import Any


def score_setup(signal_eval: dict[str, Any]) -> dict[str, Any]:
    conviction = float(signal_eval.get("conviction", 0.0))
    vol = str(signal_eval.get("vol_regime", "unknown"))
    return {
        "rank_score": round(conviction, 4),
        "execution_quality": round(
            min(conviction * 2.0, 1.0)
            * (0.9 if vol != "extreme" else 0.5),
            4,
        ),
    }
