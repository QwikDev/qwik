---
title: \@builder.io/qwik-city/vite/vercel API Reference
---

# **API** @builder.io/qwik-city/vite/vercel

<h2 id="verceledgeadapter" data-kind="function" data-kind-label="F"><a aria-hidden="true" tabindex="-1" href="#verceledgeadapter"><span class="icon icon-link"></span></a>vercelEdgeAdapter </h2>

```typescript
export declare function vercelEdgeAdapter(opts?: VercelEdgeAdapterOptions): any;
```

| Parameter | Type                                                  | Description  |
| --------- | ----------------------------------------------------- | ------------ |
| opts      | [VercelEdgeAdapterOptions](#verceledgeadapteroptions) | _(Optional)_ |

**Returns:**

any

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/adapters/vercel-edge/vite/index.ts" target="_blanks">Edit this section</a></p>

<h2 id="verceledgeadapteroptions" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#verceledgeadapteroptions"><span class="icon icon-link"></span></a>VercelEdgeAdapterOptions </h2>

```typescript
export interface VercelEdgeAdapterOptions extends ServerAdapterOptions
```

**Extends:** ServerAdapterOptions

| Property                   | Modifiers | Type       | Description                                                                                                                                                                                                                                |
| -------------------------- | --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [outputConfig?](#)         |           | boolean    | <p>_(Optional)_ Determines if the build should auto-generate the <code>.vercel/output/config.json</code> config.</p><p>Defaults to <code>true</code>.</p>                                                                                  |
| [staticPaths?](#)          |           | string\[\] | _(Optional)_ Manually add pathnames that should be treated as static paths and not SSR. For example, when these pathnames are requested, their response should come from a static file, rather than a server-side rendered response.       |
| [vcConfigEntryPoint?](#)   |           | string     | <p>_(Optional)_ The <code>entrypoint</code> property in the <code>.vc-config.json</code> file. Indicates the initial file where code will be executed for the Edge Function.</p><p>Defaults to <code>entry.vercel-edge.js</code>.</p>      |
| [vcConfigEnvVarsInUse?](#) |           | string\[\] | <p>_(Optional)_ The <code>envVarsInUse</code> property in the <code>.vc-config.json</code> file. List of environment variable names that will be available for the Edge Function to utilize.</p><p>Defaults to <code>undefined</code>.</p> |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/adapters/vercel-edge/vite/index.ts" target="_blanks">Edit this section</a></p>

<h2 id="verceledgeadaptor" data-kind="variable" data-kind-label="V"><a aria-hidden="true" tabindex="-1" href="#verceledgeadaptor"><span class="icon icon-link"></span></a>vercelEdgeAdaptor </h2>

> Warning: This API is now obsolete.
>
> Use `vercelEdgeAdapter` exported from `@builder.io/qwik-city/adapters/vercel-edge/vite` instead.

```typescript
vercelEdgeAdaptor: typeof vercelEdgeAdapter;
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/adapters/vercel-edge/vite/index.ts" target="_blanks">Edit this section</a></p>

<h2 id="verceledgeadaptoroptions" data-kind="type-alias" data-kind-label="T"><a aria-hidden="true" tabindex="-1" href="#verceledgeadaptoroptions"><span class="icon icon-link"></span></a>VercelEdgeAdaptorOptions </h2>

> Warning: This API is now obsolete.
>
> Please use `VercelEdgeAdapterOptions` instead.

```typescript
export type VercelEdgeAdaptorOptions = VercelEdgeAdapterOptions;
```

**References:** [VercelEdgeAdapterOptions](#verceledgeadapteroptions)

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/adapters/vercel-edge/vite/index.ts" target="_blanks">Edit this section</a></p>
