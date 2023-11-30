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
      jsxElement: JSXNode,
    ) => Promise<import("@builder.io/qwik").RenderResult>;
    screen: HTMLElement;
    userEvent: (
      queryOrElement: string | Element | keyof HTMLElementTagNameMap | null,
      eventNameCamel: string | keyof WindowEventMap,
      eventPayload?: any,
    ) => Promise<void>;
  }>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/testing/library.ts)
