---
title: \@builder.io/qwik-city/vite/cloudflare-pages API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city/vite/cloudflare-pages

## cloudflarePagesAdapter

```typescript
export declare function cloudflarePagesAdapter(
  opts?: CloudflarePagesAdapterOptions
): any;
```

| Parameter | Type                                                            | Description  |
| --------- | --------------------------------------------------------------- | ------------ |
| opts      | [CloudflarePagesAdapterOptions](#cloudflarepagesadapteroptions) | _(Optional)_ |

**Returns:**

any

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/adapters/cloudflare-pages/vite/index.ts)

## CloudflarePagesAdapterOptions

```typescript
export interface CloudflarePagesAdapterOptions extends ServerAdapterOptions
```

**Extends:** ServerAdapterOptions

| Property             | Modifiers | Type       | Description                                                                                                                                                                                                                                                             |
| -------------------- | --------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [functionRoutes?](#) |           | boolean    | <p>_(Optional)_ Determines if the build should generate the function invocation routes <code>\_routes.json</code> file.</p><p>https://developers.cloudflare.com/pages/platform/functions/routing/\#functions-invocation-routes</p><p>Defaults to <code>true</code>.</p> |
| [staticPaths?](#)    |           | string\[\] | _(Optional)_ Manually add pathnames that should be treated as static paths and not SSR. For example, when these pathnames are requested, their response should come from a static file, rather than a server-side rendered response.                                    |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/adapters/cloudflare-pages/vite/index.ts)
