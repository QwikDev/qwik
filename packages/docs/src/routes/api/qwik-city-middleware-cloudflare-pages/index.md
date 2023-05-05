---
title: \@builder.io/qwik-city/middleware/cloudflare-pages API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city/middleware/cloudflare-pages

## createQwikCity

```typescript
export declare function createQwikCity(
  opts: QwikCityCloudflarePagesOptions
): ({ request, env, waitUntil, next }: EventPluginContext) => Promise<Response>;
```

| Parameter | Type                                                              | Description |
| --------- | ----------------------------------------------------------------- | ----------- |
| opts      | [QwikCityCloudflarePagesOptions](#qwikcitycloudflarepagesoptions) |             |

**Returns:**

({ request, env, waitUntil, next }: [EventPluginContext](#eventplugincontext)) =&gt; Promise&lt;Response&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/cloudflare-pages/index.ts)

## EventPluginContext

```typescript
export interface EventPluginContext
```

| Property       | Modifiers | Type                                                                          | Description |
| -------------- | --------- | ----------------------------------------------------------------------------- | ----------- |
| [env](#)       |           | Record&lt;string, any&gt;                                                     |             |
| [next](#)      |           | (input?: Request \| string, init?: RequestInit) =&gt; Promise&lt;Response&gt; |             |
| [request](#)   |           | Request                                                                       |             |
| [waitUntil](#) |           | (promise: Promise&lt;any&gt;) =&gt; void                                      |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/cloudflare-pages/index.ts)

## PlatformCloudflarePages

```typescript
export interface PlatformCloudflarePages
```

| Property  | Modifiers | Type                                               | Description  |
| --------- | --------- | -------------------------------------------------- | ------------ |
| [env?](#) |           | [EventPluginContext](#eventplugincontext)\['env'\] | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/cloudflare-pages/index.ts)

## QwikCityCloudflarePagesOptions

```typescript
export interface QwikCityCloudflarePagesOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/cloudflare-pages/index.ts)
