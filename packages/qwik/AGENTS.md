# LLM Context Guide for Qwik Core Development

**Purpose**: This document captures lessons learned and important patterns for LLMs (and developers) working on the Qwik core package (`packages/qwik`). Update this file as you learn new patterns or encounter challenges.

---

## Architecture Overview

### Signal System

- **Hierarchy**: `SignalImpl` → `ComputedSignalImpl` → `AsyncSignalImpl`
- **Key Components**:
  - `SignalImpl`: Base reactive signal with value and subscribers
  - `ComputedSignalImpl`: Signal computed from other signals or QRLs
  - `AsyncSignalImpl`: Signal for async operations with `loading` and `error` properties
  - Each signal type has impl and public interface files

### File Organization

```
packages/qwik/src/core/
├── reactive-primitives/
│   ├── impl/               # Implementation classes
│   │   ├── signal-impl.ts
│   │   ├── computed-signal-impl.ts
│   │   ├── async-signal-impl.ts
│   │   └── signal.unit.tsx # Tests for all signal types
│   ├── signal.public.ts    # Public interfaces and exports
│   ├── signal-api.ts       # Factory functions (createSignal, createAsync$, etc)
│   └── types.ts            # Core type definitions
└── ...
```

---

## Key Patterns & Best Practices

### 0. ALWAYS test IMMEDIATELY after implementation

**CRITICAL**: After making ANY code changes to implementation files, IMMEDIATELY run the relevant unit tests before doing anything else. This is not optional.

**Workflow**:

1. Make code changes to implementation
2. **IMMEDIATELY** run `pnpm vitest run <test-file-path>` (do NOT wait to be asked)
3. If tests fail, fix issues and re-run tests
4. Only after tests pass, proceed with other tasks (documentation, etc.)

**Test file locations**:

- Unit tests: `*.unit.tsx?` files (for logic/API tests)
- Integration tests: `*.spec.tsx?` files (for SSR and DOM rendering)

**Why this matters**:

- Catches issues immediately while context is fresh
- Prevents cascading failures in dependent code
- Validates that changes work as intended
- Much faster iteration than waiting for CI

**Example**: After modifying `async-signal-impl.ts`, immediately run:

```bash
pnpm vitest run packages/qwik/src/core/reactive-primitives/impl/signal.unit.tsx
```

### 1. Constructor Parameters Flow

When adding new parameters to signal constructors:

- **Don't break the parent constructor call**: The constructor parameter order matters
- **Pattern**: `constructor(container, fn, flags, newParam = defaultValue)`
- **Extraction**: Extract options in factory functions before passing to constructor
  ```typescript
  // In signal-api.ts
  export const createAsyncSignal = <T>(
    qrl: QRL<...>,
    options?: ComputedOptions
  ): AsyncSignalImpl<T> => {
    return new AsyncSignalImpl<T>(
      options?.container || null,
      qrl as AsyncQRL<T>,
      getComputedSignalFlags(options?.serializationStrategy || 'never'),
      (options as any)?.interval || 0  // Extract custom option here
    );
  };
  ```

### 2. Async Signal Implementation Pattern

When modifying AsyncSignalImpl:

- **Promise handlers**: Both `.then()` and `.catch()` need the same side effects
- **Cleanup on invalidate**: Clear all timeouts/resources in the `invalidate()` override BEFORE clearing cached data
  ```typescript
  override invalidate() {
    // Clean up resources first
    if (this.$pollTimeoutId$ !== undefined) {
      clearTimeout(this.$pollTimeoutId$);
      this.$pollTimeoutId$ = undefined;
    }
    // Then clear cached data
    this.$promise$ = null;
    super.invalidate();
  }
  ```

### 3. Platform Detection (SSR vs Browser)

- **Import**: `import { isBrowser } from '@qwik.dev/core/build'`
- **Pattern**: Always store configuration on instance, only execute browser-specific code when needed

  ```typescript
  // Store poll interval always (for SSR hydration)
  this.interval = interval;

  // But only schedule timeouts on browser
  if (isBrowser && this.$interval$ > 0 && this.$effects$?.size) {
    this.$pollTimeoutId$ = setTimeout(...);
  }
  ```

### 4. Testing Async Signals

