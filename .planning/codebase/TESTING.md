# Testing Patterns

**Analysis Date:** 2026-01-24

## Test Framework

**Runner:**
- Vitest - configured in `vitest.config.ts` at project root
- Config: `/Users/jackshelton/dev/open-source/qwik/vitest.config.ts`

**Assertion Library:**
- Vitest built-in `expect()` assertions
- Alternative: `assert` from vitest for simple comparisons

**Setup:**
- Global setup file: `vitest-setup.ts`
- Sets test environment flags: `qTest = true`, `qRuntimeQrl = true`, `qDev = true`, `qInspector = false`
- Initializes test platform: `getTestPlatform()` and `setPlatform()`
- Runs `beforeAll()` hook to configure platform before tests

**Run Commands:**
```bash
pnpm test.unit               # Run all unit tests
pnpm test.unit.debug         # Debug mode with inspector
pnpm test                    # Full test suite (build + unit + e2e)
```

## Test File Organization

**Location:**
- Co-located with source files in same directory
- Tests NOT in separate `__tests__` directory

**Naming:**
- `.unit.ts` or `.unit.tsx` for unit tests
- `.spec.ts` or `.spec.tsx` for specification tests
- Examples: `signal.unit.tsx`, `qrl-to-string.spec.ts`, `vector.unit.ts`

**Structure:**
```
packages/qwik/src/
├── core/
│   ├── shared/
│   │   ├── serdes/
│   │   │   ├── qrl-to-string.ts
│   │   │   └── qrl-to-string.spec.ts    # Test file in same directory
│   │   └── jsx/
│   │       ├── factory.ts
│   │       └── factory.unit.ts
│   └── reactive-primitives/
│       ├── impl/
│       │   ├── signal.tsx
│       │   └── signal.unit.tsx
└── server/
    ├── ssr-container.ts
    └── ssr-container.spec.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('Feature Name', () => {
  let mockContext: SerializationContext;

  beforeEach(() => {
    // Setup before each test
    mockContext = {
      $symbolToChunkResolver$: vi.fn((hash: string) => `chunk-${hash}`),
      $addRoot$: vi.fn((obj: unknown) => 1) as any,
      $addSyncFn$: vi.fn((funcStr: string | null, argsCount: number, fn: Function) => 42),
    } as unknown as SerializationContext;
  });

  describe('sync QRL serialization', () => {
    it('should serialize a sync QRL', () => {
      // Test body
    });
  });

  describe('capture references', () => {
    it('should serialize QRL with single capture reference', () => {
      // Test body
    });
  });
});
```

**Patterns:**
- Top-level `describe()` for feature/component name
- Nested `describe()` blocks for grouping related tests
- `beforeEach()` for test setup and fixture initialization
- `it()` for individual test cases with descriptive names
- One assertion focus per test (or related group)

## Mocking

**Framework:** Vitest `vi` module

**Patterns:**
```typescript
// Function mocking
mockContext.$symbolToChunkResolver$ = vi.fn((hash: string) => `chunk-${hash}`);
mockContext.$addRoot$ = vi.fn(() => 1) as any;
mockContext.$addSyncFn$ = vi.fn((funcStr: string | null, argsCount: number, fn: Function) => 42);

// Stub global values
vi.hoisted(() => {
  vi.stubGlobal('QWIK_LOADER_DEFAULT_MINIFIED', 'min');
  vi.stubGlobal('QWIK_LOADER_DEFAULT_DEBUG', 'debug');
});

// Mock implementation that updates state
let callCount = 0;
mockContext.$addRoot$ = vi.fn(() => ++callCount) as any;

// Verify mock calls
expect(mockContext.$symbolToChunkResolver$).toHaveBeenCalledWith('abc123');
expect(mockContext.$addRoot$).toHaveBeenCalledTimes(3);
expect(mockContext.$addRoot$).toHaveBeenCalledWith(captureRef);
```

**What to Mock:**
- External dependencies (API calls, database access)
- System functions (file I/O, timers)
- Service methods and callbacks
- Context-dependent objects
- Global values that affect behavior

**What NOT to Mock:**
- Pure utility functions
- Internal business logic (test real implementation)
- Standard library functions (e.g., `Array.map()`)
- Type constructors and interfaces
- HTML/DOM elements being tested

## Fixtures and Factories

**Test Data:**
```typescript
// Simple factory pattern for test objects
class Foo {
  constructor(public val: number = 0) {}
  update(val: number) {
    this.val = val;
  }
}

// Mock writer used in multiple tests
const writer = {
  chunks: [] as string[],
  write(text: string) {
    this.chunks.push(text);
  },
  toString() {
    return this.chunks.join('');
  },
};

// Mock context objects in beforeEach
let mockContext: SerializationContext;
beforeEach(() => {
  mockContext = {
    $symbolToChunkResolver$: vi.fn((hash: string) => `chunk-${hash}`),
    // ... other properties
  } as unknown as SerializationContext;
});
```

**Location:**
- Fixtures defined in test file itself (co-located)
- Reusable factories at top of test file
- Setup in `beforeEach()` hook for per-test initialization

## Coverage

**Requirements:** Not enforced by default (no coverage thresholds configured)

**View Coverage:**
```bash
# Generate coverage report
vitest --coverage packages

# Coverage metrics tracked via CI/CD pipeline
# Specific packages may have their own coverage requirements
```

## Test Types

