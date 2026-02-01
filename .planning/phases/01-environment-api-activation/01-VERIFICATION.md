---
phase: 01-environment-api-activation
verified: 2026-01-24T17:31:37Z
status: passed
score: 4/4 must-haves verified
must_haves:
  truths:
    - "Vite 7+ is detected via this.meta.viteVersion"
    - "environments.client config exists with consumer: 'client'"
    - "environments.ssr config exists with consumer: 'server'"
    - "Plugin hooks receive this.environment in dev mode"
  artifacts:
    - path: "packages/qwik/src/optimizer/src/plugins/vite.ts"
      provides: "Vite plugin with getViteMajorVersion() and environments config"
    - path: "packages/qwik/src/optimizer/src/plugins/plugin.ts"
      provides: "Core plugin with getIsServer() using Environment API"
    - path: "packages/qwik/src/optimizer/src/plugins/vite.unit.ts"
      provides: "Unit tests for Environment API configuration"
  key_links:
    - from: "vite.ts config()"
      to: "getViteMajorVersion()"
      via: "this.meta.viteVersion"
    - from: "plugin.ts getIsServer()"
      to: "environment.config.consumer"
      via: "ctx?.environment parameter"
    - from: "vite.ts hotUpdate"
      to: "environment.hot.send()"
      via: "this.environment"
---

# Phase 01: Environment API Activation Verification Report

**Phase Goal:** Verify Vite 7+ Environment API is detected and the `environments` config is applied correctly.
**Verified:** 2026-01-24T17:31:37Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                      | Status      | Evidence                                                                                           |
| --- | ---------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| 1   | Vite 7+ is detected via this.meta.viteVersion              | VERIFIED    | `getViteMajorVersion()` at vite.ts:47-51, called at vite.ts:373                                    |
| 2   | environments.client config exists with consumer: 'client'  | VERIFIED    | vite.ts:376-392, unit test vite.unit.ts:682 asserts `c.environments.client.consumer === 'client'` |
| 3   | environments.ssr config exists with consumer: 'server'     | VERIFIED    | vite.ts:393-400, unit test vite.unit.ts:683 asserts `c.environments.ssr.consumer === 'server'`    |
| 4   | Plugin hooks receive this.environment in dev mode          | VERIFIED    | getIsServer() at plugin.ts:444-457 accepts `environment` param; called from resolveId/load/transform |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact                                                        | Expected                                        | Status      | Details                                               |
| --------------------------------------------------------------- | ----------------------------------------------- | ----------- | ----------------------------------------------------- |
| `packages/qwik/src/optimizer/src/plugins/vite.ts`               | Environment API config and version detection    | VERIFIED    | 1026 lines, substantive, getViteMajorVersion + environments config present |
| `packages/qwik/src/optimizer/src/plugins/plugin.ts`             | getIsServer() with Environment API support      | VERIFIED    | 1342 lines, substantive, getIsServer checks environment.config.consumer   |
| `packages/qwik/src/optimizer/src/plugins/vite.unit.ts`          | Unit tests for Environment API                  | VERIFIED    | 737 lines, 24 tests pass, 9 specific Environment API tests               |

### Key Link Verification

| From                     | To                              | Via                           | Status   | Details                                                    |
| ------------------------ | ------------------------------- | ----------------------------- | -------- | ---------------------------------------------------------- |
| vite.ts config()         | getViteMajorVersion()           | this.meta.viteVersion         | WIRED    | Line 373: `getViteMajorVersion((this as any)?.meta?.viteVersion)` |
| vite.ts config()         | environments config             | viteMajorVersion >= 7 check   | WIRED    | Lines 374-401: Conditional config application              |
| plugin.ts resolveId      | getIsServer()                   | ctx?.environment              | WIRED    | Line 509: `getIsServer(resolveOpts, ctx?.environment)`     |
| plugin.ts load           | getIsServer()                   | ctx?.environment              | WIRED    | Line 670: `getIsServer(loadOpts, ctx?.environment)`        |
| plugin.ts transform      | getIsServer()                   | ctx?.environment              | WIRED    | Line 748: `getIsServer(transformOpts, ctx?.environment)`   |
| vite.ts hotUpdate        | environment.hot.send()          | this.environment              | WIRED    | Lines 638, 652: Uses environment for HMR                   |