**Always use `$`-suffixed functions** (like `$()`) in tests whenever possible. The optimizer will handle them correctly before test execution.

```typescript
// ✅ CORRECT - use $() for QRL functions in tests
const signal = await retryOnPromise(() =>
  createAsync$(
    $<() => Promise<number>>(async () => {
      return 42;
    }),
    { interval: 50 } as any
  )
);
```

**Important**: If you get serialization errors when using `$()`, it means the closure is capturing variables that cannot be serialized. In that case:

- Extract the logic to a top-level function
- Use a different approach that doesn't require closure capture
- Check what variable is causing the issue (error message will indicate it)

**Test Pattern**:

```typescript
it('description', async () => {
  await withContainer(async () => {
    const signal: AsyncSignal<number> = await retryOnPromise(() =>
      createAsync$(
        $<() => Promise<number>>(async () => {
          return 42;
        }),
        { interval: 50 } as any
      )
    );

    // Subscribe to trigger computation
    await retryOnPromise(() => {
      effect$(() => signal.value);
    });

    // Verify internal state (use as any for private members)
    expect((signal as any).$interval$).toBe(50);
  });
});
```

**Avoid**: Creating QRLs explicitly with `inlinedQrl()` or other manual QRL construction. Let the `$` optimizer do the work.

---

## Lessons Learned (Concise)

### Lesson 1: Promise Throws on First Computation

**Context**: When a signal first computes and returns a promise, it throws the promise to trigger Suspense-like behavior.

**Pattern**:

```typescript
if (isFirstComputation) {
  // throw the promise on first read so component waits for it
  throw promise;
} else {
  // on subsequent computations, return stale value while computing
  return currentValue;
}
```

**Implication**: Tests must use `await retryOnPromise()` when first reading a signal, or wrap creation in it.

### Lesson 2: Effect Subscriptions Control Polling

**Context**: The `$effects$` Set tracks all subscribers to a signal.

**Pattern**:

```typescript
// Only poll when there are active subscribers
if (isBrowser && this.$interval$ > 0 && this.$effects$?.size) {
  // Schedule poll
}
```

**Implication**: Polling automatically stops when subscribers drop to zero—no explicit cleanup needed for that case.

### Lesson 2b: Use the `interval` Accessor for Poll Updates

**Context**: `AsyncSignalImpl` exposes a public `interval` property that clears/reset polling and re-schedules immediately when there are consumers.

**Pattern**:

```typescript
// Clears any existing timeout, updates value, and schedules only if there are effects
signal.interval = 100;
```

**Implication**: Use the setter during hydration (`inflate`) or construction to ensure polling starts as soon as consumers are present.

### Lesson 3: Timeout Cleanup is Critical

**Context**: Setting timeouts without cleanup causes memory leaks and test interference.

**Pattern**:

```typescript
// Always clear before setting new timeout
if (this.$pollTimeoutId$ !== undefined) {
  clearTimeout(this.$pollTimeoutId$);
}
this.$pollTimeoutId$ = setTimeout(...);

// Clear in cleanup paths too
override invalidate() {
  if (this.$pollTimeoutId$ !== undefined) {
    clearTimeout(this.$pollTimeoutId$);
    this.$pollTimeoutId$ = undefined;
  }
  // ... rest of cleanup
}
```

### Lesson 12: Abort Signals & Immediate Abort

**Context**: Async computations can expose `abortSignal` and should be aborted as soon as cleanup is requested.

**Pattern**:

```typescript
// In AsyncSignalImpl
abort() {
  if (this.$current$) {
    this.$requestCleanups$(this.$current$); // aborts immediately in requestCleanups
  }
}

// In user code - use abortSignal from context instead of creating AbortController
const data = useAsync$(async ({ track, abortSignal }) => {
  const query = track(querySignal);
  // Pass abortSignal directly to fetch - it's automatically aborted on re-run
  const res = await fetch(`/api?q=${query}`, { signal: abortSignal });
  return res.json();
});
```

**Implication**:

- `abort()` triggers abort immediately (before waiting for task promise)
- `abortSignal` is lazily created per job
- **User code should use the `abortSignal` parameter from AsyncCtx**, not create their own AbortController
- The signal is automatically aborted when the computation re-runs or is cleaned up

**Error Handling with abortSignal**:

