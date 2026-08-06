# 09 — Compiler Plugins

Status: design (approved direction, pre-implementation). See [specs/README.md](./README.md).

## Two plugin kinds, one mechanism

- **Internal (default) plugins** ship with every engine and claim the reserved `qwik:` op
  namespace. The compiler lowers method/global calls to these ops from typed-receiver and global
  analysis (not imports). They implement the JS stdlib/host-object surface
  ([02-expression-ir.md](./02-expression-ir.md) lists the v1 set). The runtime core never grows
  a stdlib — new surface is always a new internal plugin.
- **User plugins** claim **imported symbols** and cover custom functions/libraries.

Past the claim step the machinery is identical: stable fn id, per-target source emission,
coverage validation, generated dispatch.

The zero-plugin mandate reads precisely as: everything `@qwik.dev/core` and `@qwik.dev/router`
express must compile under `nativeTarget` with **zero user plugins** — the internal set ships
with the engine.

## Compiler seam

`TransformModulesOptions` gains:

```ts
nativeTarget?: string; // opaque target key, e.g. 'rust' | 'go' | 'zig' | community-defined
plugins?: QwikCompilerPlugin[];
```

The target key is **open, not an enum**. The compiler never interprets it — it only (a) switches
on native strictness (target-independent) and (b) matches it against plugin `targets` keys for
coverage validation. `rust`/`go`/`zig` are the first-party keys; a community engine for any
language defines its own key and becomes legitimate by implementing specs 01–06 and passing the
conformance harness ([08-conformance.md](./08-conformance.md) — the CLI protocol exists exactly
so any language qualifies). Convention: lowercase language name; avoid collisions with
first-party keys.

Both options are threaded from `packages/qwik-vite` (owner of the `transformModules` call)
through `CompilerContext`. Plugins are data consumed by expression/setup lowering — no new pass
mechanism, no visitor registration.

## Plugin API

```ts
interface QwikCompilerPlugin {
  name: string;
  claims: { module: string; exports: string[] | '*' }[]; // matched against ImportBinding
  targets: Record<
    string,
    (site: ClaimSite) => { source: string; dependencies?: Record<string, string> }
  >;
}

interface ClaimSite {
  fnId: string; // 'plugin:<normalized-module>:<export>' | 'qwik:<ns>.<op>'
  module: string;
  exportName: string;
  argCount: number;
  async: boolean;
}
```

- Claim unit = imported symbol; `analysis.ts` already resolves every reference to an
  `ImportBinding {source, importedName}`.
- **JS is never a declared target** — the authored module _is_ the JS implementation, which is
  why plugin-claimed code keeps working unchanged in the JS engine and in CSR.
- `fnId` is stable across builds (derived from normalized module specifier + export name), so
  emitted implementations dedupe across call sites and caching stays valid.
- The link step collects one implementation per `(fnId, target)`, generates the dispatch module
  (`generated/plugin_fns.rs` with a match dispatcher), and merges `dependencies` into the
  generated project manifest. Duplicate claims across plugins are a hard error
  (`native-plugin-conflict`).
- Required implementation signature (Rust reference):
  `fn(args: &[Value], ctx: &SsrCtx) -> Result<Value, SsrError>`, plus an async variant returning
  a host future with a cancel token. `Value` is the engine's JS-semantics type
  ([06](./06-js-semantics-profile.md)); `Opaque` values let plugins hand out host objects (e.g.
  `qwik:url` values) that only plugins can consume.

## Coverage validation and diagnostics

At lowering, every call site resolves to exactly one of: a lowerable IR form, a claimed plugin
(internal or user) with an emitter for the active target, or a fallback node. Under
`nativeTarget`, fallback and coverage gaps are compile errors. All codes join
`TransformDiagnosticCode` (kebab-case, `src/transform-diagnostics.ts`) and the existing atomic
per-module `TransformResult` failure; **all are inert when `nativeTarget` is unset** — the JS
path never regresses.

