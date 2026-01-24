# Architecture

**Analysis Date:** 2026-01-24

## Pattern Overview

**Overall:** Lazy-Loading, Serializable Component Framework with Server-Driven Streaming SSR

**Key Characteristics:**
- Reactive primitives (Signals) drive all state changes and trigger component re-renders
- Components and event handlers are extracted into lazy-loadable QRL (Qwik URLs) chunks
- Server-side rendering outputs serializable state and references to lazy chunks
- Client hydration deserializes state and listens for events to load code on-demand
- Vnode-based rendering with DOM reconciliation and incremental streaming

## Layers

**Core Runtime (`packages/qwik/src/core`):**
- Purpose: Reactive component system, signal/store management, event handling, DOM rendering
- Location: `packages/qwik/src/core/`
- Contains: Components, lifecycle hooks, reactive primitives, JSX runtime, client-side rendering
- Depends on: Shared utilities, platform abstractions, serialization/deserialization
- Used by: Applications, server renderer, client runtime

**Server-Side Rendering (`packages/qwik/src/server`):**
- Purpose: Render components to HTML strings with serialized state and manifests
- Location: `packages/qwik/src/server/`
- Contains: SSR container, streaming HTML generation, vnode-to-HTML serialization, preloading strategies
- Depends on: Core runtime, manifests, platform abstractions
- Used by: Adapters, middleware, build tools

**Shared Utilities (`packages/qwik/src/core/shared`):**
- Purpose: Cross-cutting abstractions used by both client and server
- Location: `packages/qwik/src/core/shared/`
- Contains: QRL (lazy references), JSX runtime, serialization/deserialization, vnode types, error handling
- Depends on: Nothing (fundamental layer)
- Used by: Core runtime, server, client

**Client-Side Runtime (`packages/qwik/src/core/client`):**
- Purpose: Hydrate serialized state, listen for events, load code on-demand, reconcile DOM
- Location: `packages/qwik/src/core/client/`
- Contains: DOM container management, vnode reconciliation/diffing, event delegation
- Depends on: Core runtime, shared utilities, reactive primitives
- Used by: Browser runtime

**Reactive Primitives (`packages/qwik/src/core/reactive-primitives`):**
- Purpose: Signal-based reactivity with computed/async computed signals
- Location: `packages/qwik/src/core/reactive-primitives/`
- Contains: Signal interface, computed signal implementation, cleanup tracking, subscription system
- Depends on: Shared utilities, internal-api
- Used by: Core runtime, use-* hooks

**Use Hooks (`packages/qwik/src/core/use`):**
- Purpose: API surface for component state, effects, tasks, resources, event listeners
- Location: `packages/qwik/src/core/use/`
- Contains: useStore, useSignal, useTask, useVisibleTask, useResource, useContext, useOn, etc.
- Depends on: Core runtime, reactive primitives, shared utilities
- Used by: Components

**JSX/Components (`packages/qwik/src/core/shared/jsx` and `packages/qwik/src/core/shared/component.public.ts`):**
- Purpose: JSX runtime, component creation and execution
- Location: `packages/qwik/src/core/shared/jsx/` and `packages/qwik/src/core/shared/component.public.ts`
- Contains: JSX createElement, h(), Slot, Fragment, component$ factory
- Depends on: Shared utilities, QRL system
- Used by: Application code

## Data Flow

**Initial Page Load (Server-Side Rendering):**

1. Server receives HTTP request
2. Render phase:
   - `renderToString()` or `renderToStream()` invoked with component tree
   - `SSRContainer` created from manifest
   - Component executes with `$() => component$(...)` resolving to QRL
   - Signals created via `createSignal()` and stored in container's state array
   - Tasks/lifecycle hooks execute (useTask, useVisibleTask, useResource)
   - Vnode tree created and walked recursively
3. Serialization phase:
   - State array serialized with symbol references (QRL hashes)
   - HTML generated with embedded state in `<script q:container>` tags
   - Manifest references injected for dynamic imports
   - Preloader/backpatcher scripts added for resource optimization
4. Streaming:
   - HTML chunks streamed to client as components render
   - `StreamWriter.write()` called during vnode traversal

**Hydration (Client-Side Initialization):**

1. Browser parses HTML and qwikloader.ts runs
2. `qwikloader()` in `packages/qwik/src/qwikloader.ts` boots client:
   - Locates `<script q:container>` and deserializes state array
   - Parses attributes on elements to find component/event references
   - Creates `DomContainer` and reconstructs vnode tree from DOM
3. Deserialize phase:
   - `preprocessState()` inflates QRL references with manifest URLs
   - `wrapDeserializerProxy()` creates proxies for stores
   - `parseQRL()` converts QRL strings back to QRL objects
4. Event Listener Attachment:
   - `addEventListener()` attaches delegated listeners to container
   - QRL invoked via `qrl.resolve()` to load event handler code

