# 07 — Native Engine Architecture

Status: design (approved direction, pre-implementation). See [specs/README.md](./README.md).

## Shape: generator + runtime core + internal plugins — no interpreter

Each target language ships, in that language:

1. **`qwik-ssr-gen` — the generator** (build-time tool). Input: a linked
   `<entry>.qwik-ssr-plan.json` ([01-ssr-plan-format.md](./01-ssr-plan-format.md)) plus
   plugin-emitted source files. Output: generated source compiled into the server binary —
   - one straight-line function per component mirroring `setup[]`/`render[]`: static HTML runs
     become string literals; `ValueIR` compiles to native expressions over the runtime's
     JS-semantics `Value` type (inlined — no dispatch table on the hot path); setup ops become
     slot declarations + runtime calls; QRL sites become attribute-string emission +
     capture-root registration. This is the direct analogue of what `emit-ssr.ts` emits in JS.
   - the plugin dispatch module (e.g. `generated/plugin_fns.rs`): all internal- and user-plugin
     function sources plus a match-based dispatcher for lambda-carrying/dynamic call sites.
   - a project manifest fragment (e.g. Cargo dependencies merged from plugin `dependencies`).
2. **`qwik-ssr-rt` — the runtime core** the generated code calls. Deliberately minimal
   (user-confirmed): the core contains only the irreducible engine. All call-shaped JS surface —
   string/array methods, `URL`, `fetch`, `Date`, `JSON`, `Math` — lives in **internal plugin
   crates** (e.g. `qwik-ssr-std`) registered through the same mechanism as user plugins
   ([09-compiler-plugins.md](./09-compiler-plugins.md)). Needing more surface later means
   writing another internal plugin, never growing the core.

Nothing interprets the plan at request time on any target. The JS backend follows the same
shape: `emit-ssr.ts` is the JS generator and `@qwik.dev/core`'s SSR helpers are its runtime core.

## Runtime core modules (Rust reference; build order = dependency order)

| module      | responsibility                                                                                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jsvalue`   | `Value` model per [06](./06-js-semantics-profile.md): f64, UTF-16 strings, JS-property-order objects, Date, Opaque                                                                                                                                 |
| `jsnum`     | ECMA `Number::toString` (ryu-js-equivalent)                                                                                                                                                                                                        |
| `escape`    | the five-char `escapeHTML` (`& < > " '`), attribute rules, script-content escaping                                                                                                                                                                 |
| `state`     | signal/store/const slots; **lazy computeds with dirty flags** (no live effect graph server-side); context scope stack; task queue; **subscription recording during render** — the `addRoot`/`setRef`/`eventAttr` half of the JS `SsrRenderContext` |
| `output`    | chunk writer (strings, late-bound node-id/root-ref chunks, records) in document order; per-request `q:id` counter; markers per [05](./05-wire-contract.md)                                                                                         |
| `scheduler` | request-local lanes; tasks settle before serialization; per-boundary Suspense lanes; async via the `HostIo` trait                                                                                                                                  |
| `serdes`    | the byte-compatible port of [04](./04-state-serialization.md)                                                                                                                                                                                      |
| `scripts`   | `qwik/state` chunking, `_qwikEv`, container attributes incl. `q:instance`, `qFuncs` emission                                                                                                                                                       |
| `stream`    | sequential base rendering; Suspense packets (`<template q:s>` + `_qwikS` + `_qwikB`), parent-gated ordering                                                                                                                                        |
| `router`    | `ParsedPathname` route matching (already declarative in `qwik-router` buildtime); loader-data injection by `__id`; status/redirect plumbing                                                                                                        |
| `host`      | embedding trait: async executor hookup, manifest provider (`q-manifest.json` mapper), loader/action handler registry, plugin context                                                                                                               |

## Request lifecycle (normative)

1. Host matches the route, runs middleware/loader/action handlers it owns, and hands the engine a
   request context: server data, locale, base URL, manifest mapper, loader results keyed by
   loader `__id`.
2. Engine executes the entry component's generated function: setup ops populate slots and enqueue
   tasks; render ops write chunks while recording subscriptions and serialization roots.
3. Scheduler lanes settle (tasks re-run on tracked writes until quiescent — same semantics as the
   JS `SsrScheduler`).
4. Container assembly and script emission per [05](./05-wire-contract.md) order.
5. Streaming: unresolved Suspense boundaries render fallbacks; settled boundaries append packets;
   re-evaluation only touches lane-owned state (render remains a pure function of slots +
   settled results, which makes repeated evaluation safe).

## Explicit non-responsibilities

The native engine does NOT:

- run or embed JavaScript, or interpret anything at request time;
- execute event handlers or `sync$` functions (it emits their compile-time-known strings only);
- resolve or bundle chunks beyond the manifest `hash → chunk` lookup;
- implement `routeLoader$`/`routeAction$`/middleware bodies (host territory, see
  [09](./09-compiler-plugins.md));
- render CSR or produce client JS of any kind;
- implement reactivity. SSR is single-pass: signals/stores/computeds are a **data model**
  (current value, tracked reads, subscriber records for serialization, one-shot computed
  caching) — invalidation, propagation, and effect scheduling exist only in the browser
  client. Proven by the Rust runtime passing Layer A with exactly this model. Consequence:
  the eventual JS _server_ runtime needs the same lean model, not the client core — the
  Phase-8 end state where the JS backend is just another engine sheds the client's reactive
  machinery from server bundles entirely.

## Independent implementations

Go and Zig ship independent generator + runtime implementations of specs 01–06 (user-confirmed:
no C-ABI/cgo delivery path). **The target space is open**: an engine for any language — community
or first-party — plugs in the same way: implement specs 01–06, pick a target key
([09-compiler-plugins.md](./09-compiler-plugins.md)), pass the conformance harness. There is no
central approval; the harness is the gatekeeper. The plan format is the only cross-language
contract; the conformance harness ([08-conformance.md](./08-conformance.md)) is what keeps all
implementations byte-identical. Layer-0 corpora exist precisely because the three risky areas (number formatting,
JSON property order, serdes traversal order) would otherwise silently diverge per language. A C
ABI over the Rust engine remains a possible later add-on for embedding in further languages —
not the Go/Zig path.
