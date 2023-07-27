---
title: \@builder.io/qwik-city/middleware/cloudflare-pages API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city/middleware/cloudflare-pages

## createQwikCity

```typescript
export declare function createQwikCity(opts: QwikCityCloudflarePagesOptions): (
  request: PlatformCloudflarePages["request"],
  env: Record<string, any> & {
    ASSETS: {
      fetch: (req: Request) => Response;
    };
  },
  ctx: PlatformCloudflarePages["ctx"],
) => Promise<Response>;
```

| Parameter | Type                                                              | Description |
| --------- | ----------------------------------------------------------------- | ----------- |
| opts      | [QwikCityCloudflarePagesOptions](#qwikcitycloudflarepagesoptions) |             |

**Returns:**

(request: [PlatformCloudflarePages](#platformcloudflarepages)['request'], env: Record&lt;string, any&gt; &amp; { ASSETS: { fetch: (req: Request) =&gt; Response; }; }, ctx: [PlatformCloudflarePages](#platformcloudflarepages)['ctx']) =&gt; Promise&lt;Response&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/cloudflare-pages/index.ts)

## PlatformCloudflarePages

```typescript
export interface PlatformCloudflarePages
```

| Property     | Modifiers | Type                                                     | Description |
| ------------ | --------- | -------------------------------------------------------- | ----------- |
| [ctx](#)     |           | { waitUntil: (promise: Promise&lt;any&gt;) =&gt; void; } |             |
| [env](#)     |           | Record&lt;string, any&gt;                                |             |
| [request](#) |           | Request                                                  |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/cloudflare-pages/index.ts)

## QwikCityCloudflarePagesOptions

```typescript
export interface QwikCityCloudflarePagesOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/cloudflare-pages/index.ts)
