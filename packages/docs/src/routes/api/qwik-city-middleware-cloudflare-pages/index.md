---
title: \@builder.io/qwik-city/middleware/cloudflare-pages API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city/middleware/cloudflare-pages

## createQwikCity

```typescript
export declare function createQwikCity(opts: QwikCityCloudflarePagesOptions): (
  request: PlatformCloudflarePages["request"],
  env: PlatformCloudflarePages["env"] & {
    ASSETS: {
      fetch: (req: Request) => Response;
    };
  },
  ctx: PlatformCloudflarePages["ctx"],
) => Promise<Response>;
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

[QwikCityCloudflarePagesOptions](#qwikcitycloudflarepagesoptions)

</td><td>

</td></tr>
</tbody></table>
**Returns:**

(request: [PlatformCloudflarePages](#platformcloudflarepages)['request'], env: [PlatformCloudflarePages](#platformcloudflarepages)['env'] &amp; { ASSETS: { fetch: (req: Request) =&gt; Response; }; }, ctx: [PlatformCloudflarePages](#platformcloudflarepages)['ctx']) =&gt; Promise&lt;Response&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/middleware/cloudflare-pages/index.ts)

## PlatformCloudflarePages

```typescript
export interface PlatformCloudflarePages
```

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

[ctx](#)

</td><td>

</td><td>

{ waitUntil: (promise: Promise&lt;any&gt;) =&gt; void; }

</td><td>

</td></tr>
<tr><td>

[env?](#)

</td><td>

</td><td>

Record&lt;string, any&gt;

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[request](#)

</td><td>

</td><td>

Request

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/middleware/cloudflare-pages/index.ts)

## QwikCityCloudflarePagesOptions

```typescript
export interface QwikCityCloudflarePagesOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/middleware/cloudflare-pages/index.ts)
