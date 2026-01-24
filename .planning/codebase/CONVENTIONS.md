# Coding Conventions

**Analysis Date:** 2026-01-24

## Naming Patterns

**Files:**
- Kebab-case for regular source files: `cursor.ts`, `error-handling.ts`, `signal.public.ts`
- Underscore-separated for implementation files: `signal-api.ts`, `qrl-class.ts`, `qrl-utils.ts`
- `.unit.ts` or `.spec.ts` suffix for test files: `signal.unit.tsx`, `qrl-to-string.spec.ts`
- Public API files use `.public.ts`: `signal.public.ts`, `slot.public.ts`, `utils.public.ts`
- Dollar suffix for generated/macro-expanded files: `qrl.public.dollar.ts`, `jsx-runtime.ts`

**Functions:**
- camelCase for function names: `createSignal`, `addCursor`, `qrlToString`, `codeToText`
- Functions starting with `is` for boolean checks: `isCursor`, `isCursorComplete`, `isSignal`, `isJSXNode`, `isRecoverable`
- Functions with underscore prefix for internal utilities: `_createSignal`, `_wrapProp`
- UPPER_SNAKE_CASE for error handling functions: `logErrorAndStop`

**Variables:**
- camelCase for local and module-level variables: `mockContext`, `cursorData`, `testFn`, `captureRef`
- camelCase for object properties: `$symbolToChunkResolver$`, `$addRoot$`, `$addSyncFn$`
- Dollar prefix for serialization/internal context objects: `$roots$`, `$capture$`, `$dirty`
- ALL_CAPS for constants and enums: `MAX_VALUE`, `NUMBER_OF_BUCKETS`, `TIMELINE_MAX_VALUE`, `SYNC_QRL`, `ERROR_CONTEXT`

**Types:**
- PascalCase for interface names: `ErrorBoundaryStore`, `SerializationContext`, `Cursor`, `Signal<T>`, `ComputedSignal<T>`
- Suffix `Config` for configuration types: `ComputedOptions`
- Suffix `Props` for component props
- Suffix `Internal` for internal type variants: `QRLInternal`, `SyncQRLInternal`, `InternalReadonlySignal`, `InternalSignal`

**JSDoc/Comments:**
- Use `@public` for public API: `/** @public */`
- Use `@internal` for internal APIs: `/** @internal */`
- Use HTML in JSDoc for formatting: `{{0}}` for parameter substitution in error messages

## Code Style

**Formatting:**
- Prettier plugin: `prettier-plugin-jsdoc` with TSDoc support
- Tab width: 2 spaces
- Trailing commas: ES5 style
- Semicolons: required
- Single quotes for strings
- Print width: 100 characters
- No tabs (spaces only)

**Linting:**
- ESLint 9.x with TypeScript support
- Base configs: `@eslint/js`, `typescript-eslint`
- Plugin: `eslint-plugin-no-only-tests` to prevent test-only runs

**Key Lint Rules:**
- `no-console`: Error (allows `console.warn` and `console.error`)
- `curly`: Error (require braces for blocks)
- `no-new-func`: Error
- `no-only-tests/no-only-tests`: Error
- Type assertion rules disabled for flexibility
- No restrictions on `any`, `explicit-module-boundary-types`, unused variables

**Server-side code restrictions** (`packages/qwik/src/server/**/*.ts`):
- Absolute imports not allowed (group: `packages/*`)
- Relative imports not allowed (group: `../**`)
- No duplicate imports: Error

## Import Organization

**Order:**
1. External library imports (e.g., `vitest`, `type` imports from external packages)
2. Qwik core imports (e.g., `@qwik.dev/core`, internal modules with `@qwik.dev/` prefix)
3. Local relative imports (e.g., `./cursor`, `../types`, `./jsx-runtime`)
4. Type-only imports at any level using `import type`

**Path Aliases:**
- No special path aliases configured in main ESLint config
- Vite tsconfig paths plugin used for resolution at build time
- Relative imports preferred over absolute paths except for well-known Qwik packages