### Requirements Coverage

| Requirement | Status    | Blocking Issue |
| ----------- | --------- | -------------- |
| ENV-01: Vite 7+ detected and environments config applied    | SATISFIED | None |
| ENV-02: server.environments.client and server.environments.ssr exist | SATISFIED | None |
| ENV-03: this.environment available in plugin hooks          | SATISFIED | None |

### Anti-Patterns Found

| File                                           | Line | Pattern | Severity  | Impact                           |
| ---------------------------------------------- | ---- | ------- | --------- | -------------------------------- |
| vite.ts                                        | 784  | TODO    | Info      | Unrelated - link to docs comment |
| plugin.ts                                      | 841  | TODO    | Info      | Unrelated - noop modules comment |

No blocking anti-patterns. TODOs are unrelated to Environment API functionality.

### Human Verification Required

None required. All success criteria can be verified programmatically through unit tests.

### Unit Test Evidence

```
Test Files:  110 passed (110)
Tests:       2066 passed | 22 todo

Key Environment API Tests (vite.unit.ts):
- "environments config should be present for Vite 7+" - PASS
- "environments config should NOT be present for older Vite versions" - PASS
- "environments config should NOT be present for undefined version (Rolldown)" - PASS
- "client environment should have browser resolve conditions" - PASS
- "ssr environment should have node resolve conditions" - PASS
- "hotUpdate hook should exist on post plugin" - PASS
- "hotUpdate should skip non-client environments" - PASS
- "hotUpdate should send full-reload for client environment with modules" - PASS
- "hotUpdate should not send reload when no modules" - PASS
```

## Implementation Details

### Version Detection (vite.ts:47-51)

```typescript
function getViteMajorVersion(viteVersion: string | undefined): number {
  if (!viteVersion) return 0;
  const major = parseInt(viteVersion.split('.')[0], 10);
  return isNaN(major) ? 0 : major;
}
```

### Environments Configuration (vite.ts:374-401)

```typescript
const viteMajorVersion = getViteMajorVersion((this as any)?.meta?.viteVersion);
if (viteMajorVersion >= 7) {
  updatedViteConfig.environments = {
    client: {
      consumer: 'client',
      resolve: { conditions: ['browser', 'import', 'module'] },
      optimizeDeps: { exclude: [...QWIK_PACKAGES] }
    },
    ssr: {
      consumer: 'server',
      resolve: {
        conditions: ['node', 'import', 'module'],
        noExternal: [...QWIK_PACKAGES]
      }
    }
  };
}
```

### Environment Detection in Hooks (plugin.ts:444-457)

```typescript
const getIsServer = (viteOpts?: { ssr?: boolean }, environment?: Environment): boolean => {
  // Vite 7+ Environment API: Check environment.config.consumer first
  if (environment?.config?.consumer === 'server') {
    return true;
  }
  // Fallback: check environment.name for edge cases
  if (environment?.name === 'ssr') {
    return true;
  }
  // Rolldown/build fallback
  return devServer ? !!viteOpts?.ssr : opts.target === 'ssr' || opts.target === 'test';
};
```

### HMR via Environment API (vite.ts:634-656)

```typescript
hotUpdate: {
  order: 'post',
  handler({ file, modules, server }) {
    if ((this as any).environment?.name !== 'client') {
      return;
    }
    // ... cache invalidation ...
    if (modules.length) {
      (this as any).environment.hot.send({ type: 'full-reload' });
      return [];
    }
  }
}
```

## Conclusion

All must-haves verified. The Qwik Vite plugin correctly:

1. **Detects Vite 7+** using `this.meta.viteVersion` in the config hook
2. **Configures environments** with proper consumer values ('client' and 'server')
3. **Uses this.environment** in plugin hooks (resolveId, load, transform, hotUpdate)
4. **Provides graceful fallback** for older Vite versions and Rolldown

Phase 01 goal achieved. Ready to proceed to Phase 02 (Dev Mode Validation).

---
*Verified: 2026-01-24T17:31:37Z*
*Verifier: Claude (gsd-verifier)*