```typescript
// ✅ CORRECT - properly handle fetch errors
const data = useAsync$(async ({ track, abortSignal }) => {
  const query = track(querySignal);

  const response = await fetch(`/api?q=${query}`, { signal: abortSignal });

  // Check if response is ok (not 4xx/5xx)
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }

  return response.json();
});
```

**Why**: The async function MUST throw if it cannot provide a valid result. This includes:

- Fetch aborted (throws DOMException automatically)
- Network errors (throws automatically)
- HTTP errors (must check `response.ok` and throw manually)
- JSON parsing errors (throws automatically)

Errors are caught by `useAsync$` and stored in `.error`, while `.value` retains its previous/initial value.

**Debouncing Pattern**:

```typescript
// Inline debounce with automatic cancellation
const results = useAsync$(
  async ({ track, abortSignal }) => {
    const query = track(searchInput);

    // Wait for debounce period - if re-run, this is canceled via abort
    await new Promise((resolve) => setTimeout(resolve, 150));

    const response = await fetch(`/api/search?q=${query}`, { signal: abortSignal });
    if (!response.ok) throw new Error(`Search failed: ${response.statusText}`);
    return response.json();
  },
  { initial: [] }
);
```

**Why**: When the tracked signal changes during the debounce timeout, the entire async function is aborted and restarted, providing automatic debounce cancellation without external debounce utilities.

### Lesson 4: Options Passing Strategy

**Context**: Qwik uses `ComputedOptions` for configuration, but `AsyncSignalOptions` extends it with more options.

**Challenge**: TypeScript won't recognize custom options on `ComputedOptions`.

**Solution**: Extract in factory function using `(options as any)?.customOption`:

```typescript
export const createAsyncSignal = <T>(
  qrl: QRL<...>,
  options?: ComputedOptions  // Use base type
): AsyncSignalImpl<T> => {
  return new AsyncSignalImpl<T>(
    options?.container || null,
    qrl as AsyncQRL<T>,
    getComputedSignalFlags(options?.serializationStrategy || 'never'),
    (options as any)?.poll || 0  // Access custom property with 'as any'
  );
};
```

### Lesson 5: Both Promise Branches Need Handler

**Context**: Async functions can either resolve or reject.

**Pattern**: Both `.then()` and `.catch()` must schedule next poll:

```typescript
const promise = untrackedValue
  .then((promiseValue) => {
    // ... handle success
    this.$scheduleNextPoll$(); // Schedule next poll
  })
  .catch((err) => {
    // ... handle error
    this.$scheduleNextPoll$(); // Still schedule next poll!
  });
```

**Implication**: Errors don't stop polling—polls continue on the configured interval.

### Lesson 6: Signal Props Naming Convention

**Context**: When passing signals as props to components, follow the `bind:` prefix convention.

**Pattern**:

```typescript
// Parent component
export const Parent = component$(() => {
  const count = useSignal(0);
  return <Child bind:count={count} />;
});

// Child component - use bind:name convention
interface ChildProps {
  'bind:count': Signal<number>; // Quoted to allow colon in property name
}

export const Child = component$<ChildProps>(
  ({ 'bind:count': count }) => {
    return (
      <>
        <div>{count.value}</div>
        <button onClick$={() => count.value++}>Increment</button>
      </>
    );
  }
);
```

**Why**: The `bind:` prefix signals to readers that this is a two-way binding to a signal, making the reactive relationship clear.

**Implication**: Always use `bind:signalName` when passing signals as props, and properly type them as `Signal<T>` in the props interface.

### Lesson 6b: Test Helper Patterns

**Key Helpers in signal.unit.tsx**:

- `withContainer(fn)`: Wraps test code with proper invoke context
- `effect$(qrl)`: Creates a reactive effect that subscribes to signals
- `retryOnPromise(fn)`: Waits for all pending promises to resolve
- `flushSignals()`: Flushes the container's render promise

**Track Usage**: `track()` accepts signals, stores, and functions:

```typescript
// ✅ Preferred: pass signal directly
const value = track(mySignal);

// ✅ For stores: pass store with property name
const value = track(store, 'propertyName');

// ⚠️ Avoid: wrapping in a function (less efficient)
const value = track(() => mySignal.value);
```

**Pattern**:

