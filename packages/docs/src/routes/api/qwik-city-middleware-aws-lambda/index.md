---
title: \@builder.io/qwik-city/middleware/aws-lambda API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city/middleware/aws-lambda

## createQwikCity

```typescript
export declare function createQwikCity(opts: AwsOpt): {
  fixPath: (pathT: string) => string;
  router: (
    req: import("http").IncomingMessage | import("http2").Http2ServerRequest,
    res: import("http").ServerResponse<import("http").IncomingMessage>,
    next: import("@builder.io/qwik-city/middleware/node").NodeRequestNextFunction,
  ) => Promise<void>;
  staticFile: (
    req: import("http").IncomingMessage | import("http2").Http2ServerRequest,
    res: import("http").ServerResponse<import("http").IncomingMessage>,
    next: (e?: any) => void,
  ) => Promise<void>;
  notFound: (
    req: import("http").IncomingMessage | import("http2").Http2ServerRequest,
    res: import("http").ServerResponse<import("http").IncomingMessage>,
    next: (e: any) => void,
  ) => Promise<void>;
  handle: (req: any, res: any) => void;
};
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| opts      | AwsOpt |             |

**Returns:**

{ fixPath: (pathT: string) =&gt; string; router: (req: import("http").IncomingMessage \| import("http2").Http2ServerRequest, res: import("http").ServerResponse&lt;import("http").IncomingMessage&gt;, next: import("@builder.io/qwik-city/middleware/node").NodeRequestNextFunction) =&gt; Promise&lt;void&gt;; staticFile: (req: import("http").IncomingMessage \| import("http2").Http2ServerRequest, res: import("http").ServerResponse&lt;import("http").IncomingMessage&gt;, next: (e?: any) =&gt; void) =&gt; Promise&lt;void&gt;; notFound: (req: import("http").IncomingMessage \| import("http2").Http2ServerRequest, res: import("http").ServerResponse&lt;import("http").IncomingMessage&gt;, next: (e: any) =&gt; void) =&gt; Promise&lt;void&gt;; handle: (req: any, res: any) =&gt; void; }

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/aws-lambda/index.ts)

## PlatformAwsLambda

```typescript
export interface PlatformAwsLambda extends Object
```

**Extends:** Object

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/aws-lambda/index.ts)

## QwikCityAwsLambdaOptions

```typescript
export interface QwikCityAwsLambdaOptions extends ServerRenderOptions
```

**Extends:** ServerRenderOptions

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/middleware/aws-lambda/index.ts)
