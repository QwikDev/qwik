# Native SSR Engine — Spec Index

Goal: the compiler's only SSR output becomes a language-neutral **plan**; every rendering engine
— including the JS backend — is a **code generator** over that plan. Native engines
(Rust reference, then independent Go/Zig implementations) generate server binaries that render
**byte-identical** output to today's emitted-JS SSR, with **no JS runtime and no WASM**. The
browser client (qwikloader + resume) is unchanged and cannot tell which engine rendered the page.

Terminology: this effort is the **"native SSR engine"**. It is unrelated to
`../TARGET_NATIVE_HANDOFF.md`'s "target-native", which means no-VNode emission.

## Specs

| spec                                                                   | kind    | contents                                                                                                  |
| ---------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| [01-ssr-plan-format.md](./01-ssr-plan-format.md)                       | design  | plan schema, canonical JSON, versioning, link step, `Reactive` pairing, `sync$` carriage                  |
| [02-expression-ir.md](./02-expression-ir.md)                           | design  | `ValueIR` nodes, lambdas, `defs`, core-vs-internal-plugin split, v1 op set                                |
| [03-setup-opcodes.md](./03-setup-opcodes.md)                           | design  | `SetupOp` set, `TaskBody` statement IR, scheduling semantics                                              |
| [04-state-serialization.md](./04-state-serialization.md)               | freeze  | the serdes byte contract: TypeIds, constants, traversal, micro-optimizations, QRL encoding, state scripts |
| [05-wire-contract.md](./05-wire-contract.md)                           | freeze  | escaping, markers, `q:id`, event attributes, container, assembly order, streaming packets                 |
| [06-js-semantics-profile.md](./06-js-semantics-profile.md)             | freeze  | numbers, `toFixed`, JSON bytes, coercion, equality, nondeterminism rules                                  |
| [07-native-engine-architecture.md](./07-native-engine-architecture.md) | design  | generator + runtime core + internal plugins; request lifecycle; non-responsibilities                      |
| [08-conformance.md](./08-conformance.md)                               | design  | Layer 0/A/B harness, determinism seam, resume-level verification, CI                                      |
| [09-compiler-plugins.md](./09-compiler-plugins.md)                     | design  | internal + user plugins, claims, emission, diagnostics, loader host contract                              |
| [10-platform-projections.md](./10-platform-projections.md)             | outlook | projection layering guard; native-UI interaction/resume model; host shells (e.g. Tauri) tiering           |

"Freeze" specs document existing shipped behavior as the cross-engine contract — on any conflict
with the code, the code wins and the spec is corrected. "Design" specs describe the approved
direction ahead of implementation. "Outlook" specs are forward-looking notes that guard future
options; nothing in them is scheduled.

## Key decisions

- One canonical plan; **every engine is a code generator — nothing interprets at request time**.
  The JS backend stays JIT-fast because `emit-ssr.ts` keeps emitting specialized JS, just from
  the IR instead of source-text slices.
- **Minimal runtime core + internal plugins**: JS stdlib/host objects (`URL`, `fetch`, `Date`,
  string/array methods, …) are default plugins claiming the `qwik:` namespace — same API as user
  plugins. Extending the surface never grows the core.
- Everything `@qwik.dev/core` / `@qwik.dev/router` express compiles under `nativeTarget` with
  **zero user plugins**. User plugins (claiming imported symbols, emitting target-language
  source) cover custom functions/libraries; anything else is a compile error.
- **The JS server always keeps working** during migration: unlowered sites ride as
  `js-fallback`/`op:'js'` nodes only the JS generator accepts.
- Go/Zig are **independent pure implementations** proven by the conformance suite (no C-ABI/cgo).
  The target space is **open**: `nativeTarget` is an opaque key, and community engines for any
  language qualify by implementing the specs and passing the conformance harness.
- `sync$` is supported natively (compile-time-known source strings, emitted verbatim, never
  executed server-side). Event handlers never run server-side.

## Migration phases (each lands green on existing suites)

0. **Freeze + determinism** — validate/complete specs 04/05/06 against the code; test-only
   `instanceHash`/id-seed seam in `RenderToStreamOptions`; Layer-0 corpora + harness scaffold.
1. **Expression IR (additive)** — `expr-ir.ts` + `expr-lower.ts`; optional `ir` on `ValuePlan`;
   emitters ignore it; snapshots unchanged; coverage-ratio metric begins.
2. **Setup opcodes (additive)** — `setup-lower.ts` producing `SetupOp[]`/`TaskBody` beside the
   existing plans; snapshots unchanged.
3. **Plan emission + link** — `emit-plan.ts` module plans; link step in `packages/qwik-vite`
   emitting `<entry>.qwik-ssr-plan.json` behind a flag; plan goldens.
4. **Plan-driven JS emission + reference interpreter** — `emit-ssr.ts` derives expression/setup
   emission from the IR (byte-identical, snapshot-guarded); testing-only plan interpreter as
   executable spec + cross-check.
5. **Native target mode** — `nativeTarget` escalates fallbacks to errors; plugin claims +
   coverage validation; per-entry native-readiness report; starters compile clean with zero user
   plugins.
6. **Rust reference engine** — `packages/qwik/native/rust` (`qwik` core + `qwik-ssr-std`
   internal plugins + `qwik-ssr-gen`); conformance-driven build order; resume-session against
   Rust-rendered output.
7. **Go and Zig engines** — independent implementations, same harness and CI gate.
8. **Delete source-text splicing** from SSR emit — all SSR emission derives from the plan IR
   alone. CSR emission stays emitted-JS forever.

The full background (exploration findings, the markless reference architecture this was derived
from, and per-phase verification detail) lives in the approved planning document for this effort.
