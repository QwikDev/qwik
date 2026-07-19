---
name: qwik-core-development
description: Use when modifying or reviewing Qwik core package code under packages/qwik, especially signals, computed values, target-native DOM and SSR behavior, QRLs, serialization, or Qwik core tests.
---

# Qwik Core Development

Use this skill for `packages/qwik/**` work. Keep the normal repo-wide instructions from `.ruler/AGENTS.md` in force.

## Fast Path

1. Identify the touched subsystem before editing: reactivity, target-native DOM, QRL/serialization, SSR, hooks, or tests.
2. Read the smallest relevant source and tests before making changes.
3. Find the invariant that must stay true across SSR, resume, client render, and serialization when
   the touched code crosses those boundaries.
4. After implementation changes, immediately run the closest focused Vitest file with `pnpm vitest run <path>`. Do not use `pnpm test.unit`.
5. If touching Rust optimizer code, load `qwik-optimizer-development` instead of treating the change as TypeScript-only.

## When to Load Detailed Notes

Read `references/core-notes.md` only when the task involves:

- async signals, computed signals, polling, or signal invalidation;
- QRL creation, `$` transform behavior, or serialization issues;
- target-native DOM or SSR behavior;
- Qwik core tests that use `$()`, `retryOnPromise`, or private runtime state;
- an unfamiliar pattern in `packages/qwik/src/core`.

Do not load the reference for simple docs, package metadata, formatting, or unrelated monorepo work.

## Core Reminders

- Prefer existing Qwik runtime patterns over new abstractions.
- Keep state ownership explicit. For serialized or streamed data, update emit and consume paths
  together and add a round-trip or regression test.
- Preserve compatibility deliberately. If deprecated input remains accepted, test both deprecated and
  current behavior.
- Use `$`-suffixed functions and `$()` in tests when a QRL boundary is expected.
- Avoid manual QRL construction unless nearby code already does it for the same reason.
- Keep tests focused and close to the behavior that changed; add e2e coverage only when browser,
  streaming, navigation, or integration timing is the behavior under test.
- If the change affects public API, run `pnpm api.update` after the focused tests pass.
- If this skill or `references/core-notes.md` is stale after your source inspection, update it before
  finishing or record why guidance edits were out of scope.
