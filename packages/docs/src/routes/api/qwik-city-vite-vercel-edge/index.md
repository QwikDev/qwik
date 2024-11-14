---
title: \@builder.io/qwik-city/vite/vercel/edge API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city/vite/vercel/edge

## FUNCTION_DIRECTORY

```typescript
FUNCTION_DIRECTORY = "_qwik-city-edge";
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/adapters/vercel/edge/vite/index.ts)

## vercelEdgeAdapter

```typescript
export declare function vercelEdgeAdapter(
  opts?: VercelEdgeAdapterOptions,
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

[VercelEdgeAdapterOptions](#verceledgeadapteroptions)

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

any

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/adapters/vercel/edge/vite/index.ts)

## VercelEdgeAdapterOptions

```typescript
export interface VercelEdgeAdapterOptions extends ServerAdapterOptions
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

[awsLambdaHandler?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ AWS Handler Value for when the edge function uses AWS Lambda syntax.

Required: No

</td></tr>
<tr><td>

[environment?](#)

</td><td>

</td><td>

{ [key: string]: string; }

</td><td>

_(Optional)_ Specifies environment variables for the edge function.

Required: No

</td></tr>
<tr><td>

[maxDuration?](#)

</td><td>

</td><td>

number

</td><td>

_(Optional)_ Specifies the maximum duration that the edge function can run.

Required: No

</td></tr>
<tr><td>

[memory?](#)

</td><td>

</td><td>

number

</td><td>

_(Optional)_ Specifies the memory allocation for the edge function.

Required: No

</td></tr>
<tr><td>

[outputConfig?](#)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ Determines if the build should auto-generate the `.vercel/output/config.json` config.

Defaults to `true`.

</td></tr>
<tr><td>

[regions?](#)

</td><td>

</td><td>

string[]

</td><td>

_(Optional)_ Specifies the regions in which the edge function should run.

Required: No

</td></tr>
<tr><td>

[runtime?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ Specifies the runtime environment for the function, for example, Node.js, Deno, etc.

Required: No

</td></tr>
<tr><td>

[shouldAddHelpers?](#)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ Enables request and response helpers methods.

Required: No Default: false

</td></tr>
<tr><td>

[shouldAddSourceMapSupport?](#)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ Enables source map generation.

Required: No Default: false

</td></tr>
<tr><td>

[staticPaths?](#)

</td><td>

</td><td>

string[]

</td><td>

_(Optional)_ Manually add pathnames that should be treated as static paths and not SSR. For example, when these pathnames are requested, their response should come from a static file, rather than a server-side rendered response.

</td></tr>
<tr><td>

[target?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ Specifies the target platform for the deployment, such as Vercel, AWS, etc.

Required: No

</td></tr>
<tr><td>

[vcConfigEntryPoint?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ The `entrypoint` property in the `.vc-config.json` file. Indicates the initial file where code will be executed for the Edge Function.

Defaults to `entry.vercel-edge.js`.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/src/adapters/vercel/edge/vite/index.ts)