```typescript
await withContainer(async () => {
  // Create signal
  const signal = await retryOnPromise(() => createAsync$(...));

  // Subscribe
  const log: number[] = [];
  effect$(() => log.push(signal.value));

  // Verify
  expect(log).toEqual([1]);
});
```

### Lesson 7: SSR vs Client Regressions are Distinct

**Context**: SSR and client regressions can diverge; fix the failing path rather than “balancing” both.

### Lesson 8: Client Render Queue Must Resolve Promptly

**Context**: The client-side render queue (`cursor-queue.ts`, `cursor-walker.ts`) manages async rendering via promises.

**Pattern**:

```typescript
// In cursor-queue.ts - Promise created when cursors added
container.$renderPromise$ ||= new Promise((resolve) => {
  container.$resolveRenderPromise$ = resolve;
});

// In cursor-walker.ts - Must resolve when queue drains
if (container.$cursorCount$ === 0) {
  container.$resolveRenderPromise$?.();
}
```

**Critical Issue**: If `$resolveRenderPromise$` is never called, the promise hangs and renders stall.

### Lesson 9: Conditional Promise Await Can Break Render Flow

**Context**: When conditionally awaiting `$renderPromise$`, ensure the condition properly reflects render state.

**Anti-Pattern**:

```typescript
// DON'T unconditionally await
await container.$renderPromise$;

// DON'T await only when cursors exist (this may miss final resolution)
if (container.$cursorCount$ > 0) {
  await container.$renderPromise$;
}
```

**Better Pattern**: Let the render walker manage promise resolution:

```typescript
// Only explicitly await if you're coordinating final render completion
// Otherwise, cursor-walker.ts will resolve automatically
if (container.$renderPromise$ && someSpecialCondition) {
  await container.$renderPromise$;
}
```

**Implication**: The cursor system is designed for automatic resolution. Additional await points can interfere with timing.

### Lesson 10: Always run required validations

**Context**: After implementing features, missing required validation steps can hide regressions and break CI.

**Required validations for core changes**:

1. `pnpm build --qwik --qwikrouter --dev`
2. `pnpm run test.e2e.chromium`
3. `pnpm api.update`

**Recent Example**: `pnpm api.update` surfaced a TypeScript error in `allocate.ts` after changing `AsyncSignalImpl` constructor parameters. The fix was to pass an options object instead of a number.

**Implication**: Always run all three validations before finishing and report their results.

---

### Lesson 11: QRL Serialization and Variable Capture in Tests (Feb 7, 2026)

**Context**: When using `$()` in tests to create QRLs, any variables captured from the outer scope become const in the serialized closure.

**Problem**: Code like this fails:

```typescript
let cleanupCalls = 0;
const signal = createAsyncQrl(
  $(async ({ cleanup }: AsyncCtx) => {
    cleanup(() => {
      cleanupCalls++; // ❌ Assignment to constant variable
    });
  })
);
```

**Solution**: Use an object ref pattern for mutable state:

```typescript
const ref = { cleanupCalls: 0 };
const signal = createAsyncQrl(
  $(async ({ cleanup }: AsyncCtx) => {
    cleanup(() => {
      ref.cleanupCalls++; // ✅ Mutating object property works
    });
  })
);
expect(ref.cleanupCalls).toBe(1);
```

**Why**: The `$()` optimizer serializes closures, and captured primitives become const. Objects can be mutated, but the reference itself is const.

**Implication**: In tests using `$()`, always use object refs (`{ count: 0 }`) instead of primitives (`let count = 0`) when you need to mutate from within the closure.

### Lesson 13: Serialization Must Match Inflation (Feb 10, 2026)

**Context**: When adding new serializable fields to AsyncSignalImpl or other serialized types, both serialize.ts and inflate.ts must be updated with matching array positions.

**Pattern**:

```typescript
// In serialize.ts - add to output array
const eagerCleanup = value instanceof AsyncSignalImpl && value.$eagerCleanup$ ? true : undefined;
// ...
if (isAsync) {
  out.push(interval);     // position 7
  out.push(concurrency);  // position 8
  out.push(timeout);      // position 9
  out.push(eagerCleanup); // position 10
}

// In inflate.ts - match array positions exactly
const d = data as [
  AsyncQRL<unknown>,
  Map<...>,
  Array<...>,
  Array<...>,
  Array<...>,
  Error,
  unknown?,  // value
  number?,   // position 7 - interval
  number?,   // position 8 - concurrency
  number?,   // position 9 - timeout
  boolean?,  // position 10 - eagerCleanup
];
asyncSignal.$eagerCleanup$ = d[10] ?? false;
```

