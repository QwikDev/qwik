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
    next: NodeRequestNextFunction
  ) => Promise<void>;
  notFound: (
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse,
    next: (e: any) => void
  ) => Promise<void>;
  staticFile: (
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse,
    next: (e?: any) => void
  ) => Promise<void>;
};
```

| Parameter | Type                                                      | Description |
| --------- | --------------------------------------------------------- | ----------- |
| opts      | [QwikCityNodeRequestOptions](#qwikcitynoderequestoptions) |             |

**Returns:**

{ router: (req: IncomingMessage \| Http2ServerRequest, res: ServerResponse, next: [NodeRequestNextFunction](#noderequestnextfunction)) =&gt; Promise&lt;void&gt;; notFound: (req: IncomingMessage \| Http2ServerRequest, res: ServerResponse, next: (e: any) =&gt; void) =&gt; Promise&lt;void&gt;; staticFile: (req: IncomingMessage \| Http2ServerRequest, res: ServerResponse, next: (e?: any) =&gt; void) =&gt; Promise&lt;void&gt;; }

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/node/index.ts)

## NodeRequestNextFunction

```typescript
export interface NodeRequestNextFunction
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/node/index.ts)

## PlatformNode

```typescript
export interface PlatformNode
```

| Property              | Modifiers | Type                                  | Description  |
| --------------------- | --------- | ------------------------------------- | ------------ |
| [incomingMessage?](#) |           | IncomingMessage \| Http2ServerRequest | _(Optional)_ |
| [node?](#)            |           | string                                | _(Optional)_ |
| [ssr?](#)             |           | true                                  | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/node/index.ts)

## QwikCityNodeRequestOptions

```typescript
export interface QwikCityNodeRequestOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

| Property            | Modifiers | Type                                                              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------- | --------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [getClientConn?](#) |           | (req: IncomingMessage \| Http2ServerRequest) =&gt; ClientConn     | _(Optional)_ Provide a function that returns a <code>ClientConn</code> for the given request.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| [getOrigin?](#)     |           | (req: IncomingMessage \| Http2ServerRequest) =&gt; string \| null | <p>_(Optional)_ Provide a function that computes the origin of the server, used to resolve relative URLs and validate the request origin against CSRF attacks.</p><p>When not specified, it defaults to the <code>ORIGIN</code> environment variable (if set).</p><p>If <code>ORIGIN</code> is not set, it's derived from the incoming request, which is not recommended for production use. You can specify the <code>PROTOCOL_HEADER</code>, <code>HOST_HEADER</code> to <code>X-Forwarded-Proto</code> and <code>X-Forwarded-Host</code> respectively to override the default behavior.</p> |
| [origin?](#)        |           | string                                                            | _(Optional)_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| [static?](#)        |           | { root?: string; cacheControl?: string; }                         | _(Optional)_ Options for serving static files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/node/index.ts)