**State Change (Reactivity):**

1. Signal value mutated: `signal.value = newValue`
2. Signal implementation notifies subscribers (tasks, computed signals, components)
3. Component subscriber queue updated, component flagged for re-render
4. Browser request frame available, `flushRender()` invoked:
   - Component re-executed with new props/signals
   - New vnode tree compared against old via `vnode_diff()`
   - DOM patches applied (add/remove/update attributes, classes, event handlers)
5. Computed signals recalculate, triggering cascading updates

**Task Execution:**

1. `useTask$()` or `useVisibleTask$()` registers a task with component
2. Task added to component's effects queue
3. On server: Task executes during render (synchronously)
4. On client:
   - Regular tasks execute after component render
   - Visible tasks execute when element becomes visible (IntersectionObserver)

## Key Abstractions

**Signal (Reactive Primitive):**
- Purpose: Represents reactive value with subscribers
- Examples: `packages/qwik/src/core/reactive-primitives/signal-api.ts`, `packages/qwik/src/core/use/use-signal.ts`
- Pattern: Value getter/setter triggers subscriber notifications; subscribers notified on change

**QRL (Qwik Resource Locator):**
- Purpose: Lazy-loadable, serializable reference to code/resources
- Examples: `packages/qwik/src/core/shared/qrl/qrl.public.ts`, `packages/qwik/src/core/shared/qrl/qrl-class.ts`
- Pattern: `$(...)` marked by optimizer → becomes `qrl('./chunk.js', 'exportName')` at build time

**Component:**
- Purpose: Reusable UI logic extracted into lazy chunks
- Examples: `packages/qwik/src/core/shared/component.public.ts`
- Pattern: `component$((props) => <JSX>)` → internal QRL to on-demand-loaded factory

**VNode (Virtual Node):**
- Purpose: Representation of DOM element or component in render tree
- Examples: `packages/qwik/src/core/shared/vnode/element-vnode.ts`, `packages/qwik/src/core/shared/vnode/virtual-vnode.ts`
- Pattern: Tree structure walked during render and SSR; diffed on client for DOM reconciliation

**Container (DOM/SSR):**
- Purpose: Root execution context holding state, component instances, listeners
- Examples: `packages/qwik/src/core/client/dom-container.ts`, `packages/qwik/src/server/ssr-container.ts`
- Pattern: Maintains state array, QRL function registry, subscriptions; bridges vnode tree to DOM/HTML

**Store:**
- Purpose: Reactive object tracking property mutations
- Examples: `packages/qwik/src/core/use/use-store.public.ts`
- Pattern: `useStore({ count: 0 })` → proxy with property setters that notify subscribers

## Entry Points

**Client Runtime (`packages/qwik/src/qwikloader.ts`):**
- Location: `packages/qwik/src/qwikloader.ts`
- Triggers: Script executed in browser after HTML parsed
- Responsibilities: Deserialize state, set up event listeners, initialize client container

**Server Entry (`packages/qwik/src/server/index.ts`):**
- Location: `packages/qwik/src/server/index.ts`
- Triggers: Application calls `renderToString()` or `renderToStream()`
- Responsibilities: Render component tree, generate HTML/manifest, handle streaming

**Core Entry (`packages/qwik/src/core/index.ts`):**
- Location: `packages/qwik/src/core/index.ts`
- Triggers: Application imports from `@qwik.dev/core`
- Responsibilities: Export component$, hooks (useStore, useTask, etc.), JSX runtime

**Optimizer Integration:**
- Driven by: Build system (Vite plugin in `packages/qwik/src/optimizer/`)
- Location: `packages/qwik/src/optimizer/`
- Responsibilities: Transform `$()` to QRL, extract components into chunks, generate manifest

## Error Handling

**Strategy:** Try-catch with error boundary support and structured error codes

**Patterns:**
- `QError` enum in `packages/qwik/src/core/shared/error/error.ts` for framework errors
- `ErrorBoundary` component in `packages/qwik/src/core/shared/error/error-handling.ts` catches and displays errors
- Recoverable errors logged; unrecoverable errors halt rendering
- Development: Full stack traces; Production: Minimal error codes

## Cross-Cutting Concerns

**Logging:** Console methods (console.log, console.error) with conditional compilation based on `qDev` flag in `packages/qwik/src/core/shared/utils/qdev.ts`

**Validation:** Type-checked at compile time via TypeScript; runtime assertions in development via `assert*` functions in `packages/qwik/src/core/shared/error/assert.ts`

**Authentication:** Custom implementation per app; no built-in auth (see `packages/qwik-auth/` for optional helpers)

**Serialization:** Custom serializers via `useSerializer$()` in `packages/qwik/src/core/use/use-serializer.ts`; handles symbols, maps, dates

---

*Architecture analysis: 2026-01-24*
