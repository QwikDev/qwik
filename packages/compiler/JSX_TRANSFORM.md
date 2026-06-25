# JSX Transform

This document describes the vdomless static JSX transform implemented in
`packages/compiler/src/stages`.

The transform is intentionally narrow: it accepts component bodies that can be
lowered to render IR, records the QRL segments needed for resumability, and
emits separate SSR and CSR modules from the same IR.

## Pipeline

1. `discover.ts` finds exported components and local PascalCase components used
   by those exports.
2. `analyze-captures.ts` creates QRL segment records for `$` functions, JSX
   events, dynamic JSX expressions, branches, and loops.
3. `lower-jsx.ts` lowers supported JSX into `RenderNode` IR.
4. `emit.ts` decides which components stay in the original module, which
   components become entry modules, and which QRL segment modules are emitted.
5. `emit-ssr.ts` and `emit-csr.ts` emit SSR strings and CSR DOM code.

## Component Discovery

Supported component declarations:

```tsx
export function App() {
  return <main />;
}

export const App = () => <main />;

export default function App() {
  return <main />;
}

export default () => <main />;

export const App = component$(() => <main />);
```

Rules:

- Only static JSX returns are lowered. A component body may contain setup
  statements before the `return`, but the returned value must be JSX.
- A component may have zero or one props parameter. More than one props parameter
  is rejected.
- Object-pattern props are supported. In CSR, simple destructured props can be
  rewritten back to `_props.foo` when this avoids unnecessary setup code.
- `createContextProvider(...)` in setup marks the component as a context
  provider. SSR wraps its rendered HTML in a context boundary.
- Local components are discovered only when they are PascalCase and used by a
  discovered component.
- A component referenced from another component's JSX is emitted as its own
  entry module. If it was exported from the source module, the original module
  re-exports it from the generated component module.

## JSX Nodes

Element names:

- Native elements must be simple lowercase/custom-element names such as `div`,
  `button`, or `my-element`.
- Component elements must be simple PascalCase names such as `Button`.
- Member expressions and other complex JSX tag names are not supported.

Fragments:

- JSX fragments lower to `fragment` IR.
- Fragment children are flattened where the emitter needs element text ranges.

Children:

- JSX text is normalized like JSX whitespace and emitted as static text.
- Empty JSX expression containers are ignored.
- `props.children` lowers to a `children` IR node when the component has a props
  identifier.
- String literals become text. Number and bigint literals are supported in
  branch children as text.
- `signal.value` lowers to a source-backed dynamic text binding.
- String concatenations lower to static/source text parts only when the whole
  expression is guaranteed to produce a string. At least one side of each `+`
  must be known string-producing.
- Other dynamic text expressions lower to a `jsxText` QRL segment.

## Native Element Attributes

General rules:

- `key` is ignored.
- `className` becomes `class`.
- Boolean attributes serialize as present/absent.
- `false` and `null` attributes are omitted.
- Literal string, number, boolean, and null values are static.
- Empty JSX attribute expressions are rejected.
- Unsupported dynamic native attributes produce a diagnostic.

Dynamic native attributes:

- `attr={signal.value}` lowers to a source-backed DOM binding.
- `attr={expr}` lowers to a `jsxProp` QRL segment when the analyzer created one.
- Multiple dynamic DOM effects with the same source or capture set are batched.

Native spreads:

- Any spread attribute, or an analyzer-created `jsxSpreadProps` segment, puts
  the whole native attribute list on the object-props path.
- The object-props path preserves spread order and named attributes.
- SSR emits `renderSsrProps(..., ctx.eventAttr)`.
- CSR emits a props effect or a batched props update.
- Native event props inside a spread/object-props path keep their JSX prop name
  (`onClick$`) in the props object. The runtime props application handles them.

## Native Events

Recognized event prop syntax:

- `onClick$`
- `window:onClick$`
- `document:onClick$`

The compiler maps these to event attributes:

- `onClick$` -> `q-e:click`
- `window:onScroll$` -> `q-w:scroll`
- `document:onKeyDown$` -> `q-d:keydown`
- `onDOMContentLoaded$` -> `q-e:-d-o-m-content-loaded`

Direct native event rules:

- `onClick$={() => ...}` creates an `eventHandler` QRL segment.
- SSR emits `ctx.eventAttr('q-e:click', qrl)`.
- CSR emits `setEvent(el, 'q-e:click', handler, captures?)`.
- `onClick$={props.onClick$}` is event pass-through. It does not create a new
  QRL segment. SSR emits `ctx.eventAttr('q-e:click', props.onClick$)`. CSR emits
  a guarded `setEvent(el, 'q-e:click', props.onClick$)`.
- Any other non-expression or empty event value is rejected.

Other event-looking native props:

