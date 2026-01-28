---
status: testing
phase: 02-dev-mode-validation
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md]
started: 2026-01-24T19:00:00Z
updated: 2026-01-24T19:00:00Z
---

## Current Test

number: 1
name: Dev Server Starts and Serves App
expected: |
  From qwik root: `node --require ./scripts/runBefore.ts starters/dev-server.ts 3300`
  Browser at http://localhost:3300/e2e/ shows the e2e app loading.
awaiting: user response

## Tests

### 1. Dev Server Starts and Serves App
expected: From qwik root: `node --require ./scripts/runBefore.ts starters/dev-server.ts 3300`. Browser at http://localhost:3300/e2e/ shows the e2e app loading.
result: [pending]

### 2. SSR Response Contains Server-Rendered HTML
expected: Viewing page source (Ctrl+U / Cmd+Option+U) shows HTML with `q:container` attribute on a container element, indicating SSR is working.
result: [pending]

### 3. Client Interactivity Works
expected: Clicking interactive elements (like toggle buttons) responds immediately without page reload. Client-side JavaScript is hydrated and working.
result: [pending]

### 4. HMR Triggers on File Change
expected: Editing a component file (e.g., changing text in a component) triggers browser reload or update without manual refresh. Console may show HMR activity.
result: [pending]

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0

## Gaps

[none yet]
