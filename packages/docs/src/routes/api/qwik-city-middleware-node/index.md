---
title: \@builder.io/qwik-city/middleware/node API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city/middleware/node

## createQwikCity

```typescript
export declare function createQwikCity(opts: QwikCityNodeRequestOptions): {
  router: (
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse,
    next: NodeRequestNextFunction,
  ) => Promise<void>;
  notFound: (
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse,
    next: (e: any) => void,
  ) => Promise<void>;
  staticFile: (
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse,
    next: (e?: any) => void,
  ) => Promise<void>;
};
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

[QwikCityNodeRequestOptions](#qwikcitynoderequestoptions)

</td><td>

</td></tr>
</tbody></table>
**Returns:**

{ router: (req: IncomingMessage \| Http2ServerRequest, res: ServerResponse, next: [NodeRequestNextFunction](#noderequestnextfunction)) =&gt; Promise&lt;void&gt;; notFound: (req: IncomingMessage \| Http2ServerRequest, res: ServerResponse, next: (e: any) =&gt; void) =&gt; Promise&lt;void&gt;; staticFile: (req: IncomingMessage \| Http2ServerRequest, res: ServerResponse, next: (e?: any) =&gt; void) =&gt; Promise&lt;void&gt;; }

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/middleware/node/index.ts)

## NodeRequestNextFunction

```typescript
export interface NodeRequestNextFunction
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/middleware/node/index.ts)

## PlatformNode

```typescript
export interface PlatformNode
```

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

[incomingMessage?](#)

</td><td>

</td><td>

IncomingMessage \| Http2ServerRequest

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[node?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[ssr?](#)

</td><td>

</td><td>

true

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/middleware/node/index.ts)

## QwikCityNodeRequestOptions

```typescript
export interface QwikCityNodeRequestOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

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

[getClientConn?](#)

</td><td>

</td><td>

(req: IncomingMessage \| Http2ServerRequest) =&gt; ClientConn

</td><td>

_(Optional)_ Provide a function that returns a `ClientConn` for the given request.

</td></tr>
<tr><td>

[getOrigin?](#)

</td><td>

</td><td>

(req: IncomingMessage \| Http2ServerRequest) =&gt; string \| null

</td><td>

_(Optional)_ Provide a function that computes the origin of the server, used to resolve relative URLs and validate the request origin against CSRF attacks.

When not specified, it defaults to the `ORIGIN` environment variable (if set).

If `ORIGIN` is not set, it's derived from the incoming request, which is not recommended for production use. You can specify the `PROTOCOL_HEADER`, `HOST_HEADER` to `X-Forwarded-Proto` and `X-Forwarded-Host` respectively to override the default behavior.

</td></tr>
<tr><td>

[origin?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[static?](#)

</td><td>

</td><td>

{ root?: string; cacheControl?: string; }

</td><td>

_(Optional)_ Options for serving static files

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-city/middleware/node/index.ts)
