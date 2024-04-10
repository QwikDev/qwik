---
title: \@builder.io/qwik/server API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik/server

## getQwikLoaderScript

Provides the `qwikloader.js` file as a string. Useful for tooling to inline the qwikloader script into HTML.

```typescript
export declare function getQwikLoaderScript(opts?: { debug?: boolean }): string;
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

{ debug?: boolean; }

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

string

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/scripts.ts)

## getQwikPrefetchWorkerScript

Provides the `qwik-prefetch-service-worker.js` file as a string. Useful for tooling to inline the qwikloader script into HTML.

```typescript
export declare function getQwikPrefetchWorkerScript(opts?: {
  debug?: boolean;
}): string;
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

{ debug?: boolean; }

</td><td>

_(Optional)_

</td></tr>
</tbody></table>
**Returns:**

string

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/scripts.ts)

## InOrderAuto

```typescript
export interface InOrderAuto
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

[maximunChunk?](#)

</td><td>

</td><td>

number

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[maximunInitialChunk?](#)

</td><td>

</td><td>

number

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[strategy](#)

</td><td>

</td><td>

'auto'

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## InOrderDisabled

```typescript
export interface InOrderDisabled
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

[strategy](#)

</td><td>

</td><td>

'disabled'

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## InOrderStreaming

```typescript
export type InOrderStreaming = InOrderAuto | InOrderDisabled | InOrderDirect;
```

**References:** [InOrderAuto](#inorderauto), [InOrderDisabled](#inorderdisabled)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## PrefetchImplementation

```typescript
export interface PrefetchImplementation
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

[linkInsert?](#)

</td><td>

</td><td>

'js-append' \| 'html-append' \| null

</td><td>

_(Optional)_ `js-append`: Use JS runtime to create each `<link>` and append to the body.

`html-append`: Render each `<link>` within html, appended at the end of the body.

</td></tr>
<tr><td>

[linkRel?](#)

</td><td>

</td><td>

'prefetch' \| 'preload' \| 'modulepreload' \| null

</td><td>

_(Optional)_ Value of the `<link rel="...">` attribute when link is used. Defaults to `prefetch` if links are inserted.

</td></tr>
<tr><td>

[prefetchEvent?](#)

</td><td>

</td><td>

'always' \| null

</td><td>

_(Optional)_ Dispatch a `qprefetch` event with detail data containing the bundles that should be prefetched. The event dispatch script will be inlined into the document's HTML so any listeners of this event should already be ready to handle the event.

This implementation will inject a script similar to:

```
<script type="module">
  document.dispatchEvent(new CustomEvent("qprefetch", { detail:{ "bundles": [...] } }))
</script>
```

By default, the `prefetchEvent` implementation will be set to `always`.

</td></tr>
<tr><td>

[workerFetchInsert?](#)

</td><td>

</td><td>

'always' \| 'no-link-support' \| null

</td><td>

_(Optional)_ `always`: Always include the worker fetch JS runtime.

`no-link-support`: Only include the worker fetch JS runtime when the browser doesn't support `<link>` prefetch/preload/modulepreload.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## PrefetchResource

```typescript
export interface PrefetchResource
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

[imports](#)

</td><td>

</td><td>

[PrefetchResource](#prefetchresource)[]

</td><td>

</td></tr>
<tr><td>

[url](#)

</td><td>

</td><td>

string

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## PrefetchStrategy

```typescript
export interface PrefetchStrategy
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

[implementation?](#)

</td><td>

</td><td>

[PrefetchImplementation](#prefetchimplementation)

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[symbolsToPrefetch?](#)

</td><td>

</td><td>

[SymbolsToPrefetch](#symbolstoprefetch)

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## QwikLoaderOptions

```typescript
export interface QwikLoaderOptions
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

[include?](#)

</td><td>

</td><td>

'always' \| 'never' \| 'auto'

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[position?](#)

</td><td>

</td><td>

'top' \| 'bottom'

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## Render

```typescript
export type Render = RenderToString | RenderToStream;
```

**References:** [RenderToString](#rendertostring), [RenderToStream](#rendertostream)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## RenderOptions

```typescript
export interface RenderOptions extends SerializeDocumentOptions
```

**Extends:** [SerializeDocumentOptions](#serializedocumentoptions)

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

[base?](#)

</td><td>

</td><td>

string \| ((options: [RenderOptions](#renderoptions)) =&gt; string)

</td><td>

_(Optional)_ Specifies the root of the JS files of the client build. Setting a base, will cause the render of the `q:base` attribute in the `q:container` element.

</td></tr>
<tr><td>

[containerAttributes?](#)

</td><td>

</td><td>

Record&lt;string, string&gt;

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[containerTagName?](#)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ When set, the app is serialized into a fragment. And the returned html is not a complete document. Defaults to `html`

</td></tr>
<tr><td>

[locale?](#)

</td><td>

</td><td>

string \| ((options: [RenderOptions](#renderoptions)) =&gt; string)

</td><td>

_(Optional)_ Language to use when rendering the document.

</td></tr>
<tr><td>

[prefetchStrategy?](#)

</td><td>

</td><td>

[PrefetchStrategy](#prefetchstrategy) \| null

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[qwikLoader?](#)

</td><td>

</td><td>

[QwikLoaderOptions](#qwikloaderoptions)

</td><td>

_(Optional)_ Specifies if the Qwik Loader script is added to the document or not.

Defaults to `{ include: true }`.

</td></tr>
<tr><td>

[qwikPrefetchServiceWorker?](#)

</td><td>

</td><td>

QwikPrefetchServiceWorkerOptions

</td><td>

_(Optional)_ Specifies if the Qwik Prefetch Service Worker script is added to the document or not.

Defaults to `{ include: false }`. NOTE: This may be change in the future.

</td></tr>
<tr><td>

[serverData?](#)

</td><td>

</td><td>

Record&lt;string, any&gt;

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[snapshot?](#)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ Defaults to `true`

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## RenderResult

```typescript
export interface RenderResult
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

[isStatic](#)

</td><td>

</td><td>

boolean

</td><td>

</td></tr>
<tr><td>

[manifest?](#)

</td><td>

</td><td>

QwikManifest

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[prefetchResources](#)

</td><td>

</td><td>

[PrefetchResource](#prefetchresource)[]

</td><td>

</td></tr>
<tr><td>

[snapshotResult](#)

</td><td>

</td><td>

SnapshotResult \| undefined

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## renderToStream

```typescript
export type RenderToStream = (
  opts: RenderToStreamOptions,
) => Promise<RenderToStreamResult>;
```

**References:** [RenderToStreamOptions](#rendertostreamoptions), [RenderToStreamResult](#rendertostreamresult)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/render.ts)

## RenderToStream

```typescript
export type RenderToStream = (
  opts: RenderToStreamOptions,
) => Promise<RenderToStreamResult>;
```

**References:** [RenderToStreamOptions](#rendertostreamoptions), [RenderToStreamResult](#rendertostreamresult)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## RenderToStreamOptions

```typescript
export interface RenderToStreamOptions extends RenderOptions
```

**Extends:** [RenderOptions](#renderoptions)

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

[stream](#)

</td><td>

</td><td>

StreamWriter

</td><td>

</td></tr>
<tr><td>

[streaming?](#)

</td><td>

</td><td>

[StreamingOptions](#streamingoptions)

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## RenderToStreamResult

```typescript
export interface RenderToStreamResult extends RenderResult
```

**Extends:** [RenderResult](#renderresult)

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

[flushes](#)

</td><td>

</td><td>

number

</td><td>

</td></tr>
<tr><td>

[size](#)

</td><td>

</td><td>

number

</td><td>

</td></tr>
<tr><td>

[timing](#)

</td><td>

</td><td>

{ firstFlush: number; render: number; snapshot: number; }

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## renderToString

```typescript
export type RenderToString = (
  opts: RenderToStringOptions,
) => Promise<RenderToStringResult>;
```

**References:** [RenderToStringOptions](#rendertostringoptions), [RenderToStringResult](#rendertostringresult)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/render.ts)

## RenderToString

```typescript
export type RenderToString = (
  opts: RenderToStringOptions,
) => Promise<RenderToStringResult>;
```

**References:** [RenderToStringOptions](#rendertostringoptions), [RenderToStringResult](#rendertostringresult)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## RenderToStringOptions

```typescript
export interface RenderToStringOptions extends RenderOptions
```

**Extends:** [RenderOptions](#renderoptions)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## RenderToStringResult

```typescript
export interface RenderToStringResult extends RenderResult
```

**Extends:** [RenderResult](#renderresult)

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

[html](#)

</td><td>

</td><td>

string

</td><td>

</td></tr>
<tr><td>

[timing](#)

</td><td>

</td><td>

{ render: number; snapshot: number; }

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## resolveManifest

```typescript
export declare function resolveManifest(
  manifest: QwikManifest | ResolvedManifest | undefined,
): ResolvedManifest | undefined;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

manifest

</td><td>

QwikManifest \| ResolvedManifest \| undefined

</td><td>

</td></tr>
</tbody></table>
**Returns:**

ResolvedManifest \| undefined

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/render.ts)

## SerializeDocumentOptions

```typescript
export interface SerializeDocumentOptions
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

[debug?](#)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[manifest?](#)

</td><td>

</td><td>

QwikManifest \| ResolvedManifest

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[symbolMapper?](#)

</td><td>

</td><td>

SymbolMapperFn

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## setServerPlatform

```typescript
export declare function setServerPlatform(
  manifest: QwikManifest | ResolvedManifest | undefined,
): Promise<void>;
```

<table><thead><tr><th>

Parameter

</th><th>

Type

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

manifest

</td><td>

QwikManifest \| ResolvedManifest \| undefined

</td><td>

</td></tr>
</tbody></table>
**Returns:**

Promise&lt;void&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/index.ts)

## StreamingOptions

```typescript
export interface StreamingOptions
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

[inOrder?](#)

</td><td>

</td><td>

[InOrderStreaming](#inorderstreaming)

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## SymbolsToPrefetch

Auto: Prefetch all possible QRLs used by the document. Default

```typescript
export type SymbolsToPrefetch =
  | "auto"
  | ((opts: { manifest: QwikManifest }) => PrefetchResource[]);
```

**References:** [PrefetchResource](#prefetchresource)

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/types.ts)

## versions

```typescript
versions: {
    readonly qwik: string;
    readonly qwikDom: string;
}
```

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik/src/server/utils.ts)
