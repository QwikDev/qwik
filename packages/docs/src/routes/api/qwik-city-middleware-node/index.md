---
title: \@builder.io/qwik-city/middleware/node API Reference
---

# **API** @builder.io/qwik-city/middleware/node

<h2 id="createqwikcity" data-kind="function" data-kind-label="F"><a aria-hidden="true" tabindex="-1" href="#createqwikcity"><span class="icon icon-link"></span></a>createQwikCity </h2>

```typescript
export declare function createQwikCity(opts: QwikCityNodeRequestOptions): {
  router: (
    req: IncomingMessage,
    res: ServerResponse,
    next: NodeRequestNextFunction
  ) => Promise<void>;
  notFound: (
    req: IncomingMessage,
    res: ServerResponse,
    next: (e: any) => void
  ) => Promise<void>;
  staticFile: (
    req: IncomingMessage,
    res: ServerResponse,
    next: (e?: any) => void
  ) => Promise<void>;
};
```

| Parameter | Type                                                      | Description |
| --------- | --------------------------------------------------------- | ----------- |
| opts      | [QwikCityNodeRequestOptions](#qwikcitynoderequestoptions) |             |

**Returns:**

{ router: (req: IncomingMessage, res: ServerResponse, next: [NodeRequestNextFunction](#noderequestnextfunction)) =&gt; Promise&lt;void&gt;; notFound: (req: IncomingMessage, res: ServerResponse, next: (e: any) =&gt; void) =&gt; Promise&lt;void&gt;; staticFile: (req: IncomingMessage, res: ServerResponse, next: (e?: any) =&gt; void) =&gt; Promise&lt;void&gt;; }

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/node/index.ts" target="_blanks">Edit this section</a></p>

<h2 id="platformnode-incomingmessage" data-kind="property-signature" data-kind-label="P"><a aria-hidden="true" tabindex="-1" href="#platformnode-incomingmessage"><span class="icon icon-link"></span></a>incomingMessage </h2>

```typescript
incomingMessage?: IncomingMessage;
```

<h2 id="platformnode-node" data-kind="property-signature" data-kind-label="P"><a aria-hidden="true" tabindex="-1" href="#platformnode-node"><span class="icon icon-link"></span></a>node </h2>

```typescript
node?: string;
```

<h2 id="noderequestnextfunction" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#noderequestnextfunction"><span class="icon icon-link"></span></a>NodeRequestNextFunction </h2>

```typescript
export interface NodeRequestNextFunction
```

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/node/index.ts" target="_blanks">Edit this section</a></p>

<h2 id="platformnode" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#platformnode"><span class="icon icon-link"></span></a>PlatformNode </h2>

```typescript
export interface PlatformNode
```

| Property                                          | Modifiers | Type            | Description  |
| ------------------------------------------------- | --------- | --------------- | ------------ |
| [incomingMessage?](#platformnode-incomingmessage) |           | IncomingMessage | _(Optional)_ |
| [node?](#platformnode-node)                       |           | string          | _(Optional)_ |
| [ssr?](#platformnode-ssr)                         |           | true            | _(Optional)_ |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/node/index.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikcity" data-kind="function" data-kind-label="F"><a aria-hidden="true" tabindex="-1" href="#qwikcity"><span class="icon icon-link"></span></a>qwikCity </h2>

> Warning: This API is now obsolete.
>
> Please use `createQwikCity()` instead.
>
> Example:
>
> ```ts
> import { createQwikCity } from "@builder.io/qwik-city/middleware/node";
> import qwikCityPlan from "@qwik-city-plan";
> import render from "./entry.ssr";
>
> const { router, notFound } = createQwikCity({ render, qwikCityPlan });
> ```

```typescript
export declare function qwikCity(
  render: Render,
  opts?: RenderOptions
): {
  router: (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>,
    next: NodeRequestNextFunction
  ) => Promise<void>;
  notFound: (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>,
    next: (e: any) => void
  ) => Promise<void>;
  staticFile: (
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>,
    next: (e?: any) => void
  ) => Promise<void>;
};
```

| Parameter | Type          | Description  |
| --------- | ------------- | ------------ |
| render    | Render        |              |
| opts      | RenderOptions | _(Optional)_ |

**Returns:**

{ router: (req: IncomingMessage, res: ServerResponse&lt;IncomingMessage&gt;, next: [NodeRequestNextFunction](#noderequestnextfunction)) =&gt; Promise&lt;void&gt;; notFound: (req: IncomingMessage, res: ServerResponse&lt;IncomingMessage&gt;, next: (e: any) =&gt; void) =&gt; Promise&lt;void&gt;; staticFile: (req: IncomingMessage, res: ServerResponse&lt;IncomingMessage&gt;, next: (e?: any) =&gt; void) =&gt; Promise&lt;void&gt;; }

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/node/index.ts" target="_blanks">Edit this section</a></p>

<h2 id="qwikcitynoderequestoptions" data-kind="interface" data-kind-label="I"><a aria-hidden="true" tabindex="-1" href="#qwikcitynoderequestoptions"><span class="icon icon-link"></span></a>QwikCityNodeRequestOptions </h2>

```typescript
export interface QwikCityNodeRequestOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

| Property                                      | Modifiers | Type                                      | Description                                   |
| --------------------------------------------- | --------- | ----------------------------------------- | --------------------------------------------- |
| [static?](#qwikcitynoderequestoptions-static) |           | { root?: string; cacheControl?: string; } | _(Optional)_ Options for serving static files |

<p class="api-edit"><a href="https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/node/index.ts" target="_blanks">Edit this section</a></p>

<h2 id="platformnode-ssr" data-kind="property-signature" data-kind-label="P"><a aria-hidden="true" tabindex="-1" href="#platformnode-ssr"><span class="icon icon-link"></span></a>ssr </h2>

```typescript
ssr?: true;
```

<h2 id="qwikcitynoderequestoptions-static" data-kind="property-signature" data-kind-label="P"><a aria-hidden="true" tabindex="-1" href="#qwikcitynoderequestoptions-static"><span class="icon icon-link"></span></a>static </h2>

Options for serving static files

```typescript
static?: {
        root?: string;
        cacheControl?: string;
    };
```
