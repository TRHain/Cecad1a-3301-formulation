# Frequency track — full-body periodicity cross-check

An independent current Cicada research corpus provides a useful full-body control before we over-interpret the section-0.11 frequency screen.

## External result

The `jaxonkuipers/cicada3301` corpus reports an equality-at-distance scan pooled over the unsolved Liber Primus body for lags 2..400 under a surviving retry/advance-drift model.

Key findings:

- No positive excess survived correction; maximum z was +2.68 at lag 99.
- A within-section shuffle null gave P = 0.445 for the maximum.
- Under the model's expected leakage, unknown repeating-key periods **<=55** are excluded at >=3-sigma power.
- The method loses power for long periods because state drift destroys phase alignment; therefore it does **not** rule out periods such as 761, 1033, or 3301.

## What this means for our frequency hypothesis

Our v0.63 section-0.11 result must not be read as evidence of a short periodic key. In particular, short simple repetitions are already under substantial pressure from full-body equality statistics.

The frequency branch should concentrate on:

1. long-period / phase modulation rather than simple short repeating keys;
2. section-specific or globally phased carriers;
3. frequency acting on a derived signal (state changes, red marks, page structure, geography) rather than directly repeating rune values;
4. explicit 761 / 1033 / 3301 phase tests once the full 12,956-rune body is loaded locally.

Source cross-check: `jaxonkuipers/cicada3301`, `research/attacks/distance-equality-scan-under-retry-drift/FINDINGS.md`, commit lineage queried 2026-08-29.
