---
title: \@builder.io/qwik-city/middleware/vercel-edge API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city/middleware/vercel-edge

## createQwikCity

```typescript
export declare function createQwikCity(
  opts: QwikCityVercelEdgeOptions
): (request: Request) => Promise<Response>;
```

| Parameter | Type                                                    | Description |
| --------- | ------------------------------------------------------- | ----------- |
| opts      | [QwikCityVercelEdgeOptions](#qwikcityverceledgeoptions) |             |

**Returns:**

(request: Request) =&gt; Promise&lt;Response&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/vercel-edge/index.ts)

## PlatformVercel

```typescript
export interface PlatformVercel
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/vercel-edge/index.ts)

## QwikCityVercelEdgeOptions

```typescript
export interface QwikCityVercelEdgeOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/vercel-edge/index.ts)
