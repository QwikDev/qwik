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

| Parameter | Type                                                | Description |
| --------- | --------------------------------------------------- | ----------- |
| opts      | [QwikCityFirebaseOptions](#qwikcityfirebaseoptions) |             |

**Returns:**

(req: any, res: any) =&gt; Promise&lt;void&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/firebase/index.ts)

## PlatformFirebase

```typescript
export interface PlatformFirebase extends Object
```

**Extends:** Object

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/firebase/index.ts)

## QwikCityFirebaseOptions

```typescript
export interface QwikCityFirebaseOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/firebase/index.ts)
