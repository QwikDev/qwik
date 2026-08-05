# 10 — Platform Projections (Outlook)

Status: outlook (forward-looking; NOT part of the current native SSR engine effort). This note
exists so decisions made in phases 1–8 don't accidentally close doors. Nothing here is scheduled.

## The layering guard (the one rule that matters now)

The SSR plan ([01-ssr-plan-format.md](./01-ssr-plan-format.md)) is an **HTML-target projection**
of the compiler's semantic `RenderPlan`: it pre-escapes and flattens static runs into HTML
strings and carries the web wire contract. Platform-UI targets (iOS, Android, desktop native)
would be **sibling projections of `RenderPlan`**, not consumers of the SSR plan.

`RenderPlan` is already target-neutral (no HTML strings, no DOM paths — enforced today). Keep it
that way: during phases 1–8, HTML-specific decisions must stay in the SSR lowering/link layer and
never leak up into `RenderPlan`, `ValueIR`, `SetupOp`, or `SegmentMeta` — those are the shared
layers every future projection reuses.

There is no privileged core language anywhere in this architecture: **the plan formats are the
only contracts**; engines (Rust/Go/Zig/JS/…) are peer generator outputs, and hosts pair with
whichever engine output matches their language.

## What a native-UI projection would reuse unchanged

- `ValueIR`, `SetupOp`, `TaskBody`, `defs` — the language-neutral component semantics.
- The generator-per-target pattern (no interpreter, no JS runtime) and the conformance
  methodology; the JS-semantics profile ([06](./06-js-semantics-profile.md)) applies verbatim to
  expression evaluation on device.
- The internal-plugin mechanism — platform capabilities (camera, haptics, notifications) are
  platform plugin namespaces; the core never grows.
- Stable symbol hashes and capture encoding from `SegmentMeta`/`QrlRef`, and the serdes **value
  encoding** from [04](./04-state-serialization.md) (without the HTML script wrapping).

What does NOT transfer: the wire contract ([05](./05-wire-contract.md)) and the state-script
format — resumability-over-HTML is web-specific.

## Interaction model on native UI (no browser, no JS)

Web resumability exists because the browser is programmed at runtime by downloading JS. On a
device the handlers are compiled into the binary, so "resume" changes meaning: skip setup
re-execution and bind interaction to already-materialized UI.

- **Handlers**: handler segments lower through the same IR (`TaskBody`/`ValueIR`, plugins for the
  rest) and compile into a **handler table keyed by the existing stable symbol hash**. A "QRL"
  degenerates from `chunk#symbol#captures` (a URL) to `symbol-hash + capture refs` (a table
  index) — the same shape sync QRLs already use via `qFuncs`. Captures restore from serialized
  state roots.
- **Events**: listener sites stay data (views tagged with handler ids) dispatched centrally,
  with a per-platform **semantic event mapping** (`touchUpInside`/Compose `onClick` → `click`,
  text change → `input`, …). Wiring-as-data is what lets a server-rendered screen arrive with
  its wiring attached.
- **Updates**: each dynamic site compiles to a generated native patch function (set a label's
  text, recompose a node); a **live reactive graph** — which the SSR core deliberately lacks —
  invokes them on state writes. Same subscription records, native targets.
- **Resume**: a server engine can render the native-UI projection into a **view-descriptor
  tree plus state payload** (serdes value encoding; locators as view-tree paths). The device
  materializes views, restores slots, binds handlers by hash — without executing setup. The same
  machinery covers process-death restoration and navigation-state handoff.
- **View vocabulary**: don't force one UI tree onto every platform. Share the state/logic/
  expression model; allow platform-specific view templates per route rather than mapping HTML
  tags to widgets.

## Host shells — the cheap tier before native UI

A **host shell** is an app that embeds an engine's generated output and gives it a display
surface. Example: **Tauri** (stable, Linux/macOS/Windows/Android/iOS) — a shell written in Rust,
so it naturally embeds the **Rust engine's output**: a custom protocol handler routes webview
navigation to the embedded engine, routes render on-device, and the webview receives ordinary
Qwik HTML. The entire unchanged web contract applies (qwikloader, `qwik/state`, resume); JS
chunks load instantly from bundled assets; loaders/actions/device APIs implement the host
handler registry ([09](./09-compiler-plugins.md)) backed by the shell's plugin ecosystem.

Tauri has no special status: it is one host for one engine output. A Go host embeds the Go
output; a future Swift engine could pair with a plain SwiftUI shell. The recommended sequencing:

1. **Now** — the native SSR engine effort as specced (phases 0–8), unchanged.
2. **Cheap next** — a host-shell integration (e.g. a Tauri crate wrapping the Rust output):
   desktop + mobile apps with native engine logic and web UI, at marginal cost.
3. **Later, if native look/feel is demanded** — the full native-UI projection above (per-platform
   generators, live graph, view templates). Tier 2 does not preclude it.

The honest limitation of tier 2: web UI in a webview — native capabilities, not native widgets.
