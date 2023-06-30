---
title: \@builder.io/qwik-city/static API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city/static

## generate

Use this function when SSG should be generated from another module, such as a Vite plugin. This function's should be passed the paths of the entry module and Qwik City Plan.

```typescript
export declare function generate(
  opts: StaticGenerateOptions
): Promise<StaticGenerateResult>;
```

| Parameter | Type                                            | Description |
| --------- | ----------------------------------------------- | ----------- |
| opts      | [StaticGenerateOptions](#staticgenerateoptions) |             |

**Returns:**

Promise&lt;[StaticGenerateResult](#staticgenerateresult)&gt;

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/static/index.ts)

## StaticGenerateOptions

```typescript
export interface StaticGenerateOptions extends StaticGenerateRenderOptions
```

**Extends:** [StaticGenerateRenderOptions](#staticgeneraterenderoptions)

| Property                    | Modifiers | Type   | Description                                                                                                            |
| --------------------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| [basePathname?](#)          |           | string | _(Optional)_ Defaults to <code>/</code>                                                                                |
| [qwikCityPlanModulePath](#) |           | string | Path to the Qwik City Plan module exporting the default <code>@qwik-city-plan</code>.                                  |
| [renderModulePath](#)       |           | string | Path to the SSR module exporting the default render function. In most cases it'll be <code>./src/entry.ssr.tsx</code>. |
| [rootDir?](#)               |           | string | _(Optional)_                                                                                                           |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/static/types.ts)

## StaticGenerateRenderOptions

```typescript
export interface StaticGenerateRenderOptions extends RenderOptions
```

**Extends:** RenderOptions

| Property                | Modifiers | Type           | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | --------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [emit404Pages?](#)      |           | boolean        | _(Optional)_ Set to <code>false</code> if the static build should not write custom or default <code>404.html</code> pages. Defaults to <code>true</code>.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [emitData?](#)          |           | boolean        | _(Optional)_ Set to <code>false</code> if the generated <code>q-data.json</code> data files should not be written to disk. Defaults to <code>true</code>.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| [emitHtml?](#)          |           | boolean        | _(Optional)_ Set to <code>false</code> if the generated static HTML files should not be written to disk. Setting to <code>false</code> is useful if the SSG should only write the <code>q-data.json</code> files to disk. Defaults to <code>true</code>.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| [exclude?](#)           |           | string[]       | _(Optional)_ Defines file system routes relative to the source <code>routes</code> directory that should not be static generated. Accepts wildcard behavior. This should not include the "base" pathname. <code>exclude</code> always takes priority over <code>include</code>.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [include?](#)           |           | string[]       | _(Optional)_ Defines file system routes relative to the source <code>routes</code> directory that should be static generated. Accepts wildcard behavior. This should not include the "base" pathname. If not provided, all routes will be static generated. <code>exclude</code> always takes priority over <code>include</code>.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| [log?](#)               |           | 'debug'        | _(Optional)_ Log level.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [maxTasksPerWorker?](#) |           | number         | _(Optional)_ Maximum number of tasks to be running at one time per worker. Defaults to <code>20</code>.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| [maxWorkers?](#)        |           | number         | _(Optional)_ Maximum number of workers to use while generating the static pages. Defaults to the number of CPUs available.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| [origin](#)             |           | string         | <p>The URL <code>origin</code>, which is a combination of the scheme (protocol) and hostname (domain). For example, <code>https://qwik.builder.io</code> has the protocol <code>https://</code> and domain <code>qwik.builder.io</code>. However, the <code>origin</code> does not include a <code>pathname</code>.</p><p>The <code>origin</code> is used to provide a full URL during Static Site Generation (SSG), and to simulate a complete URL rather than just the <code>pathname</code>. For example, in order to render a correct canonical tag URL or URLs within the <code>sitemap.xml</code>, the <code>origin</code> must be provided too.</p><p>If the site also starts with a pathname other than <code>/</code>, please use the <code>basePathname</code> option in the Qwik City config options.</p> |
| [outDir](#)             |           | string         | File system directory where the static files should be written.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| [sitemapOutFile?](#)    |           | string \| null | _(Optional)_ File system path to write the <code>sitemap.xml</code> to. Defaults to <code>sitemap.xml</code> and written to the root of the <code>outDir</code>. Setting to <code>null</code> will prevent the sitemap from being created.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/static/types.ts)

## StaticGenerateResult

```typescript
export interface StaticGenerateResult
```

| Property         | Modifiers | Type     | Description |
| ---------------- | --------- | -------- | ----------- |
| [duration](#)    |           | number   |             |
| [errors](#)      |           | number   |             |
| [rendered](#)    |           | number   |             |
| [staticPaths](#) |           | string[] |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/static/types.ts)
