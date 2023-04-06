---
title: \@builder.io/qwik-city/vite/cloudflare-pages API Reference
---

# **API** @builder.io/qwik-city/vite/cloudflare-pages

<h2 id="cloudflarepagesadapter" data-kind="function" data-kind-label="F"><a aria-hidden="true" tabindex="-1" href="#cloudflarepagesadapter"><span class="icon icon-link"></span></a>cloudflarePagesAdapter </h2>

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

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/adapters/cloudflare-pages/vite/index.ts" target="_blanks">Edit this section</a></p>

<h2 id="cloudflarepagesadapteroptions" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#cloudflarepagesadapteroptions"><span class="icon icon-link"></span></a>CloudflarePagesAdapterOptions </h2>

```typescript
export interface CloudflarePagesAdapterOptions extends ServerAdapterOptions
```

**Extends:** ServerAdapterOptions

| Property             | Modifiers | Type       | Description                                                                                                                                                                                                                                                             |
| -------------------- | --------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [functionRoutes?](#) |           | boolean    | <p>_(Optional)_ Determines if the build should generate the function invocation routes <code>\_routes.json</code> file.</p><p>https://developers.cloudflare.com/pages/platform/functions/routing/\#functions-invocation-routes</p><p>Defaults to <code>true</code>.</p> |
| [staticPaths?](#)    |           | string\[\] | _(Optional)_ Manually add pathnames that should be treated as static paths and not SSR. For example, when these pathnames are requested, their response should come from a static file, rather than a server-side rendered response.                                    |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/adapters/cloudflare-pages/vite/index.ts" target="_blanks">Edit this section</a></p>
