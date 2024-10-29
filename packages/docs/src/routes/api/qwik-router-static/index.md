---
title: \@qwik.dev/qwik-router/static API Reference
---

# [API](/api) &rsaquo; @qwik.dev/qwik-router/static

## generate

Use this function when SSG should be generated from another module, such as a Vite plugin. This function's should be passed the paths of the entry module and Qwik Router Plan.

```typescript
export declare function generate(
  opts: StaticGenerateOptions,
): Promise<StaticGenerateResult>;
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

[StaticGenerateOptions](#staticgenerateoptions)

</td><td>

</td></tr>
</tbody></table>
**Returns:**

Promise&lt;[StaticGenerateResult](#staticgenerateresult)&gt;

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/static/index.ts)

## StaticGenerateOptions

```typescript
export interface StaticGenerateOptions extends StaticGenerateRenderOptions
```

**Extends:** [StaticGenerateRenderOptions](#staticgeneraterenderoptions)

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

[basePathname?](./router.staticgenerateoptions.basepathname.md)

</td><td>

</td><td>

string

</td><td>

_(Optional)_ Defaults to `/`

</td></tr>
<tr><td>

[qwikCityPlanModulePath?](./router.staticgenerateoptions.qwikcityplanmodulepath.md)

</td><td>

</td><td>

string

</td><td>

_(Optional)_

</td></tr>
<tr><td>

[qwikRouterConfigModulePath](./router.staticgenerateoptions.qwikrouterconfigmodulepath.md)

</td><td>

</td><td>

string

</td><td>

Path to the Qwik Router Config module exporting the default `@qwik-router-config`.

</td></tr>
<tr><td>

[renderModulePath](./router.staticgenerateoptions.rendermodulepath.md)

</td><td>

</td><td>

string

</td><td>

Path to the SSR module exporting the default render function. In most cases it'll be `./src/entry.ssr.tsx`.

</td></tr>
<tr><td>

[rootDir?](./router.staticgenerateoptions.rootdir.md)

</td><td>

</td><td>

string

</td><td>

_(Optional)_

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/static/types.ts)

## StaticGenerateRenderOptions

```typescript
export interface StaticGenerateRenderOptions extends RenderOptions
```

**Extends:** RenderOptions

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

[emit404Pages?](./router.staticgeneraterenderoptions.emit404pages.md)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ Set to `false` if the static build should not write custom or default `404.html` pages. Defaults to `true`.

</td></tr>
<tr><td>

[emitData?](./router.staticgeneraterenderoptions.emitdata.md)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ Set to `false` if the generated `q-data.json` data files should not be written to disk. Defaults to `true`.

</td></tr>
<tr><td>

[emitHtml?](./router.staticgeneraterenderoptions.emithtml.md)

</td><td>

</td><td>

boolean

</td><td>

_(Optional)_ Set to `false` if the generated static HTML files should not be written to disk. Setting to `false` is useful if the SSG should only write the `q-data.json` files to disk. Defaults to `true`.

</td></tr>
<tr><td>

[exclude?](./router.staticgeneraterenderoptions.exclude.md)

</td><td>

</td><td>

string[]

</td><td>

_(Optional)_ Defines file system routes relative to the source `routes` directory that should not be static generated. Accepts wildcard behavior. This should not include the "base" pathname. `exclude` always takes priority over `include`.

</td></tr>
<tr><td>

[include?](./router.staticgeneraterenderoptions.include.md)

</td><td>

</td><td>

string[]

</td><td>

_(Optional)_ Defines file system routes relative to the source `routes` directory that should be static generated. Accepts wildcard behavior. This should not include the "base" pathname. If not provided, all routes will be static generated. `exclude` always takes priority over `include`.

</td></tr>
<tr><td>

[log?](./router.staticgeneraterenderoptions.log.md)

</td><td>

</td><td>

'debug'

</td><td>

_(Optional)_ Log level.

</td></tr>
<tr><td>

[maxTasksPerWorker?](./router.staticgeneraterenderoptions.maxtasksperworker.md)

</td><td>

</td><td>

number

</td><td>

_(Optional)_ Maximum number of tasks to be running at one time per worker. Defaults to `20`.

</td></tr>
<tr><td>

[maxWorkers?](./router.staticgeneraterenderoptions.maxworkers.md)

</td><td>

</td><td>

number

</td><td>

_(Optional)_ Maximum number of workers to use while generating the static pages. Defaults to the number of CPUs available.

</td></tr>
<tr><td>

[origin](./router.staticgeneraterenderoptions.origin.md)

</td><td>

</td><td>

string

</td><td>

The URL `origin`, which is a combination of the scheme (protocol) and hostname (domain). For example, `https://qwik.dev` has the protocol `https://` and domain `qwik.dev`. However, the `origin` does not include a `pathname`.

The `origin` is used to provide a full URL during Static Site Generation (SSG), and to simulate a complete URL rather than just the `pathname`. For example, in order to render a correct canonical tag URL or URLs within the `sitemap.xml`, the `origin` must be provided too.

If the site also starts with a pathname other than `/`, please use the `basePathname` option in the Qwik Router config options.

</td></tr>
<tr><td>

[outDir](./router.staticgeneraterenderoptions.outdir.md)

</td><td>

</td><td>

string

</td><td>

File system directory where the static files should be written.

</td></tr>
<tr><td>

[sitemapOutFile?](./router.staticgeneraterenderoptions.sitemapoutfile.md)

</td><td>

</td><td>

string \| null

</td><td>

_(Optional)_ File system path to write the `sitemap.xml` to. Defaults to `sitemap.xml` and written to the root of the `outDir`. Setting to `null` will prevent the sitemap from being created.

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/static/types.ts)

## StaticGenerateResult

```typescript
export interface StaticGenerateResult
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

[duration](./router.staticgenerateresult.duration.md)

</td><td>

</td><td>

number

</td><td>

</td></tr>
<tr><td>

[errors](./router.staticgenerateresult.errors.md)

</td><td>

</td><td>

number

</td><td>

</td></tr>
<tr><td>

[rendered](./router.staticgenerateresult.rendered.md)

</td><td>

</td><td>

number

</td><td>

</td></tr>
<tr><td>

[staticPaths](./router.staticgenerateresult.staticpaths.md)

</td><td>

</td><td>

string[]

</td><td>

</td></tr>
</tbody></table>

[Edit this section](https://github.com/QwikDev/qwik/tree/main/packages/qwik-router/src/static/types.ts)
