---
name: qwik-core-development
description: Use when modifying or reviewing Qwik core package code under packages/qwik, especially reactive primitives, signals, VNodes, cursor behavior, QRLs, optimizer-facing runtime behavior, or Qwik core tests.
---

# Qwik Core Development

Use this skill for `packages/qwik/**` work. Keep the normal repo-wide instructions from `.ruler/AGENTS.md` in force.

## Fast Path

1. Identify the touched subsystem before editing: reactive primitives, VNode/client diffing, cursor, QRL/serialization, SSR, hooks, or tests.
2. Read the smallest relevant source and tests before making changes.
3. After implementation changes, immediately run the closest focused Vitest file with `pnpm vitest run <path>`.
4. If touching Rust optimizer code, use the repo-wide optimizer build/test guidance instead of treating this as a TypeScript-only change.

## When to Load Detailed Notes

Read `references/core-notes.md` only when the task involves:

- async signals, computed signals, polling, or signal invalidation;
- QRL creation, `$` transform behavior, or serialization issues;
- VNode, cursor, or DOM diff behavior;
- Qwik core tests that use `$()`, `retryOnPromise`, or private runtime state;
- an unfamiliar pattern in `packages/qwik/src/core`.

Do not load the reference for simple docs, package metadata, formatting, or unrelated monorepo work.

## Core Reminders

- Prefer existing Qwik runtime patterns over new abstractions.
- Use `$`-suffixed functions and `$()` in tests when a QRL boundary is expected.
- Avoid manual QRL construction unless nearby code already does it for the same reason.
- Keep tests focused; use a single relevant unit/spec file when possible.