The first tranche is **implemented** in `src/validate-native.ts` (wired in `transform.ts`, gated
on the `nativeTarget` option, `ssr` target only): `native-expression` (values without `ir`,
branch conditions, collection sources/keys, Suspense `fallback$` pending a structural plan),
`native-setup-statement`, `native-custom-hook`, and `native-component-unplannable`. Validation
recurses into `local-component` setup entries, so local component bodies are held to the same
bar as component bodies. Plugin-related codes land with the plugin system.

Local components compile in place today (specs/03 `local-component`); capturing one across a
lazy QRL boundary (e.g. inside an extracted branch arm) still fails at SSR serialization with a
runtime error, exactly as the raw-function passthrough did before — lifting captured local
components to `componentQrl`-backed chunks is the planned fix.

| code                           | severity | fires when                                                                                                                          |
| ------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `native-expression`            | error    | expression neither lowerable nor claimed; suggests supported rewrite, extraction to a computed, or a plugin for `<module>#<export>` |
| `native-component-unplannable` | error    | component cannot be planned structurally (`planSsr` returns null)                                                                   |
| `native-setup-statement`       | error    | setup statement cannot lower to a `SetupOp`                                                                                         |
| `native-custom-hook`           | error    | non-core `use*` hook in setup                                                                                                       |
| `native-date-tostring`         | error    | bare Date in string position ([06](./06-js-semantics-profile.md))                                                                   |
| `native-nondeterministic`      | error    | `Math.random`/`Date.now` in render position                                                                                         |
| `native-plugin-target-missing` | error    | claim exists but no emitter for the active target                                                                                   |
| `native-plugin-conflict`       | error    | two plugins claim the same export/op                                                                                                |
| `native-plugin-claim-unused`   | warning  | claim matched no import                                                                                                             |
| `native-loose-eq`              | warning  | `==`/`!=` lowered with the object-operand runtime restriction                                                                       |

## Loaders, actions, middleware

The **wiring** is fully declarative and needs nothing: loader bodies run before render in
`loadersMiddleware`, and the component-side read is only `state[loader.__id]` → ComputedSignal.
The **bodies** execute on the server, so under a native target each body has exactly one of
three fates — through the same single transformation gate as everything else (there is no
whole-program JS→native transpilation; that would require reimplementing JS semantics, i.e. a
JS engine):

1. **Lowered.** Loader/action bodies go through the same `TaskBody`/`ValueIR` lowering as
   `useTask$`: `ev.params`/`ev.url`/`ev.cookies` reads become structured accessors, I/O goes
   through plugin calls (`qwik:fetch`, user plugins), `return` shapes the result. A loader that
   lowers is generated as native code automatically — no duplication.
2. **Host-registered.** A body that does not lower falls back to the host contract: the link
   step emits per-route loader manifests `{ routeId, loaders: [{ id: __id, symbol }] }` (same
   for actions); the embedding server registers `fn(loaderId, RequestEvent) -> Value`; the
   engine injects results as ComputedSignal-shaped state roots keyed by `__id` before render,
   mirroring the JS request pipeline (`resolve-request-handlers-core.ts` ordering). A manifest
   id with neither a lowered body nor a registered handler fails at server boot, not at request
   time.
3. **Plugin-claimed helpers** inside an otherwise-lowerable body (a DB client claimed by a user
   plugin) move a loader from tier 2 to tier 1.

Unlowered loaders/actions are listed per route in the native-readiness report so it is always
explicit which ids a host must register. `server$` bodies and middleware follow the same three
fates. Route matching itself is engine code (declarative `ParsedPathname`).

## Distribution

Internal plugin sets version with the engine (e.g. `qwik-ssr-std` crate). User plugins are
ordinary npm packages exporting `QwikCompilerPlugin` objects; their emitted target sources live
inside the package (string templates or files) — the compiler never fetches anything at build
time.
