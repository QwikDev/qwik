# 05 — SSR Wire Contract Freeze

Status: freeze spec, **validated against the code line-by-line (Phase 0)**. Sources of truth:
`packages/compiler/src/emit-ssr.ts` + `html-utils.ts`, `packages/qwik/src/server/ssr-render.ts` +
`ssr-script-emitter.ts` + `ssr-events.ts`, `core/ssr/output.ts` + `output-writer.ts` +
`use-on.ts`, `core/runtime/node-walker.ts`, and `qwikloader.ts`. On any conflict the code wins
and this doc is corrected. "Do not improve" applies throughout.

## Escaping — three distinct layers

1. **Static compile-time escaping** (`compiler/src/html-utils.ts`): `escapeText` escapes only
   `& < >`; `escapeAttr` adds `"`. **Neither escapes `'`.** Applied when the compiler bakes
   static text/attributes into emitted literals — so in the plan, `static` op HTML arrives
   pre-escaped with _this_ profile. Engines never re-apply it.
2. **Runtime dynamic escaping** (`core/shared/utils/character-escaping.ts` `escapeHTML`): exactly
   `& < > " '` (apostrophe as `&#39;`). Applied to every dynamic text/attribute value at render
   time. Consequence engines must reproduce: the same value produces **different bytes** static
   vs dynamic (`title="it's"` static stays raw; dynamic becomes `it&#39;s`).
3. **`escapeSsrContent`** (`core/dom/content/content.ts`): wraps every content-effect result —
   `string|number|bigint` → `escapeHTML(String(v))`, **anything else → `''`** (objects, arrays,
   booleans, null silently render empty).

Script-content escapers (`ssr-script-emitter.ts`) are three different rules:

| escaper            | rule                 | used for                                 |
| ------------------ | -------------------- | ---------------------------------------- |
| `escapeScript`     | `</` → `<\/`         | `qwik/state` bodies, `q:sub` payloads    |
| `escapeJsonScript` | `<` → `<`            | `_qwikB` patch payloads only             |
| none               | raw `JSON.stringify` | the `_qwikS` instance-hash interpolation |

## Structural markers

Element identity: `q:id="N"`; all range ids and `q:id`s come from one per-request counter
starting at 0. Markers are bogus comments (`<!x>`, not `<!--x-->`):

| open     | close   | meaning                           | notes                                                                                                                                                   |
| -------- | ------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<!b=N>` | `<!/b>` | branch range                      |                                                                                                                                                         |
| `<!f=N>` | `<!/f>` | For (collection) range            |                                                                                                                                                         |
| `<!r=N>` | `<!/r>` | For row                           | **SSR emits only `<!r=N>` or the boolean `q:row` attribute**; bare `<!r>` is CSR-runtime-only (the parser accepts it, the SSR wire never carries it)    |
| `<!s=N>` | `<!/s>` | slot range                        |                                                                                                                                                         |
| `<!c=N>` | `<!/c>` | context scope                     | N is a **serialization root id**, not a node id                                                                                                         |
| `<!d=N>` | `<!/d>` | content / Suspense boundary range |                                                                                                                                                         |
| `<!t>`   | `<!/t>` | range text                        | emitted **only for range-targeted text** (element-targeted text is bare); `<!/t>` is emitted but never parsed — inert padding an engine must still emit |

## Element emission

- Attribute order: `<tag`, then `q:id="N"` (if targeted), then the root attribute (`q:row`),
  then the style-scope-only `class`, then user props in source order, then `>`.
- Boolean/static attribute serialization (`html-utils.ts` compile-time, `styles.ts` runtime —
  identical rules): `aria-*`, `spellcheck`, `draggable`, `contenteditable` stringify booleans
  (` aria-hidden="false"`); every other attribute drops on `false`/`null` and renders bare on
  `true` (` hidden`).
- Dynamic attribute values: `null` → attribute omitted; `''` → bare name; else
  ` name="escapeHTML(value)"`.
- `<style q:style="id">` content is **not** escaped; only the id passes through `escapeHTML`.

## Event wiring

- Attribute grammar: `q-{e,ep,d,dp,w,wp}:<kebab-event>`; value = `|`-joined
  `chunk#symbol[#captureDeltas]` QRLs; loader invokes `handler.call(captureDeltaString, event,