**Implication**: When adding new optional fields, always update both files and verify the array positions match. Test SSR/hydration scenarios to ensure serialization roundtrips correctly.

### Lesson 14: AsyncSignal Has Three Subscriber Sets (Feb 10, 2026)

**Context**: Unlike regular signals, async signals track subscriptions to `.value`, `.loading`, and `.error` separately.

**Pattern**: When checking if there are subscribers, check all three sets:

```typescript
private $hasSubscribers$(): boolean {
  return !!(
    (this.$effects$ && this.$effects$.size) ||           // .value subscribers
    (this.$loadingEffects$ && this.$loadingEffects$.size) ||  // .loading subscribers
    (this.$errorEffects$ && this.$errorEffects$.size)    // .error subscribers
  );
}
```

**Implication**: Operations that depend on subscriber presence (like eager cleanup or polling) must consider all three sets. The cleanup.ts `clearAsyncSignal` function must also remove from all three sets.

### Lesson 15: Unsubscribe Hook Point (Feb 10, 2026)

**Context**: To trigger actions when an async signal loses subscribers, hook into `clearAsyncSignal` in cleanup.ts.

**Pattern**:

```typescript
function clearAsyncSignal(producer: AsyncSignalImpl<unknown>, effect: EffectSubscription) {
  // Remove from all subscriber sets
  if (producer.$effects$?.has(effect)) {
    producer.$effects$.delete(effect);
  }
  if (producer.$loadingEffects$?.has(effect)) {
    producer.$loadingEffects$.delete(effect);
  }
  if (producer.$errorEffects$?.has(effect)) {
    producer.$errorEffects$.delete(effect);
  }

  // Trigger any cleanup logic when last subscriber removed
  producer.$scheduleEagerCleanup$();
}
```

**Why**: `clearAsyncSignal` is called from `clearEffectSubscription`, which is the central unsubscribe path for all signal types. This is the reliable place to detect when subscribers drop to zero.

**Implication**: Don't try to hook unsubscribe in signal.value setter or other indirect paths. Use the cleanup.ts infrastructure.

### Lesson 16: Macrotask Scheduling Pattern (Feb 10, 2026)

**Context**: When scheduling work for the next macrotask (after microtasks), use `setTimeout` with 0 delay.

**Pattern**:

```typescript
// Schedule for next macrotask
this.$eagerCleanupTimeoutId$ = setTimeout(() => {
  this.$eagerCleanupTimeoutId$ = undefined;
  // Recheck conditions before executing
  if (this.$hasSubscribers$()) {
    return;
  }
  this.abort();
}, 0);

// In Node.js environments, unref to avoid keeping process alive
this.$eagerCleanupTimeoutId$?.unref?.();
```

**Why**: Use `setTimeout` not `nextTick` or platform-specific utilities. This ensures:

- Consistent macrotask timing across environments
- Node.js compatibility with `.unref?.()`
- Correct execution order (after all microtasks)

**Implication**: Always recheck conditions in the macrotask callback, as state may have changed between scheduling and execution.

---

## Common Pitfalls & Solutions

