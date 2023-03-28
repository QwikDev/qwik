---
title: \@builder.io/qwik-city/middleware/azure-swa API Reference
---

# **API** @builder.io/qwik-city/middleware/azure-swa

<h2 id="createqwikcity" data-kind="function" data-kind-label="F"><a aria-hidden="true" tabindex="-1" href="#createqwikcity"><span class="icon icon-link"></span></a>createQwikCity </h2>

```typescript
export declare function createQwikCity(
  opts: QwikCityAzureOptions
): AzureFunction;
```

| Parameter | Type                                          | Description |
| --------- | --------------------------------------------- | ----------- |
| opts      | [QwikCityAzureOptions](#qwikcityazureoptions) |             |

**Returns:**

AzureFunction

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/azure-swa/index.ts" target="_blanks">Edit this section</a></p>

<h2 id="platformazure" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#platformazure"><span class="icon icon-link"></span></a>PlatformAzure </h2>

```typescript
export interface PlatformAzure extends Partial<Context>
```

**Extends:** Partial&lt;Context&gt;

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/azure-swa/index.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikcity" data-kind="function" data-kind-label="F"><a aria-hidden="true" tabindex="-1" href="#qwikcity"><span class="icon icon-link"></span></a>qwikCity </h2>

> Warning: This API is now obsolete.
>
> Please use `createQwikCity()` instead.
>
> Example:
>
> ```ts
> import { createQwikCity } from "@builder.io/qwik-city/middleware/azure-swa";
> import qwikCityPlan from "@qwik-city-plan";
> import render from "./entry.ssr";
>
> export default createQwikCity({ render, qwikCityPlan });
> ```

```typescript
export declare function qwikCity(
  render: Render,
  opts?: RenderOptions
): AzureFunction;
```

| Parameter | Type          | Description  |
| --------- | ------------- | ------------ |
| render    | Render        |              |
| opts      | RenderOptions | _(Optional)_ |

**Returns:**

AzureFunction

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/azure-swa/index.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikcityazureoptions" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikcityazureoptions"><span class="icon icon-link"></span></a>QwikCityAzureOptions </h2>

```typescript
export interface QwikCityAzureOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/azure-swa/index.ts" target="_blanks">Edit this section</a></p>