element)`.
- Import base is **doubly resolved**: `new URL(chunk, new URL(container q:base,
document.baseURI))`.
- `preventdefault:`/`stoppropagation:`/`capture:` are **emitted by SSR** for `useOn*` events
  (`use-on.ts`), and pass through from JSX as static attributes (kebab-normalized;
  `passive:*` is dropped, `preventdefault:` on a passive event is dropped). `q:shadowroot` is
  user-authored only — SSR never emits it.
- `useVisibleTask$` strategies map to: `q-e:qvisible` (intersection-observer), `q-d:qinit`
  (document-ready), `q-d:qidle` (document-idle). `bind:value`/`bind:checked` ride `q-e:input`
  as `_val`/`_chk` inlined QRLs. `_run` wraps any QRL whose symbol doesn't start with `_` and
  which has (moved) captures. `_res` is emitted as `q-d:qidle` **on the first state script
  element**.
- **Headless carriers**: `useOn` handlers with no first structured-root record land on a literal
  `<script hidden …attrs…></script>`; only `q-e:qvisible`, `q-d:*`, `q-w:*` keys are accepted,
  and **`q-e:qvisible` is rewritten to `q-d:qinit`** on the carrier. Duplicate attribute names
  `|`-join in place. "First element" means the first compiler-tagged structured-root record, not
  the first markup element.
- `_qwikEv` registration: `(window._qwikEv||(window._qwikEv=[])).push("e:click",…)` —
  JSON-stringified scoped-kebab names including passive scopes (`ep:`, `dp:`, `wp:`). The
  loader's `e:click, e:input` default applies **only when SSR emitted no `_qwikEv` array at
  all**; an empty-or-partial array registers exactly its names.

## Container

| attribute         | value                                                          | notes                                                                                                          |
| ----------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `q:container`     | `"paused"`                                                     | only CSR flips to `resumed`; `"html"`/`"text"` are legacy values the loader still filters, never emitted by v3 |
| `q:runtime`       | `"2"`                                                          |                                                                                                                |
| `q:version`       | build version or `dev`                                         | build-stamped — conformance normalizes it                                                                      |
| `q:render`        | `ssr` / `ssr-dev`, caller-prefixed                             |                                                                                                                |
| `q:base`          | build base URL (default `${BASE_URL}build/`)                   |                                                                                                                |
| `q:locale`        | resolved locale                                                | **always emitted, `""` when unset**                                                                            |
| `q:manifest-hash` | manifest hash                                                  | **always emitted, `""` when unset**                                                                            |
| `q:instance`      | 6-char random, or `opts.instanceHash` (test seam, implemented) | **present on every container, including fully-static pages**                                                   |

- Caller `containerAttributes` merge **by key**: colliding keys are overwritten in place, so
  attribute _position_ follows the caller's object; only `q:render` reads the caller's value
  (as prefix).
- `<!DOCTYPE html>` only for `html` containers. Head/body synthesis: carrier relocation and
`createContainerTags` are html-only, but **`injectStyles` runs for every container tag** — a
`div` container with `useStyles$` yields `<div q:container…><head><style…></head><body>…
</body></div>`.

## Document assembly order

1. invoke root → output tree
2. `useOn` application (first structured root, else headless carrier)
3. relocate carriers into `<head>` (html only)
4. inject `<style q:style>` before the first `</head>` (case-insensitive)
5. container open + output
6. **non-streaming: settle scheduler patches; streaming: flush the root lane only** (full
   settle happens after all packets, just before container close) — then write `_qwikB`
   backpatches
7. `qwik/state` script(s)
8. qwikloader + `_qwikEv` (gating below)
9. Suspense runtime script (streaming) or container close
10. packets, final settle, close

## Scripts

- **qwikloader**: `<script id="qwikloader" async type="module"[ nonce]>…</script>`, body a true
  build constant. Emitted when `$eventQrls$.size > 0` **or any boundary deferred** (a
  deferred-but-eventless page ships the loader — and, having no `_qwikEv` array, gets the
  click/input defaults). `qwikLoader: 'never'` suppresses the loader but **not** the `_qwikEv`
  script (separately gated on non-empty names); `'module'`/`'inline'`/`{include:…}` are accepted
  by the type but currently no-ops. Loader precedes the `_qwikEv` script.
- **State scripts**: attribute key order `type, q:s, q:base, q:len, q:fr|q:sub`; `q:base`/`q:len`
  mandatory on every state script; the **shell** state script carries no `q:s`; chunking at 1024
  roots / forward refs per [04](./04-state-serialization.md).
- **`qFuncs_<q:instance>` is a HOST obligation, not an SSR emission**: no v3 emitter writes it.
  SSR returns sync-fn bodies as `snapshotResult.funcs`; the embedding host must install
  `document['qFuncs_<hash>'] = funcs` or sync QRLs fail with `qerror{importError:'sync'}`.
  Engines expose the same: plan `syncFns` → host installs.

## Streaming and Suspense packets

- `outOfOrder` defaults true; `renderToString` hard-codes `false` (its `opts.outOfOrder` is
  ignored). `outOfOrder: false` also means **no fallback is ever rendered** — content is
  awaited inline. `ctx.inOrder()` opts a subtree into inline awaiting within a streaming render.
- A boundary produces a packet only if its content is genuinely async (sync content inlines with
  no fallback) and, with `delay > 0`, only if the timer fires first.
- Packet composition order per settled boundary: state chunk(s) (`q:s`-tagged, incl. their
  `q:fr`) → new `<style q:style>` tags (Map insertion order, unemitted ids only) → new
  `_qwikEv` pushes → `<template q:s="N">content</template>` +
  `<script>window._qwikS(document.currentScript, N, contentRoot ?? -1, fallbackRoot ?? -1)
