---
title: \@builder.io/qwik-city/middleware/firebase API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city/middleware/firebase

## createQwikCity

```typescript
export declare function createQwikCity(
  opts: QwikCityFirebaseOptions,
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

[QwikCityFirebaseOptions](#qwikcityfirebaseoptions)

</td><td>

</td></tr>
</tbody></table>
**Returns:**

(req: any, res: any) =&gt; Promise&lt;void&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/firebase/index.ts)

## PlatformFirebase

```typescript
export interface PlatformFirebase extends Object
```

**Extends:** Object

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/firebase/index.ts)

## QwikCityFirebaseOptions

```typescript
export interface QwikCityFirebaseOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/middleware/firebase/index.ts)
