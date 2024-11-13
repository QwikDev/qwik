---
title: \@qwik.dev/qwik/testing API Reference
---

# [API](/api) &rsaquo; @qwik.dev/qwik/testing

## child

```typescript
child: HTMLElement;
```

## createDocument

Create emulated `Document` for server environment. Does not implement the full browser `document` and `window` API. This api may be removed in the future.

```typescript
export declare function createDocument(opts?: MockDocumentOptions): Document;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

opts

</td><td>

MockDocumentOptions

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

Document

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/testing/document.ts)

## createDOM

CreatePlatform and CreateDocument

```typescript
createDOM: ({ html }?: { html?: string }) =>
  Promise<{
    render: (
      jsxElement: JSXOutput,
    ) => Promise<import("@qwik.dev/core").RenderResult>;
    screen: HTMLElement;
    userEvent: (
      queryOrElement: string | Element | keyof HTMLElementTagNameMap | null,
      eventNameCamel: string | keyof WindowEventMap,
      eventPayload?: any,
    ) => Promise<void>;
  }>;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

{ html }

</td><td>

{ html?: string; }

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

Promise&lt;{ render: (jsxElement: JSXOutput) =&gt; Promise&lt;import("@qwik.dev/core").RenderResult&gt;; screen: HTMLElement; userEvent: (queryOrElement: string \| Element \| keyof HTMLElementTagNameMap \| null, eventNameCamel: string \| keyof WindowEventMap, eventPayload?: any) =&gt; Promise&lt;void&gt;; }&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/testing/library.ts)

## document

```typescript
document: MockDocument;
```

## domRender

```typescript
export declare function domRender(
  jsx: JSXOutput,
  opts?: {
    debug?: boolean;
  },
): Promise<{
  document: Document;
  container: import("@qwik.dev/core").ClientContainer;
  vNode: _VNode | null;
  getStyles: () => Record<string, string | string[]>;
}>;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

jsx

</td><td>

JSXOutput

</td><td>

</td></tr>
<tr><td>

opts

</td><td>

{ debug?: boolean; }

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

Promise&lt;{ document: Document; container: import("@qwik.dev/core").ClientContainer; vNode: \_VNode \| null; getStyles: () =&gt; Record&lt;string, string \| string[]&gt;; }&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/testing/rendering.unit-util.tsx)

## ElementFixture

Creates a simple DOM structure for testing components.

By default `EntityFixture` creates:

```html
<host q:view="./component_fixture.noop">
  <child></child>
</host>
```

```typescript
export declare class ElementFixture
```

<table><thead><tr><th>

Constructor

</th><th>

Modifiers

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[(constructor)(options)](#)

</td><td>

</td><td>

Constructs a new instance of the `ElementFixture` class

</td></tr>
</tbody></table>

<table><thead><tr><th>

Property

</th><th>

Modifiers

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

[child](#elementfixture-child)

</td><td>

</td><td>

HTMLElement

</td><td>

</td></tr>
<tr><td>

[document](#elementfixture-document)

</td><td>

</td><td>

MockDocument

</td><td>

</td></tr>
<tr><td>

[host](#elementfixture-host)

</td><td>

</td><td>

HTMLElement

</td><td>

</td></tr>
<tr><td>

[parent](#elementfixture-parent)

</td><td>

</td><td>

HTMLElement

</td><td>

</td></tr>
<tr><td>

[superParent](#elementfixture-superparent)

</td><td>

</td><td>

HTMLElement

</td><td>

</td></tr>
<tr><td>

[window](#elementfixture-window)

</td><td>

</td><td>

MockWindow

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/testing/element-fixture.ts)

## emulateExecutionOfQwikFuncs

```typescript
export declare function emulateExecutionOfQwikFuncs(document: Document): void;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

document

</td><td>

Document

</td><td>

</td></tr>
</tbody></table>
**Returns:**

void

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/testing/rendering.unit-util.tsx)

## expectDOM

```typescript
export declare function expectDOM(
  actual: Element,
  expected: string,
): Promise<void>;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

actual

</td><td>

Element

</td><td>

</td></tr>
<tr><td>

expected

</td><td>

string

</td><td>

</td></tr>
</tbody></table>
**Returns:**

Promise&lt;void&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/testing/expect-dom.tsx)

## getTestPlatform

```typescript
export declare function getTestPlatform(): TestPlatform;
```

**Returns:**

TestPlatform

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/testing/platform.ts)

## host

```typescript
host: HTMLElement;
```

## parent

```typescript
parent: HTMLElement;
```

## ssrRenderToDom

```typescript
export declare function ssrRenderToDom(
  jsx: JSXOutput,
  opts?: {
    debug?: boolean;
    raw?: boolean;
  },
): Promise<{
  container: _DomContainer;
  document: Document;
  vNode: _VirtualVNode | null;
  getStyles: () => Record<string, string | string[]>;
}>;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

jsx

</td><td>

JSXOutput

</td><td>

</td></tr>
<tr><td>

opts

</td><td>

{ debug?: boolean; raw?: boolean; }

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

Promise&lt;{ container: \_DomContainer; document: Document; vNode: \_VirtualVNode \| null; getStyles: () =&gt; Record&lt;string, string \| string[]&gt;; }&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/testing/rendering.unit-util.tsx)

## superParent

```typescript
superParent: HTMLElement;
```

## trigger

Trigger an event in unit tests on an element.

Future deprecation candidate.

```typescript
export declare function trigger(
  root: Element,
  queryOrElement: string | Element | keyof HTMLElementTagNameMap | null,
  eventNameCamel: string,
  eventPayload?: any,
): Promise<void>;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

root

</td><td>

Element

</td><td>

</td></tr>
<tr><td>

queryOrElement

</td><td>

string \| Element \| keyof HTMLElementTagNameMap \| null

</td><td>

</td></tr>
<tr><td>

eventNameCamel

</td><td>

string

</td><td>

</td></tr>
<tr><td>

eventPayload

</td><td>

any

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

Promise&lt;void&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/testing/element-fixture.ts)

## vnode_fromJSX

```typescript
export declare function vnode_fromJSX(jsx: JSXOutput): {
  vParent: _ElementVNode;
  vNode: _VNode | null;
  document: _QDocument;
};
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

jsx

</td><td>

JSXOutput

</td><td>

</td></tr>
</tbody></table>
**Returns:**

{ vParent: \_ElementVNode; vNode: \_VNode \| null; document: \_QDocument; }

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/testing/vdom-diff.unit-util.ts)

## walkJSX

```typescript
export declare function walkJSX(
  jsx: JSXOutput,
  apply: {
    enter: (jsx: JSXNode) => void;
    leave: (jsx: JSXNode) => void;
    text: (text: _Stringifiable) => void;
  },
): void;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

jsx

</td><td>

JSXOutput

</td><td>

</td></tr>
<tr><td>

apply

</td><td>

{ enter: (jsx: JSXNode) =&gt; void; leave: (jsx: JSXNode) =&gt; void; text: (text: \_Stringifiable) =&gt; void; }

</td><td>

</td></tr>
</tbody></table>
**Returns:**

void

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/testing/vdom-diff.unit-util.ts)

## window

```typescript
window: MockWindow;
```
