# runtime-size-fixture

Hand-authored Qwik + Router fixture used as the target for the runtime-size
benchmark (`pnpm test.bench.runtime-size`).

Each route exercises a single reactive or router primitive so that a byte-delta
in the baseline points straight at the primitive that regressed.

Bump the baseline with `pnpm test.bench.runtime-size.update` after an
intentional runtime change.