**Unit Tests:**
- File suffix: `.unit.ts` or `.unit.tsx`
- Scope: Single function or small module
- Approach: Test function in isolation with mocked dependencies
- Example: `signal.unit.tsx` tests signal creation and reactivity
- Example: `qrl-to-string.spec.ts` tests QRL serialization
- Use vi.fn() to mock context and dependencies

**Integration Tests:**
- File suffix: `.spec.ts` or `.spec.tsx`
- Scope: Multiple components/modules working together
- Approach: Test real implementations with minimal mocking
- Example: `ssr-container.spec.ts` tests SSR rendering with real DOM operations
- Example: `jsx-runtime.unit.ts` tests JSX factory integration
- Use real objects where possible, mock only external services

**E2E Tests:**
- Framework: Playwright
- Config: `starters/playwright.config.ts`, `e2e/adapters-e2e/playwright.config.ts`
- Scope: Full application workflows
- Run with: `pnpm test.e2e.chromium`, `pnpm test.e2e.webkit`, `pnpm test.e2e.firefox`
- Covers: Real browser behavior, routing, hydration, user interactions
- Not co-located with source code, located in `starters/e2e/` and `e2e/` directories

## Common Patterns

**Async Testing:**
```typescript
// Using async/await in tests
it('should emit Qwik loader before style elements', async () => {
  const container = ssrCreateContainer({
    tagName: 'div',
    writer,
    renderOptions: { qwikLoader: 'inline' },
  });

  container.openContainer();
  container.openElement('div', null, null);
  await container.closeElement();
  container.openElement('style', null, [QStyle, 'my-style-id']);
  container.write('.my-class { color: red; }');
  await container.closeElement();
  await container.closeContainer();

  const html = writer.toString();
  expect(html.indexOf('id="qwikloader"')).toBeGreaterThan(html.indexOf('my-style-id'));
});
```

**Error Testing:**
```typescript
// Test error handling scenarios
it('should handle error cases gracefully', () => {
  const mockContext = {
    $symbolToChunkResolver$: vi.fn(() => '') as any, // Return empty to trigger error path
  } as unknown as SerializationContext;

  const qrl = createQRL(null, 'mySymbol_abc123', null, null, null, null) as QRLInternal;

  // In dev mode, it falls back instead of throwing
  const result = qrlToString(mockContext, qrl);
  expect(result).toContain('#mySymbol_abc123');
});
```

**Type Testing with `expectTypeOf`:**
```typescript
import { expectTypeOf } from 'vitest';

it('Signal<T>', () => () => {
  const signal = createSignal(1);
  expectTypeOf(signal).toEqualTypeOf<Signal<number>>();
});

it('ComputedSignal<T>', () => () => {
  const signal = createComputed$(() => 1);
  expectTypeOf(signal).toEqualTypeOf<ComputedSignal<number>>();
});
```

**Describe Blocks for Organization:**
```typescript
describe('qrlToString', () => {
  describe('async QRL serialization', () => {
    it('should serialize a basic async QRL without captures', () => { ... });
    it('should serialize QRL with chunk and symbol', () => { ... });
  });

  describe('sync QRL serialization', () => {
    it('should serialize a sync QRL', () => { ... });
    it('should not include chunk for sync QRL', () => { ... });
  });

  describe('capture references', () => {
    it('should serialize QRL with single capture reference', () => { ... });
    it('should serialize QRL with multiple capture references', () => { ... });
  });

  describe('raw mode', () => {
    it('should return tuple in raw mode without captures', () => { ... });
    it('should return tuple in raw mode with captures', () => { ... });
  });
});
```

**Testing Mutations and State:**
```typescript
// Test that functions don't mutate original objects
it('should not mutate the original QRL object', () => {
  const captureRef = { value: 'captured' };
  const qrl = createQRL('myChunk', 'mySymbol', null, null, null, [captureRef]) as QRLInternal;
  mockContext.$addRoot$ = vi.fn(() => 5) as any;

  expect(qrl.$capture$).toBeNull();
  const result = qrlToString(mockContext, qrl);
  expect(result).toBe('myChunk#mySymbol[5]');
  expect(qrl.$capture$).toBeNull(); // Should NOT be mutated
});
```

**Testing Call Counts and Arguments:**
```typescript
// Verify mock functions were called with correct arguments
expect(mockContext.$symbolToChunkResolver$).toHaveBeenCalledWith('abc123');
expect(mockContext.$addRoot$).toHaveBeenCalledTimes(3);
expect(mockContext.$addRoot$).toHaveBeenCalledWith(capture1);
expect(mockContext.$addRoot$).toHaveBeenCalledWith(capture2);
expect(mockContext.$addRoot$).toHaveBeenCalledWith(capture3);
```

## Configuration Details

**Test File Patterns (vitest.config.ts):**
```typescript
include: [
  '**/*.spec.?(c|m)[jt]s?(x)',  // Matches .spec.ts, .spec.tsx, .spec.mts, etc.
  '**/*.unit.?(c|m)[jt]s?(x)',  // Matches .unit.ts, .unit.tsx, .unit.mts, etc.
  '!*/(lib|dist|build|server|target)/**',  // Exclude build outputs
  '!**/node_modules/**',
],
setupFiles: ['../vitest-setup.ts'],
projects: ['..'],  // Monorepo support
```

**Environment:**
- `test.root: 'packages'` - Tests run from packages directory
- Qwik Vite plugin enabled for optimizer support
- TypeScript path resolution configured

---

*Testing analysis: 2026-01-24*