- Names ending in `$`, names starting with `on[A-Z]`, and names containing
  `:on` are treated as event-like.
- If they do not match the recognized `$` event syntax above, they are rejected.

## Component Props

Component attributes lower to component prop records, not DOM attributes.

Rules:

- `key` is ignored.
- Static literals and boolean shorthand are copied as values.
- Dynamic expressions become getters in the generated props object.
- Spread props are merged with `mergeProps(...)`, preserving source order.
- Children are passed as `children`.

`$` component props:

- If a component prop name ends with `$` and its value is an inline function,
  the function becomes a QRL prop.
- This applies to any component prop ending in `$`, not only DOM event names.
- Example: `<Button onClick$={() => count.value++} />` passes a QRL in the
  `onClick$` prop.
- If that child later renders `<button onClick$={props.onClick$}>`, the native
  event pass-through rule above keeps the same QRL.

## Branches

Supported branch expressions in JSX children:

```tsx
{
  condition ? <A /> : <B />;
}
{
  condition && <A />;
}
```

Rules:

- The condition becomes a `branchCondition` QRL segment.
- Each non-empty branch body becomes a `branchRender` QRL segment.
- Empty branch values are `null`, `false`, and `true`.
- Branch render children are lowered recursively, so branches may contain
  elements, components, text bindings, nested branches, and loops.
- SSR emits `renderSsrBranch(...)` and wraps the result in `<!b=id>...<!/b>`.
- CSR emits comment markers and `createBranch(...)`.

## Loops

Supported loop shape:

```tsx
{
  items.value.map((item, index) => <li key={item.id}>{item.label}</li>);
}
```

Rules:

- Only `.map()` is supported. `.forEach()` and `.flatMap()` produce diagnostics.
- The map source must be a signal value, for example `items.value`.
- The callback must be inline.
- Callback parameters must be identifiers.
- The row callback must return JSX.
- Every row must have an explicit `key={...}`. For fragments, the first child
  element with a key is used.
- The key expression becomes a `forKey` QRL segment.
- The returned row JSX becomes a `forRender` QRL segment.
- References to loop item and index parameters are rewritten to `.value` inside
  loop render segments where needed.
- SSR emits `renderSsrForBlock(...)` and wraps the result in
  `<!f=id>...<!/f>`.
- CSR emits comment markers and `createForBlock(...)`.

## SSR Emission

SSR output is string-based.

Rules:

- Static elements emit HTML string parts.
- Dynamic text and attributes allocate `q:id` targets.
- Dynamic text uses element text targets when the element body is a single
  dynamic text node; otherwise range text markers are used.
- Dynamic attributes and text expressions use QRLs and capture roots.
- Native direct events use `ctx.eventAttr(...)`.
- Component children use `createComponent(...)` and make the component function
  async when children may render asynchronously.
- QRL variables use `_qrlWithChunk(...)`; SSR resolves segments eagerly when
  needed for server rendering.

## CSR Emission

CSR output creates DOM nodes directly, with a template fast path where possible.

Template fast path:

- Used for static-safe trees.
- Disallowed for unsafe tags, void elements with children, spreads, direct event
  expression pass-through, and dynamic object props.
- Dynamic text and attributes in a template are patched by locating the existing
  nodes.

Direct DOM path:

- Creates elements with `ctx.document.createElement(...)`.
- Static attrs use `setAttribute` or `className`.
- Dynamic text and attributes create scheduler effects.
- Direct events call `setEvent(...)`.
- Components call `createComponent(props, render, { container: ctx })`.
- Branches and loops create comment ranges and scheduler-backed runtime blocks.

## QRL Segments

Segment kinds used by JSX:

- `eventHandler`: inline native events and event-like component props.
- `jsxProp`: dynamic JSX props and non-event `$` function props.
- `jsxSpreadProps`: native element object-props path.
- `jsxText`: dynamic text expressions.
- `branchCondition`: branch condition.
- `branchRender`: branch body renderer.
- `forKey`: loop key expression.
- `forRender`: loop row renderer.

Capture rules:

- Captured locals are serialized through QRL captures.
- Module-level references used by QRL segment modules are re-exported from the
  original module and imported by the generated segment module.
- CSR uses `_withCaptures(...)` or captured event helpers when a segment needs
  runtime captures.

## Unsupported Cases

Current diagnostics cover these cases:

- Non-static component return values.
- More than one props parameter.
- Complex JSX tag names.
- Non-PascalCase component names.
- Non-simple attribute names where a simple name is required.
- Empty JSX attribute expressions.
- Unsupported dynamic native attributes.
- Unsupported dynamic JSX children.
- `.map()` rows without JSX, without keys, without signal-value sources, or with
  non-identifier callback parameters.
- Event-like native props that do not match supported `$` event syntax.
