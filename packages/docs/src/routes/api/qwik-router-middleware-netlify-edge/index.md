---
title: \@qwik.dev/qwik-router/middleware/netlify-edge API Reference
---

# [API](/api) &rsaquo; @qwik.dev/qwik-router/middleware/netlify-edge

## createQwikCity

> Warning: This API is now obsolete.
>
> Use `createQwikRouter` instead. Will be removed in V3

```typescript
createQwikCity: typeof createQwikRouter;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/netlify-edge/index.ts)

## createQwikRouter

```typescript
export declare function createQwikRouter(
  opts: QwikRouterNetlifyOptions,
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

[QwikRouterNetlifyOptions](#qwikrouternetlifyoptions)

</td><td>

</td></tr>
</tbody></table>
**Returns:**

(request: Request, context: Context) =&gt; Promise&lt;Response&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/netlify-edge/index.ts)

## PlatformNetlify

```typescript
export interface PlatformNetlify extends Partial<Omit<Context, 'next' | 'cookies'>>
```

**Extends:** Partial&lt;Omit&lt;Context, 'next' \| 'cookies'&gt;&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/netlify-edge/index.ts)

## QwikCityNetlifyOptions

> Warning: This API is now obsolete.
>
> Use `QwikRouterNetlifyOptions` instead. Will be removed in V3

```typescript
export type QwikCityNetlifyOptions = QwikRouterNetlifyOptions;
```

**References:** [QwikRouterNetlifyOptions](#qwikrouternetlifyoptions)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/netlify-edge/index.ts)

## QwikRouterNetlifyOptions

```typescript
export interface QwikRouterNetlifyOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/netlify-edge/index.ts)
