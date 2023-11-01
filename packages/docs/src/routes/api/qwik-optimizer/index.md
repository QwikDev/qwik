---
title: \@builder.io/qwik/optimizer API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik/optimizer

## basename

```typescript
basename(path: string, ext?: string): string;
```

| Parameter | Type   | Description  |
| --------- | ------ | ------------ |
| path      | string |              |
| ext       | string | _(Optional)_ |

**Returns:**

string

## ComponentEntryStrategy

```typescript
export interface ComponentEntryStrategy
```

| Property     | Modifiers | Type                         | Description  |
| ------------ | --------- | ---------------------------- | ------------ |
| [manual?](#) |           | Record&lt;string, string&gt; | _(Optional)_ |
| [type](#)    |           | 'component'                  |              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## createOptimizer

```typescript
createOptimizer: (optimizerOptions?: OptimizerOptions) => Promise<Optimizer>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/optimizer.ts)

## Diagnostic

```typescript
export interface Diagnostic
```

| Property         | Modifiers | Type                                      | Description |
| ---------------- | --------- | ----------------------------------------- | ----------- |
| [category](#)    |           | [DiagnosticCategory](#diagnosticcategory) |             |
| [code](#)        |           | string \| null                            |             |
| [file](#)        |           | string                                    |             |
| [highlights](#)  |           | [SourceLocation](#sourcelocation)[]       |             |
| [message](#)     |           | string                                    |             |
| [scope](#)       |           | string                                    |             |
| [suggestions](#) |           | string[] \| null                          |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## DiagnosticCategory

```typescript
export type DiagnosticCategory = "error" | "warning" | "sourceError";
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## dirname

```typescript
dirname(path: string): string;
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| path      | string |             |

**Returns:**

string

## EntryStrategy

```typescript
export type EntryStrategy =
  | InlineEntryStrategy
  | HoistEntryStrategy
  | SingleEntryStrategy
  | HookEntryStrategy
  | ComponentEntryStrategy
  | SmartEntryStrategy;
```

**References:** [InlineEntryStrategy](#inlineentrystrategy), [SingleEntryStrategy](#singleentrystrategy), [HookEntryStrategy](#hookentrystrategy), [ComponentEntryStrategy](#componententrystrategy), [SmartEntryStrategy](#smartentrystrategy)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## extname

```typescript
extname(path: string): string;
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| path      | string |             |

**Returns:**

string

## format

```typescript
format(pathObject: {
        root: string;
        dir: string;
        base: string;
        ext: string;
        name: string;
    }): string;
```

| Parameter  | Type                                                                    | Description |
| ---------- | ----------------------------------------------------------------------- | ----------- |
| pathObject | { root: string; dir: string; base: string; ext: string; name: string; } |             |

**Returns:**

string

## GlobalInjections

```typescript
export interface GlobalInjections
```

| Property         | Modifiers | Type                       | Description  |
| ---------------- | --------- | -------------------------- | ------------ |
| [attributes?](#) |           | { [key: string]: string; } | _(Optional)_ |
| [location](#)    |           | 'head' \| 'body'           |              |
| [tag](#)         |           | string                     |              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## HookAnalysis

```typescript
export interface HookAnalysis
```

| Property               | Modifiers | Type                  | Description |
| ---------------------- | --------- | --------------------- | ----------- |
| [canonicalFilename](#) |           | string                |             |
| [captures](#)          |           | boolean               |             |
| [ctxKind](#)           |           | 'event' \| 'function' |             |
| [ctxName](#)           |           | string                |             |
| [displayName](#)       |           | string                |             |
| [entry](#)             |           | string \| null        |             |
| [extension](#)         |           | string                |             |
| [hash](#)              |           | string                |             |
| [loc](#)               |           | [number, number]      |             |
| [name](#)              |           | string                |             |
| [origin](#)            |           | string                |             |
| [parent](#)            |           | string \| null        |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## HookEntryStrategy

```typescript
export interface HookEntryStrategy
```

| Property     | Modifiers | Type                         | Description  |
| ------------ | --------- | ---------------------------- | ------------ |
| [manual?](#) |           | Record&lt;string, string&gt; | _(Optional)_ |
| [type](#)    |           | 'hook'                       |              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## InlineEntryStrategy

```typescript
export interface InlineEntryStrategy
```

| Property  | Modifiers | Type     | Description |
| --------- | --------- | -------- | ----------- |
| [type](#) |           | 'inline' |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## InsightManifest

```typescript
export interface InsightManifest
```

| Property      | Modifiers | Type                                    | Description |
| ------------- | --------- | --------------------------------------- | ----------- |
| [manual](#)   |           | Record&lt;string, string&gt;            |             |
| [prefetch](#) |           | { route: string; symbols: string[]; }[] |             |
| [type](#)     |           | 'smart'                                 |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## isAbsolute

```typescript
isAbsolute(path: string): boolean;
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| path      | string |             |

**Returns:**

boolean

## join

```typescript
join(...paths: string[]): string;
```

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| paths     | string[] |             |

**Returns:**

string

## MinifyMode

```typescript
export type MinifyMode = "simplify" | "none";
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## normalize

```typescript
normalize(path: string): string;
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| path      | string |             |

**Returns:**

string

## Optimizer

```typescript
export interface Optimizer
```

| Property | Modifiers | Type                                | Description                                                          |
| -------- | --------- | ----------------------------------- | -------------------------------------------------------------------- |
| [sys](#) |           | [OptimizerSystem](#optimizersystem) | Optimizer system use. This can be updated with a custom file system. |

| Method                                                        | Description                                                        |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| [transformFs(opts)](#optimizer-transformfs)                   | Transforms the directory from the file system.                     |
| [transformFsSync(opts)](#optimizer-transformfssync)           | Transforms the directory from the file system.                     |
| [transformModules(opts)](#optimizer-transformmodules)         | Transforms the input code string, does not access the file system. |
| [transformModulesSync(opts)](#optimizer-transformmodulessync) | Transforms the input code string, does not access the file system. |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## OptimizerOptions

```typescript
export interface OptimizerOptions
```

| Property                    | Modifiers | Type                                | Description  |
| --------------------------- | --------- | ----------------------------------- | ------------ |
| [binding?](#)               |           | any                                 | _(Optional)_ |
| [inlineStylesUpToBytes?](#) |           | number                              | _(Optional)_ |
| [sys?](#)                   |           | [OptimizerSystem](#optimizersystem) | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## OptimizerSystem

```typescript
export interface OptimizerSystem
```

| Property                 | Modifiers | Type                                                                                   | Description  |
| ------------------------ | --------- | -------------------------------------------------------------------------------------- | ------------ |
| [cwd](#)                 |           | () =&gt; string                                                                        |              |
| [dynamicImport](#)       |           | (path: string) =&gt; Promise&lt;any&gt;                                                |              |
| [env](#)                 |           | [SystemEnvironment](#systemenvironment)                                                |              |
| [getInputFiles?](#)      |           | (rootDir: string) =&gt; Promise&lt;[TransformModuleInput](#transformmoduleinput)[]&gt; | _(Optional)_ |
| [os](#)                  |           | string                                                                                 |              |
| [path](#)                |           | [Path](#path)                                                                          |              |
| [strictDynamicImport](#) |           | (path: string) =&gt; Promise&lt;any&gt;                                                |              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## parse

```typescript
parse(path: string): {
        root: string;
        dir: string;
        base: string;
        ext: string;
        name: string;
    };
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| path      | string |             |

**Returns:**

{ root: string; dir: string; base: string; ext: string; name: string; }

## Path

```typescript
export interface Path
```

| Property       | Modifiers             | Type          | Description |
| -------------- | --------------------- | ------------- | ----------- |
| [delimiter](#) | <code>readonly</code> | string        |             |
| [posix](#)     | <code>readonly</code> | [Path](#path) |             |
| [sep](#)       | <code>readonly</code> | string        |             |
| [win32](#)     | <code>readonly</code> | null          |             |

| Method                                | Description |
| ------------------------------------- | ----------- |
| [basename(path, ext)](#path-basename) |             |
| [dirname(path)](#path-dirname)        |             |
| [extname(path)](#path-extname)        |             |
| [format(pathObject)](#path-format)    |             |
| [isAbsolute(path)](#path-isabsolute)  |             |
| [join(paths)](#path-join)             |             |
| [normalize(path)](#path-normalize)    |             |
| [parse(path)](#path-parse)            |             |
| [relative(from, to)](#path-relative)  |             |
| [resolve(paths)](#path-resolve)       |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## QwikBuildMode

```typescript
export type QwikBuildMode = "production" | "development";
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/plugins/plugin.ts)

## QwikBuildTarget

```typescript
export type QwikBuildTarget = "client" | "ssr" | "lib" | "test";
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/plugins/plugin.ts)

## QwikBundle

```typescript
export interface QwikBundle
```

| Property             | Modifiers | Type     | Description  |
| -------------------- | --------- | -------- | ------------ |
| [dynamicImports?](#) |           | string[] | _(Optional)_ |
| [imports?](#)        |           | string[] | _(Optional)_ |
| [origins?](#)        |           | string[] | _(Optional)_ |
| [size](#)            |           | number   |              |
| [symbols?](#)        |           | string[] | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## QwikManifest

```typescript
export interface QwikManifest
```

| Property          | Modifiers | Type                                                                              | Description  |
| ----------------- | --------- | --------------------------------------------------------------------------------- | ------------ |
| [bundles](#)      |           | { [fileName: string]: [QwikBundle](#qwikbundle); }                                |              |
| [injections?](#)  |           | [GlobalInjections](#globalinjections)[]                                           | _(Optional)_ |
| [manifestHash](#) |           | string                                                                            |              |
| [mapping](#)      |           | { [symbolName: string]: string; }                                                 |              |
| [options?](#)     |           | { target?: string; buildMode?: string; entryStrategy?: { [key: string]: any; }; } | _(Optional)_ |
| [platform?](#)    |           | { [name: string]: string; }                                                       | _(Optional)_ |
| [symbols](#)      |           | { [symbolName: string]: [QwikSymbol](#qwiksymbol); }                              |              |
| [version](#)      |           | string                                                                            |              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## qwikRollup

```typescript
export declare function qwikRollup(
  qwikRollupOpts?: QwikRollupPluginOptions,
): any;
```

| Parameter      | Type                                                | Description  |
| -------------- | --------------------------------------------------- | ------------ |
| qwikRollupOpts | [QwikRollupPluginOptions](#qwikrolluppluginoptions) | _(Optional)_ |

**Returns:**

any

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/plugins/rollup.ts)

## QwikRollupPluginOptions

```typescript
export interface QwikRollupPluginOptions
```

| Property                      | Modifiers | Type                                                                                                    | Description                                                                                                                                                                                                                                       |
| ----------------------------- | --------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [buildMode?](#)               |           | [QwikBuildMode](#qwikbuildmode)                                                                         | <p>_(Optional)_ Build <code>production</code> or <code>development</code>.</p><p>Default <code>development</code></p>                                                                                                                             |
| [csr?](#)                     |           | boolean                                                                                                 | _(Optional)_                                                                                                                                                                                                                                      |
| [debug?](#)                   |           | boolean                                                                                                 | <p>_(Optional)_ Prints verbose Qwik plugin debug logs.</p><p>Default <code>false</code></p>                                                                                                                                                       |
| [entryStrategy?](#)           |           | [EntryStrategy](#entrystrategy)                                                                         | <p>_(Optional)_ The Qwik entry strategy to use while building for production. During development the type is always <code>hook</code>.</p><p>Default <code>{ type: &quot;smart&quot; }</code>)</p>                                                |
| [manifestInput?](#)           |           | [QwikManifest](#qwikmanifest)                                                                           | <p>_(Optional)_ The SSR build requires the manifest generated during the client build. The <code>manifestInput</code> option can be used to manually provide a manifest.</p><p>Default <code>undefined</code></p>                                 |
| [manifestOutput?](#)          |           | (manifest: [QwikManifest](#qwikmanifest)) =&gt; Promise&lt;void&gt; \| void                             | <p>_(Optional)_ The client build will create a manifest and this hook is called with the generated build data.</p><p>Default <code>undefined</code></p>                                                                                           |
| [optimizerOptions?](#)        |           | [OptimizerOptions](#optimizeroptions)                                                                   | _(Optional)_                                                                                                                                                                                                                                      |
| [rootDir?](#)                 |           | string                                                                                                  | <p>_(Optional)_ The root of the application, which is commonly the same directory as <code>package.json</code> and <code>rollup.config.js</code>.</p><p>Default <code>process.cwd()</code></p>                                                    |
| [srcDir?](#)                  |           | string                                                                                                  | <p>_(Optional)_ The source directory to find all the Qwik components. Since Qwik does not have a single input, the <code>srcDir</code> is used to recursively find Qwik files.</p><p>Default <code>src</code></p>                                 |
| [srcInputs?](#)               |           | [TransformModuleInput](#transformmoduleinput)[] \| null                                                 | <p>_(Optional)_ Alternative to <code>srcDir</code>, where <code>srcInputs</code> is able to provide the files manually. This option is useful for an environment without a file system, such as a webworker.</p><p>Default: <code>null</code></p> |
| [target?](#)                  |           | [QwikBuildTarget](#qwikbuildtarget)                                                                     | <p>_(Optional)_ Target <code>client</code> or <code>ssr</code>.</p><p>Default <code>client</code></p>                                                                                                                                             |
| [transformedModuleOutput?](#) |           | ((transformedModules: [TransformModule](#transformmodule)[]) =&gt; Promise&lt;void&gt; \| void) \| null | _(Optional)_ Hook that's called after the build and provides all of the transformed modules that were used before bundling.                                                                                                                       |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/plugins/rollup.ts)

## QwikSymbol

```typescript
export interface QwikSymbol
```

| Property               | Modifiers | Type                  | Description |
| ---------------------- | --------- | --------------------- | ----------- |
| [canonicalFilename](#) |           | string                |             |
| [captures](#)          |           | boolean               |             |
| [ctxKind](#)           |           | 'function' \| 'event' |             |
| [ctxName](#)           |           | string                |             |
| [displayName](#)       |           | string                |             |
| [hash](#)              |           | string                |             |
| [loc](#)               |           | [number, number]      |             |
| [origin](#)            |           | string                |             |
| [parent](#)            |           | string \| null        |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## qwikVite

```typescript
export declare function qwikVite(qwikViteOpts?: QwikVitePluginOptions): any;
```

| Parameter    | Type                                            | Description  |
| ------------ | ----------------------------------------------- | ------------ |
| qwikViteOpts | [QwikVitePluginOptions](#qwikvitepluginoptions) | _(Optional)_ |

**Returns:**

any

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/plugins/vite.ts)

## QwikViteDevResponse

```typescript
export interface QwikViteDevResponse
```

| Property                  | Modifiers | Type                      | Description  |
| ------------------------- | --------- | ------------------------- | ------------ |
| [\_qwikEnvData?](#)       |           | Record&lt;string, any&gt; | _(Optional)_ |
| [\_qwikRenderResolve?](#) |           | () =&gt; void             | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/plugins/vite.ts)

## QwikVitePlugin

```typescript
export interface QwikVitePlugin
```

| Property  | Modifiers | Type                                    | Description |
| --------- | --------- | --------------------------------------- | ----------- |
| [api](#)  |           | [QwikVitePluginApi](#qwikvitepluginapi) |             |
| [name](#) |           | 'vite-plugin-qwik'                      |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/plugins/vite.ts)

## QwikVitePluginApi

```typescript
export interface QwikVitePluginApi
```

| Property                   | Modifiers | Type                                                                                             | Description |
| -------------------------- | --------- | ------------------------------------------------------------------------------------------------ | ----------- |
| [getClientOutDir](#)       |           | () =&gt; string \| null                                                                          |             |
| [getClientPublicOutDir](#) |           | () =&gt; string \| null                                                                          |             |
| [getInsightsManifest](#)   |           | (clientOutDir?: string \| null) =&gt; Promise&lt;[InsightManifest](#insightmanifest) \| null&gt; |             |
| [getManifest](#)           |           | () =&gt; [QwikManifest](#qwikmanifest) \| null                                                   |             |
| [getOptimizer](#)          |           | () =&gt; [Optimizer](#optimizer) \| null                                                         |             |
| [getOptions](#)            |           | () =&gt; NormalizedQwikPluginOptions                                                             |             |
| [getRootDir](#)            |           | () =&gt; string \| null                                                                          |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/plugins/vite.ts)

## QwikVitePluginOptions

```typescript
export type QwikVitePluginOptions =
  | QwikVitePluginCSROptions
  | QwikVitePluginSSROptions;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/plugins/vite.ts)

## relative

```typescript
relative(from: string, to: string): string;
```

| Parameter | Type   | Description |
| --------- | ------ | ----------- |
| from      | string |             |
| to        | string |             |

**Returns:**

string

## resolve

```typescript
resolve(...paths: string[]): string;
```

| Parameter | Type     | Description |
| --------- | -------- | ----------- |
| paths     | string[] |             |

**Returns:**

string

## ResolvedManifest

```typescript
export interface ResolvedManifest
```

| Property      | Modifiers | Type                          | Description |
| ------------- | --------- | ----------------------------- | ----------- |
| [manifest](#) |           | [QwikManifest](#qwikmanifest) |             |
| [mapper](#)   |           | [SymbolMapper](#symbolmapper) |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## SingleEntryStrategy

```typescript
export interface SingleEntryStrategy
```

| Property     | Modifiers | Type                         | Description  |
| ------------ | --------- | ---------------------------- | ------------ |
| [manual?](#) |           | Record&lt;string, string&gt; | _(Optional)_ |
| [type](#)    |           | 'single'                     |              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## SmartEntryStrategy

```typescript
export interface SmartEntryStrategy
```

| Property     | Modifiers | Type                         | Description  |
| ------------ | --------- | ---------------------------- | ------------ |
| [manual?](#) |           | Record&lt;string, string&gt; | _(Optional)_ |
| [type](#)    |           | 'smart'                      |              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## SourceLocation

```typescript
export interface SourceLocation
```

| Property       | Modifiers | Type   | Description |
| -------------- | --------- | ------ | ----------- |
| [endCol](#)    |           | number |             |
| [endLine](#)   |           | number |             |
| [hi](#)        |           | number |             |
| [lo](#)        |           | number |             |
| [startCol](#)  |           | number |             |
| [startLine](#) |           | number |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## SourceMapsOption

```typescript
export type SourceMapsOption = "external" | "inline" | undefined | null;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## SymbolMapper

```typescript
export type SymbolMapper = Record<
  string,
  readonly [symbol: string, chunk: string]
>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## SymbolMapperFn

```typescript
export type SymbolMapperFn = (
  symbolName: string,
  mapper: SymbolMapper | undefined,
) => readonly [symbol: string, chunk: string] | undefined;
```

**References:** [SymbolMapper](#symbolmapper)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## SystemEnvironment

```typescript
export type SystemEnvironment =
  | "node"
  | "deno"
  | "bun"
  | "webworker"
  | "browsermain"
  | "unknown";
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## transformFs

Transforms the directory from the file system.

```typescript
transformFs(opts: TransformFsOptions): Promise<TransformOutput>;
```

| Parameter | Type                                      | Description |
| --------- | ----------------------------------------- | ----------- |
| opts      | [TransformFsOptions](#transformfsoptions) |             |

**Returns:**

Promise&lt;[TransformOutput](#transformoutput)&gt;

## TransformFsOptions

```typescript
export interface TransformFsOptions extends TransformOptions
```

**Extends:** [TransformOptions](#transformoptions)

| Property         | Modifiers | Type     | Description |
| ---------------- | --------- | -------- | ----------- |
| [vendorRoots](#) |           | string[] |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## transformFsSync

Transforms the directory from the file system.

```typescript
transformFsSync(opts: TransformFsOptions): TransformOutput;
```

| Parameter | Type                                      | Description |
| --------- | ----------------------------------------- | ----------- |
| opts      | [TransformFsOptions](#transformfsoptions) |             |

**Returns:**

[TransformOutput](#transformoutput)

## TransformModule

```typescript
export interface TransformModule
```

| Property     | Modifiers | Type                                  | Description |
| ------------ | --------- | ------------------------------------- | ----------- |
| [code](#)    |           | string                                |             |
| [hook](#)    |           | [HookAnalysis](#hookanalysis) \| null |             |
| [isEntry](#) |           | boolean                               |             |
| [map](#)     |           | string \| null                        |             |
| [path](#)    |           | string                                |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## TransformModuleInput

```typescript
export interface TransformModuleInput
```

| Property  | Modifiers | Type   | Description |
| --------- | --------- | ------ | ----------- |
| [code](#) |           | string |             |
| [path](#) |           | string |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## transformModules

Transforms the input code string, does not access the file system.

```typescript
transformModules(opts: TransformModulesOptions): Promise<TransformOutput>;
```

| Parameter | Type                                                | Description |
| --------- | --------------------------------------------------- | ----------- |
| opts      | [TransformModulesOptions](#transformmodulesoptions) |             |

**Returns:**

Promise&lt;[TransformOutput](#transformoutput)&gt;

## TransformModulesOptions

```typescript
export interface TransformModulesOptions extends TransformOptions
```

**Extends:** [TransformOptions](#transformoptions)

| Property   | Modifiers | Type                                            | Description |
| ---------- | --------- | ----------------------------------------------- | ----------- |
| [input](#) |           | [TransformModuleInput](#transformmoduleinput)[] |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## transformModulesSync

Transforms the input code string, does not access the file system.

```typescript
transformModulesSync(opts: TransformModulesOptions): TransformOutput;
```

| Parameter | Type                                                | Description |
| --------- | --------------------------------------------------- | ----------- |
| opts      | [TransformModulesOptions](#transformmodulesoptions) |             |

**Returns:**

[TransformOutput](#transformoutput)

## TransformOptions

```typescript
export interface TransformOptions
```

| Property                 | Modifiers | Type                            | Description  |
| ------------------------ | --------- | ------------------------------- | ------------ |
| [entryStrategy?](#)      |           | [EntryStrategy](#entrystrategy) | _(Optional)_ |
| [explicitExtensions?](#) |           | boolean                         | _(Optional)_ |
| [isServer?](#)           |           | boolean                         | _(Optional)_ |
| [minify?](#)             |           | [MinifyMode](#minifymode)       | _(Optional)_ |
| [mode?](#)               |           | EmitMode                        | _(Optional)_ |
| [preserveFilenames?](#)  |           | boolean                         | _(Optional)_ |
| [regCtxName?](#)         |           | string[]                        | _(Optional)_ |
| [rootDir?](#)            |           | string                          | _(Optional)_ |
| [scope?](#)              |           | string                          | _(Optional)_ |
| [sourceMaps?](#)         |           | boolean                         | _(Optional)_ |
| [srcDir](#)              |           | string                          |              |
| [stripCtxName?](#)       |           | string[]                        | _(Optional)_ |
| [stripEventHandlers?](#) |           | boolean                         | _(Optional)_ |
| [stripExports?](#)       |           | string[]                        | _(Optional)_ |
| [transpileJsx?](#)       |           | boolean                         | _(Optional)_ |
| [transpileTs?](#)        |           | boolean                         | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## TransformOutput

```typescript
export interface TransformOutput
```

| Property          | Modifiers | Type                                  | Description |
| ----------------- | --------- | ------------------------------------- | ----------- |
| [diagnostics](#)  |           | [Diagnostic](#diagnostic)[]           |             |
| [isJsx](#)        |           | boolean                               |             |
| [isTypeScript](#) |           | boolean                               |             |
| [modules](#)      |           | [TransformModule](#transformmodule)[] |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## TranspileOption

```typescript
export type TranspileOption = boolean | undefined | null;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/types.ts)

## versions

```typescript
versions: {
  qwik: string;
}
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik/src/optimizer/src/versions.ts)
