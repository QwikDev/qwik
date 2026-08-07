# Cross-Engine Backlog

Deferred design changes that touch the serialization protocol and therefore every engine
(emitted JS, emit-js generator, reference interpreter, Rust) plus the client resume path.

## Element-targeted content effects for sole children

Today a content effect always renders inside `<!d=N>…<!/d>` range fences, even when it is the
only child of its element (`<p><!d=0>value 6<!/d></p>`, see the `def-helper` fixture). Dynamic
_text_ already has the optimization this is missing: a sole text child targets the element
itself via `q:id` (`renderSsrTextNode` + element-text target, no fences) and only siblings pay
for `<!t>` fences.

Content should get the same two-target treatment: sole-child content targets the element
(`<p q:id="0">value 6</p>`), and the effect record serializes with an element target kind so
the client re-runs it by replacing the element's children instead of a comment range.

Scope when picked up:

- `plan-ssr.ts`: sole-child detection for content ops (mirror the existing `singleText` path)
  and an element/range target on the content operation.
- Writers, together: `emit-ssr.ts`, `interpret-plan.ts`, `emit-js.ts`, and the Rust
  `qwik-ssr-gen`/`qwik-ssr-rt` content path.
- Reader: client resume in `packages/qwik/src/core/dom/content/content.ts` currently replaces
  a `BranchRange` (`replaceRange`) — needs an element-target variant that replaces the
  element's children.
- Regenerate Layer-A goldens (`def-helper` at minimum) and keep writer/reader round-trip tests
  per the serialization rule.
