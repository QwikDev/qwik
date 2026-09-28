# Performance budget

`perf.json` is intentionally uncalibrated until five successful runs on
`ubuntu-24.04` establish the budget. The required CI job rejects an uncalibrated file.

Run **Calibrate performance** on the fixed revision. Its artifact contains
five complete results, the regressed compiler result, a diagnostic CPU profile, and
the generated `perf.json`. Copy that generated file here and commit it.
The calibration script accepts it only when the regressed median exceeds 150% of
the largest fixed median. Recalibrate after changing Node or the locked Playwright
version, which also pins Chromium.

The timing harness uses a visible table at 1280 × 720, ten warmup cycles and thirty
samples. Timing starts immediately before the warm handler and ends when its
scheduler flush resolves. Every sample checks all 10,000 rows before recording it.
GC samples remain included in both the median and p95.

Imports, Playwright waits and clearing happen outside the measurement. Untimed
cleanup removes obsolete content markers before disposal and restores the table
before the next render; this avoids quadratic native range deletion in the broken
compiler. A collection before untimed cleanup releases obsolete native ranges;
GC during the measured flush remains included. The e2e test checks the real clear
handler with its markers intact.

For local diagnostics, run `pnpm serve`, then `pnpm bench.perf`.
Use `--p50=<milliseconds>` for an explicit local limit or `--budget=<file>` for a
matching calibrated environment. Results default to `test-results/`.
