---
title: \@qwik.dev/qwik-router/middleware/azure-swa API Reference
---

# [API](/api) &rsaquo; @qwik.dev/qwik-router/middleware/azure-swa

## createQwikCity

> Warning: This API is now obsolete.
>
> Use `createQwikRouter` instead. Will be removed in V3

```typescript
createQwikCity: typeof createQwikRouter;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/azure-swa/index.ts)

## createQwikRouter

```typescript
export declare function createQwikRouter(
  opts: QwikRouterAzureOptions,
): AzureFunction;
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

[QwikRouterAzureOptions](#qwikrouterazureoptions)

</td><td>

</td></tr>
</tbody></table>
**Returns:**

AzureFunction

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/azure-swa/index.ts)

## PlatformAzure

```typescript
export interface PlatformAzure extends Partial<Context>
```

**Extends:** Partial&lt;Context&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/azure-swa/index.ts)

## QwikCityAzureOptions

> Warning: This API is now obsolete.
>
> Use `QwikRouterAzureOptions` instead. Will be removed in V3

```typescript
export type QwikCityAzureOptions = QwikRouterAzureOptions;
```

**References:** [QwikRouterAzureOptions](#qwikrouterazureoptions)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/azure-swa/index.ts)

## QwikRouterAzureOptions

```typescript
export interface QwikRouterAzureOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/azure-swa/index.ts)
