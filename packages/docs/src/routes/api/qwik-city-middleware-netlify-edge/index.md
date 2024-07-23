---
title: \@builder.io/qwik-city/middleware/netlify-edge API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city/middleware/netlify-edge

## createQwikCity

```typescript
export declare function createQwikCity(
  opts: QwikCityNetlifyOptions,
): (request: Request, context: Context) => Promise<Response>;
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

[QwikCityNetlifyOptions](#qwikcitynetlifyoptions)

</td><td>

</td></tr>
</tbody></table>
**Returns:**

(request: Request, context: Context) =&gt; Promise&lt;Response&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/netlify-edge/index.ts)

## PlatformNetlify

```typescript
export interface PlatformNetlify extends Partial<Omit<Context, 'next' | 'cookies'>>
```

**Extends:** Partial&lt;Omit&lt;Context, 'next' \| 'cookies'&gt;&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/netlify-edge/index.ts)

## QwikCityNetlifyOptions

```typescript
export interface QwikCityNetlifyOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/netlify-edge/index.ts)
