---
title: \@builder.io/qwik/testing API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik/testing

## createDOM

CreatePlatform and CreateDocument

```typescript
createDOM: ({ html }?: { html?: string | undefined }) =>
  Promise<{
    render: (
      jsxElement: JSXOutput,
    ) => Promise<import("@builder.io/qwik").RenderResult>;
    screen: HTMLElement;
    userEvent: (
      queryOrElement: string | Element | keyof HTMLElementTagNameMap | null,
      eventNameCamel: string | keyof WindowEventMap,
      eventPayload?: any,
    ) => Promise<void>;
  }>;
```

| Parameter | Type                            | Description  |
| --------- | ------------------------------- | ------------ |
| { html }  | { html?: string \| undefined; } | _(Optional)_ |

**Returns:**

Promise&lt;{ render: (jsxElement: JSXOutput) =&gt; Promise&lt;import("@builder.io/qwik").RenderResult&gt;; screen: HTMLElement; userEvent: (queryOrElement: string \| Element \| keyof HTMLElementTagNameMap \| null, eventNameCamel: string \| keyof WindowEventMap, eventPayload?: any) =&gt; Promise&lt;void&gt;; }&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/testing/library.ts)
