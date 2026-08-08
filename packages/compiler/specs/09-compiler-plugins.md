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
- An implementation is an ordinary function — `pub fn buildData(count: usize) -> Vec<Row>` for the
  Rust reference. Nothing Qwik-shaped appears in the authored source, so it stays formattable and
  testable as plain Rust. Types in the signature must be public, as for any public function.
- The generated call site does the converting: `into_serdes(f(arg(&value, "f", 0)))`. Inference
  picks each conversion from the callee's signature, so the generator needs no type information
  from the wire, and an arity mismatch is a compile error rather than a runtime one.
- Signal-valued fields stay `Signal<T>` across the boundary — they are reactive cells the
  serializer walks, not plain data.

## Dependencies

Third-party libraries are declared where the target language already declares them, not on the
wire. The compiler cannot infer them: names are lexically guessable, but versions, features,
renamed packages, and library-vs-local-module are not, and a dependency without a version is not a
dependency.

**Directory = package, file = source.** That one rule is the whole convention, and it keeps every
layer above the engine language-agnostic:

| layer                                | knows                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `native$` API                        | a path — `nativeFrom('./native')` or `nativeFrom('./impl.rs')`                                      |
| build (`qwik-vite`, layer-A harness) | is that path a directory or a file? Directory → `{ package: <absolute path> }`, file → `{ source }` |
| engine generator                     | what a package means in its language                                                                |

So `Cargo.toml` appears only in `qwik-ssr-gen`: it reads `[package] name` to add the path
dependency and to call `<crate>::<export>`. A Go engine would read `go.mod` instead, with nothing
upstream of it changing.

- **Inline `nativeCode` is for simple cases**: the target's standard library plus the Qwik runtime,
  nothing else. Needing a library is the signal to move to a package.
- A directory the engine cannot make sense of fails loudly, naming the path and what it expected —
  never a silent fallback to splicing.
- Package exports are named after the JS export they implement, so a Rust crate implementing
  `buildData` carries `#![allow(non_snake_case)]`.
- A struct crossing the boundary derives its serialization — `#[derive(Serdes)]` in the Rust
  reference, with field order becoming object key order. Rust has no reflection, so the field list
  must be emitted by something; the trait's `diagnostic::on_unimplemented` names the missing derive
  at the point of use, so nobody has to know about it in advance.

### Generated project

Generated code is a Cargo project, not source spliced into a host crate: one crate per app, plus a
root binary calling `qwik_ssr_host::run`. `qwik-ssr-gen`'s `qwik-native-project` bin writes it
before cargo resolves the graph — a `build.rs` cannot add dependencies to its own crate, which is
the whole reason app code cannot live in the host. Per-app crates also mean two apps can depend on
incompatible majors of the same library, which one shared manifest makes unresolvable.

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

Local components compile in place (specs/03 `local-component`) and are **always chunk-backed,
like any component**: the compiled body is also emitted as its own chunk segment (kind
`localComponent`, `_captures` preamble, own QRL hoists; nested local components inline their
bodies into the enclosing chunk, whose child-segment imports collect transitively through them),
the plan op always records the backing `segment`, and the emitted setup tags the inline function
with `_markComponent(fn, qrl.w([captures]))` after all setup statements (captures may be
declared below the hoisted declaration). The serializer writes component-tagged functions as
their QRL, so a local component is serializable no matter how it escapes — segment captures,
props, stores, or context. Direct calls keep using the inline function; the chunk is lazy and
never fetched unless the value actually resumes on the client.

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