| Pitfall                              | Solution                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Serialization errors in `$()`        | The closure is capturing non-serializable variables; refactor to avoid capture                                     |
| "Assignment to const" in `$()` tests | Use object refs (`{ count: 0 }`) instead of primitives (`let count = 0`) - see Lesson 11                           |
| Tests hang on promises               | Use `await retryOnPromise()` and `await withContainer()`                                                           |
| Timeout leaks in tests               | Clear timeouts in `invalidate()` and cleanup methods                                                               |
| Poll runs without subscribers        | Check `this.$effects$?.size > 0` before scheduling                                                                 |
| Polling on SSR breaks                | Check `isBrowser` before `setTimeout()`                                                                            |
| Can't access `$private$ members      | Use `(signal as any).$private$` in tests                                                                           |
| Effects don't run                    | Ensure `effect$()` is called within `withContainer()` and after signal creation                                    |
| API extractor complains              | Add `@internal` JSDoc tag to ALL function overloads, not just one                                                  |
| DOM render hangs                     | Check cursor queue promise resolution in cursor-walker.ts and cursor-queue.ts                                      |
| Conditional await blocks render      | Let cursor system resolve automatically; avoid competing await points                                              |
| Async signal tests throw on read     | Use `initial` value to safely subscribe via `.value` without triggering promise throws                             |
| Concurrent runs don't start          | Check that `invalidate()` is awaited and effects are subscribed to signal state                                    |
| Fetch with abortSignal doesn't throw | Always check `response.ok` and throw manually for HTTP errors (4xx/5xx)                                            |
| useAsync$ doesn't debounce           | Use inline `setTimeout` - abort automatically cancels when signal changes                                          |
| Vitest hangs in CI/agent runs        | Use the `run` command: `pnpm vitest run` or `timeout 120 pnpm vitest run`                                          |
| Serdes tests after API refactors     | Update serdes allocate/tests with the same version assumptions; no backward-compat needed in the same repo version |
| Async signal unsubscribe not working | Hook into `clearAsyncSignal` in cleanup.ts, check all three subscriber sets (see Lesson 14 & 15)                   |
| Macrotask timing issues              | Use `setTimeout(..., 0)` not `nextTick`, always recheck conditions in callback (see Lesson 16)                     |
| Serialization mismatch on hydration  | Array positions in serialize.ts and inflate.ts must match exactly (see Lesson 13)                                  |

---

## Implementation Checklist for Signal Features

When adding a feature to AsyncSignalImpl (like `eagerCleanup`):

- [ ] Add instance properties for storing the feature state
- [ ] Add constructor parameter with sensible default
- [ ] Extract option in `createAsyncSignal()` factory and pass to constructor
- [ ] Import `isBrowser` from `@qwik.dev/core/build` if browser-only
- [ ] If serializable: update both `serialize.ts` AND `inflate.ts` with matching array positions (see Lesson 13)
- [ ] If needs cleanup: add to `invalidate()` and `$destroy()` overrides
- [ ] If reacts to unsubscribe: hook into `clearAsyncSignal` in cleanup.ts (see Lesson 15)
- [ ] If checks subscribers: use `$hasSubscribers$()` to check all three sets (see Lesson 14)
- [ ] Handle both `.then()` and `.catch()` promise paths if async
- [ ] Use `setTimeout` for macrotask scheduling with condition recheck (see Lesson 16)
- [ ] Add unit tests covering:
  - [ ] Instance stores the option
  - [ ] Feature behavior works correctly
  - [ ] Cleanup works correctly
  - [ ] SSR hydration compatibility (if serialized)
- [ ] **RUN TESTS IMMEDIATELY**: `pnpm vitest run <test-file>` (DO NOT proceed without passing tests)
- [ ] Fix any test failures and re-run until all pass
- [ ] Consider error handling paths
- [ ] Verify no memory leaks in tests
- [ ] Clear all timeouts in cleanup methods

---

## Build & Test Commands

```bash
# ALWAYS run tests immediately after making changes (Pattern 0)
pnpm vitest run packages/qwik/src/core/reactive-primitives/impl/signal.unit.tsx

# Run tests for a specific file
pnpm vitest run <path-to-test-file>

# Watch mode for iterative development
pnpm vitest watch <path-to-test-file>

# End-to-end validation (run when task is complete)
pnpm build --qwik --qwikrouter --dev
pnpm run test.e2e.chromium

# API/type verification (slow; run when necessary or when task is complete)
pnpm api.update

# Build full project (slow, ~2-3 min)
pnpm build.full

----

## Questions for Future LLMs
attrs.push('q-d:qidle', qrlStr);
```

---

## Questions for Future LLMs

When working on qwik/src/core:

1. **Did you run tests immediately after your changes?** If not, stop and run them now.
2. Is the change in a signal-related class? Use existing signal patterns.
3. Does it involve promises/async? Handle both resolve and reject paths.
4. Does it use browser APIs? Check `isBrowser` before executing.
5. Adding to constructor? Update factory functions too.
6. Browser cleanup needed? Add to `invalidate()` override.
