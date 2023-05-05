---
title: \@builder.io/qwik-city/middleware/node API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city/middleware/node

## createQwikCity

```typescript
export declare function createQwikCity(opts: QwikCityNodeRequestOptions): {
  router: (
    req: IncomingMessage,
    res: ServerResponse,
    next: NodeRequestNextFunction
  ) => Promise<void>;
  notFound: (
    req: IncomingMessage,
    res: ServerResponse,
    next: (e: any) => void
  ) => Promise<void>;
  staticFile: (
    req: IncomingMessage,
    res: ServerResponse,
    next: (e?: any) => void
  ) => Promise<void>;
};
```

| Parameter | Type                                                      | Description |
| --------- | --------------------------------------------------------- | ----------- |
| opts      | [QwikCityNodeRequestOptions](#qwikcitynoderequestoptions) |             |

**Returns:**

{ router: (req: IncomingMessage, res: ServerResponse, next: [NodeRequestNextFunction](#noderequestnextfunction)) =&gt; Promise&lt;void&gt;; notFound: (req: IncomingMessage, res: ServerResponse, next: (e: any) =&gt; void) =&gt; Promise&lt;void&gt;; staticFile: (req: IncomingMessage, res: ServerResponse, next: (e?: any) =&gt; void) =&gt; Promise&lt;void&gt;; }

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/node/index.ts)

## NodeRequestNextFunction

```typescript
export interface NodeRequestNextFunction
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/node/index.ts)

## PlatformNode

```typescript
export interface PlatformNode
```

| Property              | Modifiers | Type            | Description  |
| --------------------- | --------- | --------------- | ------------ |
| [incomingMessage?](#) |           | IncomingMessage | _(Optional)_ |
| [node?](#)            |           | string          | _(Optional)_ |
| [ssr?](#)             |           | true            | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/node/index.ts)

## QwikCityNodeRequestOptions

```typescript
export interface QwikCityNodeRequestOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

| Property     | Modifiers | Type                                      | Description                                   |
| ------------ | --------- | ----------------------------------------- | --------------------------------------------- |
| [static?](#) |           | { root?: string; cacheControl?: string; } | _(Optional)_ Options for serving static files |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/node/index.ts)
