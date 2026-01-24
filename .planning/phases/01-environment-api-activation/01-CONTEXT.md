# Phase 1: Environment API Activation - Context

**Gathered:** 2025-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify that Vite 7+ Environment API is detected and the `environments` config is applied correctly. This is validation work — confirming existing implementation works, not building new features.

</domain>

<decisions>
## Implementation Decisions

### Verification output
- Manual inspection approach — run dev server, check conditions via terminal and devtools
- Use appropriate test app depending on what's being verified (dev vs build scenarios)
- Add temporary debug statements to confirm code paths, remove after verification

### Scope of checks
- Verify all 4 roadmap success criteria:
  1. Dev server logs show Vite 7+ detected
  2. `server.environments.client` exists with `consumer: 'client'`
  3. `server.environments.ssr` exists with `consumer: 'server'`
  4. Plugin hooks receive `this.environment` in dev mode
- Also verify legacy fallback path works (backwards compatibility)
  - Existing unit tests cover this, but consider mocking Vite version in Playwright tests
- Basic manifest handoff check — verify manifest-related config exists in environment setup (deep validation in Phase 3)
- Check ALL hooks used by Qwik plugin, not just critical path
  - Includes: configureServer, hotUpdate, transform, buildStart, etc.

### Claude's Discretion
- Failure handling: Claude decides based on severity whether to stop and investigate or document and continue
- Which specific test app to use for each verification step
- Exact debug logging placement and content

</decisions>

<specifics>
## Specific Ideas

- User mentioned existing unit tests on version detection — leverage those rather than duplicating
- Consider Playwright tests with mocked Vite version for legacy path verification
- "Figure out where makes the most sense depending on testing dev or build" — context-aware test app selection

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-environment-api-activation*
*Context gathered: 2025-01-24*
