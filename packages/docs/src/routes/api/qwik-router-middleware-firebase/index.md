---
title: \@qwik.dev/qwik-router/middleware/firebase API Reference
---

# [API](/api) &rsaquo; @qwik.dev/qwik-router/middleware/firebase

## createQwikCity

> Warning: This API is now obsolete.
>
> Use `createQwikRouter` instead. Will be removed in V3

```typescript
createQwikCity: typeof createQwikRouter;
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/firebase/index.ts)

## createQwikRouter

```typescript
export declare function createQwikRouter(
  opts: QwikRouterFirebaseOptions,
): (req: any, res: any) => Promise<void>;
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

[QwikRouterFirebaseOptions](#qwikrouterfirebaseoptions)

</td><td>

</td></tr>
</tbody></table>
**Returns:**

(req: any, res: any) =&gt; Promise&lt;void&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/firebase/index.ts)

## PlatformFirebase

```typescript
export interface PlatformFirebase extends Object
```

**Extends:** Object

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/firebase/index.ts)

## QwikCityFirebaseOptions

> Warning: This API is now obsolete.
>
> Use `QwikRouterFirebaseOptions` instead. Will be removed in V3

```typescript
export type QwikCityFirebaseOptions = QwikRouterFirebaseOptions;
```

**References:** [QwikRouterFirebaseOptions](#qwikrouterfirebaseoptions)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/firebase/index.ts)

## QwikRouterFirebaseOptions

```typescript
export interface QwikRouterFirebaseOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/middleware/firebase/index.ts)
