# Phase 2: Dev Mode Validation - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Validate the dev server correctly uses Vite's Environment API with per-environment module graphs for client and SSR. This phase proves the implementation works at runtime — no code changes expected, only validation and test creation.

</domain>

<decisions>
## Implementation Decisions

### Test App Selection
- First check if an existing app in the repo can be reused
- If not, create minimal app using `pnpm create qwik@beta` with empty template
- App should have a counter component (proves client interactivity without needing useVisibleTask$)
- Location: Claude's discretion based on repo conventions (likely starters/e2e/ if it fits)
- Keep committed if it adds value, gitignore if it feels like bloat

### Validation Approach
- Use both browser automation AND debug logging
- Browser: Verify page renders and counter increments on click (proves both environments work)
- Logging: Add console.log or debug statements to Vite plugin as practical
- Fully automated script that runs checks and reports pass/fail

### HMR Verification
- Unit test: Verify hotUpdate hook is called with correct environment
- Integration test: Monitor Vite HMR WebSocket for reload message when file changes
- Verify both client and SSR environment module invalidation
- Just need to confirm the reload function is called — full page reload is acceptable

### Success Evidence
- Both verification report AND tests required
- Report location: `.planning/phases/02-dev-mode-validation/02-VERIFICATION.md`
- New unit/integration tests committed to repo permanently (add long-term value)

### Claude's Discretion
- Exact test app location based on repo conventions
- Whether to include console output excerpts in report
- Debug logging implementation details (temporary logs vs DEBUG env var)
- What counts as "adds value" vs "bloat" for keeping test app

</decisions>

<specifics>
## Specific Ideas

- Counter component is sufficient — no need for useVisibleTask$ or complex interactions
- WebSocket inspection for HMR verification rather than browser automation
- Tests should become part of permanent test suite

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-dev-mode-validation*
*Context gathered: 2026-01-24*
