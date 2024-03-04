---
title: \@builder.io/qwik-city/vite/netlify-edge API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city/vite/netlify-edge

## netlifyEdgeAdapter

```typescript
export declare function netlifyEdgeAdapter(
  opts?: NetlifyEdgeAdapterOptions,
): any;
```

| Parameter | Type                                                    | Description  |
| --------- | ------------------------------------------------------- | ------------ |
| opts      | [NetlifyEdgeAdapterOptions](#netlifyedgeadapteroptions) | _(Optional)_ |

**Returns:**

any

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/adapters/netlify-edge/vite/index.ts)

## NetlifyEdgeAdapterOptions

```typescript
export interface NetlifyEdgeAdapterOptions extends ServerAdapterOptions
```

**Extends:** ServerAdapterOptions

| Property             | Modifiers | Type               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------- | --------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [excludedPath?](#)   |           | string \| string[] | <p>_(Optional)_ Manually add path pattern that should be excluded from the edge function routes that are created by the 'manifest.json' file.</p><p>If not specified, the following paths are excluded by default:</p><p>- /build/\* - /favicon.ico - /robots.txt - /mainifest.json - /\~partytown/\* - /service-worker.js - /sitemap.xml</p><p>https://docs.netlify.com/edge-functions/declarations/\#declare-edge-functions-in-netlify-toml</p> |
| [functionRoutes?](#) |           | boolean            | <p>_(Optional)_ Determines if the build should generate the edge functions declarations <code>manifest.json</code> file.</p><p>https://docs.netlify.com/edge-functions/declarations/</p><p>Defaults to <code>true</code>.</p>                                                                                                                                                                                                                     |
| [staticPaths?](#)    |           | string[]           | _(Optional)_ Manually add pathnames that should be treated as static paths and not SSR. For example, when these pathnames are requested, their response should come from a static file, rather than a server-side rendered response.                                                                                                                                                                                                              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/adapters/netlify-edge/vite/index.ts)
