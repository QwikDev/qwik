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

[NetlifyEdgeAdapterOptions](#netlifyedgeadapteroptions)

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

any

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/adapters/netlify-edge/vite/index.ts)

## NetlifyEdgeAdapterOptions

```typescript
export interface NetlifyEdgeAdapterOptions extends ServerAdapterOptions
```

**Extends:** ServerAdapterOptions

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

[excludedPath?](#)

</td><td>

</td><td>

string \| string[]

</td><td>

_(Optional)_ Manually add path pattern that should be excluded from the edge function routes that are created by the 'manifest.json' file.

If not specified, the following paths are excluded by default:

- /build/\* - /favicon.ico - /robots.txt - /mainifest.json - /\~partytown/\* - /service-worker.js - /sitemap.xml

https://docs.netlify.com/edge-functions/declarations/\#declare-edge-functions-in-netlify-toml

</td></tr>
<tr><td>

[functionRoutes?](#)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ Determines if the build should generate the edge functions declarations `manifest.json` file.

https://docs.netlify.com/edge-functions/declarations/

Defaults to `true`.

</td></tr>
<tr><td>

[staticPaths?](#)

</td><td>

</td><td>

string[]

</td><td>

_(Optional)_ Manually add pathnames that should be treated as static paths and not SSR. For example, when these pathnames are requested, their response should come from a static file, rather than a server-side rendered response.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/adapters/netlify-edge/vite/index.ts)
