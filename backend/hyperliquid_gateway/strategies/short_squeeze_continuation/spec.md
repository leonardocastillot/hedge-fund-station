# Short Squeeze Continuation

This folder is the backend home for the short squeeze continuation strategy.

Intended module split:

- `logic.py`: deterministic trigger logic
- `scoring.py`: ranking and setup score
- `risk.py`: invalidation and sizing rules
- `paper.py`: paper-trading helpers or replay adapters

The matching strategy document lives at:

- `docs/strategies/short-squeeze-continuation.md`