**Export Patterns:**
- Barrel exports in index files: `export { ... }` from submodules
- Public APIs marked with `/** @public */` JSDoc
- Internal APIs marked with `/** @internal */` JSDoc
- Re-exports from implementation modules with `export { createComputedQrl };`

## Error Handling

**Patterns:**
- Centralized error codes via `QError` enum in `packages/qwik/src/core/shared/error/error.ts`
- Error message mapping: `codeToText(code, ...parts)` - maps error codes to human-readable messages
- Development mode detailed messages, production mode links to GitHub error documentation
- Error messages use `{{N}}` placeholders for parameter substitution
- `qError(code, errorMessageArgs)` function creates and logs errors
- `logErrorAndStop(text, ...errorMessageArgs)` for logging and stopping execution

**Error Context:**
- Context-based errors for validation: `notFoundContext` (Q8), `useInvokeContext` (Q10)
- Serialization errors with specific codes: `serializeErrorNotImplemented` (Q16), `serializeErrorUnknownType` (Q20)
- QRL-specific errors: `qrlIsNotFunction` (Q5), `qrlMissingContainer` (Q13), `qrlMissingChunk` (Q14)

**Recovery:**
- `isRecoverable(err)` checks if error can be recovered from
- Plugin errors not recoverable (have `plugin` property)
- Standard errors are recoverable by default

## Logging

**Framework:** No dedicated logging library, uses `console` with restrictions

**Patterns:**
- `console.warn()` and `console.error()` allowed via ESLint
- `console.log()` not allowed in source (ESLint: `no-console`)
- Development code guarded by `qDev` flag: `if (qDev) { ... }`
- Insights tracking via `insightsPing` sync function for analytics

**Location:** `packages/qwik/src/core/shared/utils/log.ts`

## Comments

**When to Comment:**
- Document public APIs with JSDoc blocks
- Explain complex algorithms or non-obvious logic
- Mark workarounds with explanatory comments
- Note performance-critical sections
- Document browser compatibility concerns

**JSDoc/TSDoc:**
- Required for public APIs (marked with `/** @public */`)
- Include parameter descriptions: `@param root - The vNode that will become the cursor root`
- Include return type descriptions: `@returns The vNode itself, now acting as a cursor`
- Document type parameters: `@template T - The value type`
- Use code examples in descriptions where helpful

**Example pattern from codebase:**
```typescript
/**
 * Adds a cursor to the given vNode (makes the vNode a cursor). Sets the cursor priority and
 * position to the root vNode itself.
 *
 * @param root - The vNode that will become the cursor root (dirty root)
 * @param priority - Priority level (lower = higher priority, 0 is default)
 * @returns The vNode itself, now acting as a cursor
 */
export function addCursor(container: Container, root: VNode, priority: number): Cursor {
```

## Function Design

**Size:** Keep functions focused and single-purpose. Complex logic broken into helpers.

**Parameters:**
- Use typed parameters with clear naming
- Prefer parameters to global state
- Context/config objects when multiple parameters needed

**Return Values:**
- Explicit return types on public functions
- Functions with side effects may return `void`
- Use type guards on return types where applicable (e.g., `vNode is Cursor`)

**Example from codebase:**
```typescript
export function isCursor(vNode: VNode): vNode is Cursor {
  return (vNode.flags & VNodeFlags.Cursor) !== 0;
}
```

## Module Design

**Exports:**
- Public APIs in `.public.ts` files
- Implementation in separate files (e.g., `signal-api.ts`)
- Re-export from public file with `export { ... }`
- Mark exports with `/** @public */` JSDoc

**Barrel Files:**
- Index files aggregate related exports
- Example: `packages/qwik/src/core/index.ts` exports public API
- Use `export { ... } from './path'` pattern

**Type vs. Value Exports:**
- `export type` for type-only exports
- `import type` for importing types
- Value exports separate from type exports

**Example pattern:**
```typescript
// In signal-api.ts (implementation)
export const createSignal = _createSignal;

// In signal.public.ts (public API)
export const createSignal: {
  <T>(): Signal<T | undefined>;
  <T>(value: T): Signal<T>;
} = _createSignal;
export { createComputedQrl };
```

---

*Convention analysis: 2026-01-24*
