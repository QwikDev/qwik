# Test Driven Development Rule

Use test-driven development for behavior changes and bug fixes.

## Required Workflow

1. Identify the observable behavior or invariant before editing implementation code.
2. Add or update the closest focused test that proves the behavior.
3. Run that test before the implementation change when feasible and confirm it fails for the
   expected reason.
4. Make the smallest implementation change that satisfies the test.
5. Rerun the focused test and keep iterating until it passes.
6. Run any broader verification required by the touched surface, such as API docs, optimizer
   snapshots, build output, or e2e coverage.

## Test Selection

- Prefer unit/spec tests next to the changed code.
- Use optimizer fixtures and snapshots for Rust transform behavior.
- Use e2e tests only when the behavior depends on a real browser, navigation, streaming, SSR/CSR
  integration, adapter behavior, or fixture app wiring.
- For serialization, hydration, streaming, or loader protocol changes, test both the writer and the
  reader path.
- For compatibility behavior, test both the current API path and the supported deprecated path.

## Exceptions

Docs-only, rules-only, formatting-only, dependency metadata, and generated-output maintenance
changes do not need a failing product test first. They still need the narrowest relevant
verification, such as formatting, Ruler dry-run, generated-output checks, or docs build checks.

If dependencies, missing generated artifacts, or local environment constraints prevent a pre-fix
test run, write the focused test first, record the blocker, and run the test as soon as the blocker
is resolved.
