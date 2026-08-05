# 05 — SSR Wire Contract Freeze

Status: freeze spec (documents existing v3 behavior as the cross-engine contract). Sources of
truth today: `packages/compiler/src/emit-ssr.ts` + the 116 snapshots in
`packages/compiler/src/snapshots/`, `packages/qwik/src/server/ssr-render.ts`,
`ssr-script-emitter.ts`, `core/ssr/output-writer.ts`, `core/runtime/node-walker.ts`, and
`qwikloader.ts`. Phase 0 validates every claim against the code; shipped behavior wins.

This contract is what the unchanged browser client (qwikloader + resume runtime) requires. "Do
not improve" applies throughout — e.g. adding escaping, prettifying markers, or reordering
attributes breaks byte compatibility.

## HTML escaping

`escapeHTML` (`core/shared/utils/character-escaping.ts`) escapes exactly five characters:
`& < > " '` — note the single quote. Static text/attributes are escaped at **compile time** into
the plan's `static` ops; dynamic values are escaped by the engine at render time with the same
function.

## Structural markers

Element identity: `q:id="N"` — `N` from a single per-request counter shared with range ids
(`ctx.nextId()`).

Range markers are **bogus comments** (`<!x>`, not `<!--x-->`), hard-coded identically in the
compiler emitter and the client parser (`node-walker.ts`):

| open              | close   | meaning                                          |
| ----------------- | ------- | ------------------------------------------------ |
| `<!b=N>`          | `<!/b>` | branch range                                     |
| `<!f=N>`          | `<!/f>` | For (collection) range                           |
| `<!r=N>` / `<!r>` | `<!/r>` | For row (or `q:row` attribute on an element row) |
| `<!s=N>`          | `<!/s>` | slot range                                       |
| `<!c=N>`          | `<!/c>` | context scope (N = root id of the scope)         |
| `<!d=N>`          | `<!/d>` | content / Suspense boundary range                |
| `<!t>`            | `<!/t>` | range-text anchor (position-indexed)             |

## Event wiring attributes

- Attribute name: `q-<scope>:<kebab-event>` with scopes `e` (element), `ep` (element passive),
  `d`/`dp` (document), `w`/`wp` (window).
- Attribute value: `|`-joined QRLs, each `chunk#symbol[#captureDeltas]`
  ([04-state-serialization.md](./04-state-serialization.md) for the delta encoding). The
  qwikloader invokes `handler.call(captureDeltaString, event, element)`; import base is
  `new URL(chunk, container q:base)`.
- Sync QRLs use an empty chunk: the loader indexes `document['qFuncs_' + q:instance]`.
- Sibling attributes honored by the loader: `preventdefault:<kebab>`, `stoppropagation:<kebab>`,
  `capture:<kebab>`, `q:shadowroot`.
- Event **names** must be registered or the loader never listens (default is only
  `e:click, e:input`): `(window._qwikEv||(window._qwikEv=[])).push("e:click","e:input")` with
  scoped-kebab names (`e:click`, `d:qinit`, `w:load`).
- Built-in core symbols referenced from SSR output: `_run` (capture-restoring wrapper for any
  capturing event QRL), `_visibleTask`, `_val`/`_chk` (`bind:value`/`bind:checked`), `_res`
  (eager async-computed resume, emitted as `q-d:qidle` on the state script element).

## Container

`createContainerAttributes` (`ssr-render.ts`):

| attribute         | value                                                  | varies                                                                     |
| ----------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `q:container`     | `"paused"`                                             | constant (only CSR flips to resumed)                                       |
| `q:runtime`       | `"2"`                                                  | constant                                                                   |
| `q:version`       | build version or `dev`                                 | per build                                                                  |
| `q:render`        | `ssr` / `ssr-dev` (caller-prefixed, e.g. `static-ssr`) | mostly constant                                                            |
| `q:base`          | build base URL (default `${BASE_URL}build/`)           | per deploy                                                                 |
| `q:locale`        | resolved locale                                        | **per request**                                                            |
| `q:manifest-hash` | manifest hash                                          | per build                                                                  |
| `q:instance`      | random 6-char id                                       | **per render** — namespaces `qFuncs_<id>` and `_qwikEv` container commands |

`<!DOCTYPE html>` is prefixed only for `html` containers; missing `<head>`/`<body>` are
synthesized. Caller-supplied `containerAttributes` (e.g. the router's `q:route`) merge first.

Determinism note: `q:instance` (and the id counter start) must gain a test-only injection seam so
cross-engine byte comparison is possible — Phase 0 work; production behavior unchanged.

## Document assembly order

1. invoke root → output tree
2. attach `useOn` handlers to the first element, else a hidden headless-carrier `<script>`
3. relocate headless carriers into `<head>` (html containers)
4. inject `<style q:style="<id>">` before `</head>`
5. write container open + rendered output
6. settle scheduler lanes; write any `_qwikB` attribute-backpatch scripts
7. serialize state → `qwik/state` script(s)
8. emit qwikloader + `_qwikEv` registration if any event QRLs exist
9. Suspense runtime script (streaming) or container close
10. Suspense packets, then close

The output model is a typed chunk tree (`core/ssr/output.ts`: strings, late-bound
node-id/root-ref reference chunks, record chunks); `SsrOutputWriter` materializes it in document
order, awaiting promises between siblings and skipping empty strings.

## Streaming and Suspense packets

Base SSR is strictly sequential (sibling 2 waits for sibling 1). `outOfOrder` defaults to true;
`renderToString`/`outOfOrder:false` awaits content inline and emits no packet executor.

Packet protocol per resolved boundary `N`:

1. Shell rendered the fallback inside `<!d=N> … <!/d>`; the shell tail carries the `_qwikS`
   runtime script (which also pushes the `_qwikEv` shell-complete command with `q:instance`).
2. Appended per settle: state chunk(s) with `q:s="N"`, optional `q:fr` chunk, optional `q:sub`
   chunk, new `<style q:style>` tags, new `_qwikEv` pushes, then
   `<template q:s="N">…content…</template>` followed by
   `<script>window._qwikS(document.currentScript, N, contentRoot, fallbackRoot)</script>`.
3. `_qwikS` replaces the `d=N` comment range with the template content (TreeWalker over
   comments), disposes the fallback root, prepares the content root. A missing range is
   discarded.
4. Attribute-only late changes ride `_qwikB` backpatch scripts carrying `[q:id, name, value]`
   triples.
5. Packets follow promise-resolution order among unrelated boundaries; a child packet waits for
   its parent.

The `_qwikS`/`_qwikB`/qwikloader script bodies are **build-time constant strings** — engines copy
them verbatim (only JSON data is interpolated, through the script-content escaper that rewrites
`<` as needed).

## What is emitted only conditionally

- The qwikloader + `_qwikEv` registration only when event QRLs exist.
- The Suspense runtime only when streaming with pending boundaries.
- `qFuncs_<q:instance>` only when sync QRLs exist.

A fully static page is markup only — engines must reproduce the same gating, not emit
unconditionally.

## Conformance

Byte-level oracles: the 116 compiler snapshots (exact emitted module → exact rendered output via
the JS engine), `server/ssr-render.unit.ts`, `ssr-script-emitter.unit.ts`, and
`testing/resume-session.ts` for behavioral resume proof. Known trap:
`e2e/qwik-e2e/apps/qwikrouter-ssg-snapshot/dist/index.html` is a stale v2-era artifact — never
use it as a format reference.
