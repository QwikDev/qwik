---
title: \@builder.io/qwik/server API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik/server

## getQwikLoaderScript

Provides the `qwikloader.js` file as a string. Useful for tooling to inline the qwikloader script into HTML.

```typescript
export declare function getQwikLoaderScript(opts?: {
  events?: string[];
  debug?: boolean;
}): string;
```

| Parameter | Type                                    | Description  |
| --------- | --------------------------------------- | ------------ |
| opts      | { events?: string[]; debug?: boolean; } | _(Optional)_ |

**Returns:**

string

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/scripts.ts)

## getQwikPrefetchWorkerScript

Provides the `qwik-prefetch-service-worker.js` file as a string. Useful for tooling to inline the qwikloader script into HTML.

```typescript
export declare function getQwikPrefetchWorkerScript(opts?: {
  debug?: boolean;
}): string;
```

| Parameter | Type                 | Description  |
| --------- | -------------------- | ------------ |
| opts      | { debug?: boolean; } | _(Optional)_ |

**Returns:**

string

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/scripts.ts)

## InOrderAuto

```typescript
export interface InOrderAuto
```

| Property                  | Modifiers | Type   | Description  |
| ------------------------- | --------- | ------ | ------------ |
| [maximunChunk?](#)        |           | number | _(Optional)_ |
| [maximunInitialChunk?](#) |           | number | _(Optional)_ |
| [strategy](#)             |           | 'auto' |              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## InOrderDisabled

```typescript
export interface InOrderDisabled
```

| Property      | Modifiers | Type       | Description |
| ------------- | --------- | ---------- | ----------- |
| [strategy](#) |           | 'disabled' |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## InOrderStreaming

```typescript
export type InOrderStreaming = InOrderAuto | InOrderDisabled | InOrderDirect;
```

**References:** [InOrderAuto](#inorderauto), [InOrderDisabled](#inorderdisabled)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## PrefetchImplementation

```typescript
export interface PrefetchImplementation
```

| Property            | Modifiers | Type                                               | Description                                                                                                                                                                                                                                                                                                                              |
| ------------------- | --------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [linkInsert?](#)    |           | 'js-append' \| 'html-append' \| null               | <p>_(Optional)_ <code>js-append</code>: Use JS runtime to create each <code>&lt;link&gt;</code> and append to the body.</p><p><code>html-append</code>: Render each <code>&lt;link&gt;</code> within html, appended at the end of the body.</p>                                                                                          |
| [linkRel?](#)       |           | 'prefetch' \| 'preload' \| 'modulepreload' \| null | _(Optional)_ Value of the <code>&lt;link rel=&quot;...&quot;&gt;</code> attribute when link is used. Defaults to <code>prefetch</code> if links are inserted.                                                                                                                                                                            |
| [prefetchEvent?](#) |           | 'always' \| null                                   | <p>_(Optional)_ Dispatch a <code>qprefetch</code> event with detail data containing the bundles that should be prefetched. The event dispatch script will be inlined into the document's HTML so any listeners of this event should already be ready to handle the event.</p><p>This implementation will inject a script similar to:</p> |

```
<script type="module">
  document.dispatchEvent(new CustomEvent("qprefetch", { detail:{ "bundles": [...] } }))
</script>
```

<p>By default, the <code>prefetchEvent</code> implementation will be set to <code>always</code>.</p> |
|  [workerFetchInsert?](#) |  | 'always' \| 'no-link-support' \| null | <p>_(Optional)_ <code>always</code>: Always include the worker fetch JS runtime.</p><p><code>no-link-support</code>: Only include the worker fetch JS runtime when the browser doesn't support <code>&lt;link&gt;</code> prefetch/preload/modulepreload.</p> |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## PrefetchResource

```typescript
export interface PrefetchResource
```

| Property     | Modifiers | Type                                    | Description |
| ------------ | --------- | --------------------------------------- | ----------- |
| [imports](#) |           | [PrefetchResource](#prefetchresource)[] |             |
| [url](#)     |           | string                                  |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## PrefetchStrategy

```typescript
export interface PrefetchStrategy
```

| Property                | Modifiers | Type                                              | Description  |
| ----------------------- | --------- | ------------------------------------------------- | ------------ |
| [implementation?](#)    |           | [PrefetchImplementation](#prefetchimplementation) | _(Optional)_ |
| [symbolsToPrefetch?](#) |           | [SymbolsToPrefetch](#symbolstoprefetch)           | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## QwikLoaderOptions

```typescript
export interface QwikLoaderOptions
```

| Property       | Modifiers | Type                          | Description  |
| -------------- | --------- | ----------------------------- | ------------ |
| [events?](#)   |           | string[]                      | _(Optional)_ |
| [include?](#)  |           | 'always' \| 'never' \| 'auto' | _(Optional)_ |
| [position?](#) |           | 'top' \| 'bottom'             | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## Render

```typescript
export type Render = RenderToString | RenderToStream;
```

**References:** [RenderToString](#rendertostring), [RenderToStream](#rendertostream)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## RenderOptions

```typescript
export interface RenderOptions extends SerializeDocumentOptions
```

**Extends:** [SerializeDocumentOptions](#serializedocumentoptions)

| Property                        | Modifiers | Type                                                                | Description                                                                                                                                                                                          |
| ------------------------------- | --------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [base?](#)                      |           | string \| ((options: [RenderOptions](#renderoptions)) =&gt; string) | _(Optional)_ Specifies the root of the JS files of the client build. Setting a base, will cause the render of the <code>q:base</code> attribute in the <code>q:container</code> element.             |
| [containerAttributes?](#)       |           | Record&lt;string, string&gt;                                        | _(Optional)_                                                                                                                                                                                         |
| [containerTagName?](#)          |           | string                                                              | _(Optional)_ When set, the app is serialized into a fragment. And the returned html is not a complete document. Defaults to <code>html</code>                                                        |
| [locale?](#)                    |           | string \| ((options: [RenderOptions](#renderoptions)) =&gt; string) | _(Optional)_ Language to use when rendering the document.                                                                                                                                            |
| [prefetchStrategy?](#)          |           | [PrefetchStrategy](#prefetchstrategy) \| null                       | _(Optional)_                                                                                                                                                                                         |
| [qwikLoader?](#)                |           | [QwikLoaderOptions](#qwikloaderoptions)                             | <p>_(Optional)_ Specifies if the Qwik Loader script is added to the document or not.</p><p>Defaults to <code>{ include: true }</code>.</p>                                                           |
| [qwikPrefetchServiceWorker?](#) |           | QwikPrefetchServiceWorkerOptions                                    | <p>_(Optional)_ Specifies if the Qwik Prefetch Service Worker script is added to the document or not.</p><p>Defaults to <code>{ include: false }</code>. NOTE: This may be change in the future.</p> |
| [serverData?](#)                |           | Record&lt;string, any&gt;                                           | _(Optional)_                                                                                                                                                                                         |
| [snapshot?](#)                  |           | boolean                                                             | _(Optional)_ Defaults to <code>true</code>                                                                                                                                                           |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## RenderResult

```typescript
export interface RenderResult
```

| Property               | Modifiers | Type                                    | Description  |
| ---------------------- | --------- | --------------------------------------- | ------------ |
| [isStatic](#)          |           | boolean                                 |              |
| [manifest?](#)         |           | QwikManifest                            | _(Optional)_ |
| [prefetchResources](#) |           | [PrefetchResource](#prefetchresource)[] |              |
| [snapshotResult](#)    |           | SnapshotResult \| undefined             |              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## renderToStream

```typescript
export type RenderToStream = (
  opts: RenderToStreamOptions,
) => Promise<RenderToStreamResult>;
```

**References:** [RenderToStreamOptions](#rendertostreamoptions), [RenderToStreamResult](#rendertostreamresult)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/render.ts)

## RenderToStream

```typescript
export type RenderToStream = (
  opts: RenderToStreamOptions,
) => Promise<RenderToStreamResult>;
```

**References:** [RenderToStreamOptions](#rendertostreamoptions), [RenderToStreamResult](#rendertostreamresult)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## RenderToStreamOptions

```typescript
export interface RenderToStreamOptions extends RenderOptions
```

**Extends:** [RenderOptions](#renderoptions)

| Property        | Modifiers | Type                                  | Description  |
| --------------- | --------- | ------------------------------------- | ------------ |
| [stream](#)     |           | StreamWriter                          |              |
| [streaming?](#) |           | [StreamingOptions](#streamingoptions) | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## RenderToStreamResult

```typescript
export interface RenderToStreamResult extends RenderResult
```

**Extends:** [RenderResult](#renderresult)

| Property     | Modifiers | Type                                                      | Description |
| ------------ | --------- | --------------------------------------------------------- | ----------- |
| [flushes](#) |           | number                                                    |             |
| [size](#)    |           | number                                                    |             |
| [timing](#)  |           | { firstFlush: number; render: number; snapshot: number; } |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## renderToString

```typescript
export type RenderToString = (
  opts: RenderToStringOptions,
) => Promise<RenderToStringResult>;
```

**References:** [RenderToStringOptions](#rendertostringoptions), [RenderToStringResult](#rendertostringresult)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/render.ts)

## RenderToString

```typescript
export type RenderToString = (
  opts: RenderToStringOptions,
) => Promise<RenderToStringResult>;
```

**References:** [RenderToStringOptions](#rendertostringoptions), [RenderToStringResult](#rendertostringresult)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## RenderToStringOptions

```typescript
export interface RenderToStringOptions extends RenderOptions
```

**Extends:** [RenderOptions](#renderoptions)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## RenderToStringResult

```typescript
export interface RenderToStringResult extends RenderResult
```

**Extends:** [RenderResult](#renderresult)

| Property    | Modifiers | Type                                  | Description |
| ----------- | --------- | ------------------------------------- | ----------- |
| [html](#)   |           | string                                |             |
| [timing](#) |           | { render: number; snapshot: number; } |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## resolveManifest

```typescript
export declare function resolveManifest(
  manifest: QwikManifest | ResolvedManifest | undefined,
): ResolvedManifest | undefined;
```

| Parameter | Type                                          | Description |
| --------- | --------------------------------------------- | ----------- |
| manifest  | QwikManifest \| ResolvedManifest \| undefined |             |

**Returns:**

ResolvedManifest \| undefined

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/render.ts)

## SerializeDocumentOptions

```typescript
export interface SerializeDocumentOptions
```

| Property           | Modifiers | Type                             | Description  |
| ------------------ | --------- | -------------------------------- | ------------ |
| [debug?](#)        |           | boolean                          | _(Optional)_ |
| [manifest?](#)     |           | QwikManifest \| ResolvedManifest | _(Optional)_ |
| [symbolMapper?](#) |           | SymbolMapperFn                   | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## setServerPlatform

```typescript
export declare function setServerPlatform(
  manifest: QwikManifest | ResolvedManifest | undefined,
): Promise<void>;
```

| Parameter | Type                                          | Description |
| --------- | --------------------------------------------- | ----------- |
| manifest  | QwikManifest \| ResolvedManifest \| undefined |             |

**Returns:**

Promise&lt;void&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/index.ts)

## StreamingOptions

```typescript
export interface StreamingOptions
```

| Property      | Modifiers | Type                                  | Description  |
| ------------- | --------- | ------------------------------------- | ------------ |
| [inOrder?](#) |           | [InOrderStreaming](#inorderstreaming) | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## SymbolsToPrefetch

Auto: Prefetch all possible QRLs used by the document. Default

```typescript
export type SymbolsToPrefetch =
  | "auto"
  | ((opts: { manifest: QwikManifest }) => PrefetchResource[]);
```

**References:** [PrefetchResource](#prefetchresource)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/types.ts)

## versions

```typescript
versions: {
    readonly qwik: string;
    readonly qwikDom: string;
}
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/server/utils.ts)