</script>` → lane-scoped `_qwikB`. Parent-gated (packet emits when `parentId === null ||
emitted.has(parentId)`), else promise-resolution order.
- `_qwikS` runtime semantics: registers the packet's state scripts (selected by
  `script[type="qwik/state"][q:s]`), **disposes the fallback root first**, locates the template
  via `previousElementSibling` (the template's `q:s` is never read), walks comments for the
  `d=N` range; missing range → discard content root + remove template/script; else Range
  delete/insert + `prepareRoot`. Root disposal stamps `q:dispose` (space-separated root ids)
  onto the owning state script — a client-side mutation, never SSR-emitted.
- `_qwikB` payload is a **flat array** consumed in strides of 3 (`[qId, name, value, qId, …]`),
  escaped with `escapeJsonScript`; the `w._qwikB=…` installer appears **only in the first**
  backpatch script of a render.
- The suspense runtime script interpolates the instance hash and pushes the container-ready
  command `(w._qwikEv||…).push(0, "<hash>")`. Not a pure build constant — engines emit the
  constant body with the hash interpolated.
- Cancellation: when a boundary's fallback root is disposed, sibling deferred records whose
  content owner is gone are cancelled and never emit a packet — their `<!d=N>…<!/d>` range
  stays unresolved in the document.

## Output model

`SsrOutput` = strings | node-id / root-ref / root-ref-path reference chunks | record chunks |
arrays — **no promises**; content promises are resolved earlier by emitted `maybeThen` chains,
and the writer awaits only the sink's return value (backpressure). Empty-string skipping applies
per top-level materialized chunk (empty parts inside records concatenate normally); an event
attribute whose joined value is empty is dropped entirely.

## Conformance

- The **109** compiler snapshots (`packages/compiler/src/snapshots/*.snap`) are **module-code
  oracles** (input + prettier-formatted emitted SSR/CSR modules + diagnostics) — they prove
  emission, not rendered bytes.
- Renderer-level byte oracles: `server/ssr-render.unit.ts`, `ssr-script-emitter.unit.ts`, and
  the Layer-A shell goldens (`packages/compiler/conformance/layerA/`,
  [08-conformance.md](./08-conformance.md)). `testing/resume-session.ts` is the behavioral
  resume proof — and today also the only in-repo `qFuncs` installer.
- Legacy reader paths in the shipped loader (`qwik/json`, `q:container="html"|"text"`) must
  never be triggered by engine output.
- Known trap: `e2e/qwik-e2e/apps/qwikrouter-ssg-snapshot/dist/index.html` is stale v2 output
  (`qwik/vnode`) — not a format reference.
