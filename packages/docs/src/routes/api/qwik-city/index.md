---
title: \@builder.io/qwik-city API Reference
---

# [API](/api) &rsaquo; @builder.io/qwik-city

## "link:app"

```typescript
'link:app'?: boolean;
```

## Action

```typescript
export type Action<
  RETURN,
  INPUT = Record<string, unknown>,
  OPTIONAL extends boolean = true,
> = {
  (): ActionStore<RETURN, INPUT, OPTIONAL>;
};
```

**References:** [ActionStore](#actionstore)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## ActionConstructor

```typescript
export type ActionConstructor = {
  <
    OBJ extends Record<string, any> | void | null,
    VALIDATOR extends TypedDataValidator,
    REST extends [DataValidator, ...DataValidator[]],
  >(
    actionQrl: (
      data: GetValidatorType<VALIDATOR>,
      event: RequestEventAction,
    ) => ValueOrPromise<OBJ>,
    options: {
      readonly id?: string;
      readonly validation: [VALIDATOR, ...REST];
    },
  ): Action<
    StrictUnion<
      | OBJ
      | FailReturn<zod.typeToFlattenedError<GetValidatorType<VALIDATOR>>>
      | FailReturn<FailOfRest<REST>>
    >,
    GetValidatorType<VALIDATOR>,
    false
  >;
  <
    OBJ extends Record<string, any> | void | null,
    VALIDATOR extends TypedDataValidator,
  >(
    actionQrl: (
      data: GetValidatorType<VALIDATOR>,
      event: RequestEventAction,
    ) => ValueOrPromise<OBJ>,
    options: {
      readonly id?: string;
      readonly validation: [VALIDATOR];
    },
  ): Action<
    StrictUnion<
      OBJ | FailReturn<zod.typeToFlattenedError<GetValidatorType<VALIDATOR>>>
    >,
    GetValidatorType<VALIDATOR>,
    false
  >;
  <
    OBJ extends Record<string, any> | void | null,
    REST extends [DataValidator, ...DataValidator[]],
  >(
    actionQrl: (
      data: JSONObject,
      event: RequestEventAction,
    ) => ValueOrPromise<OBJ>,
    options: {
      readonly id?: string;
      readonly validation: REST;
    },
  ): Action<StrictUnion<OBJ | FailReturn<FailOfRest<REST>>>>;
  <
    OBJ extends Record<string, any> | void | null,
    VALIDATOR extends TypedDataValidator,
    REST extends [DataValidator, ...DataValidator[]],
  >(
    actionQrl: (
      data: GetValidatorType<VALIDATOR>,
      event: RequestEventAction,
    ) => ValueOrPromise<OBJ>,
    options: VALIDATOR,
    ...rest: REST
  ): Action<
    StrictUnion<
      | OBJ
      | FailReturn<zod.typeToFlattenedError<GetValidatorType<VALIDATOR>>>
      | FailReturn<FailOfRest<REST>>
    >,
    GetValidatorType<VALIDATOR>,
    false
  >;
  <
    OBJ extends Record<string, any> | void | null,
    VALIDATOR extends TypedDataValidator,
  >(
    actionQrl: (
      data: GetValidatorType<VALIDATOR>,
      event: RequestEventAction,
    ) => ValueOrPromise<OBJ>,
    options: VALIDATOR,
  ): Action<
    StrictUnion<
      OBJ | FailReturn<zod.typeToFlattenedError<GetValidatorType<VALIDATOR>>>
    >,
    GetValidatorType<VALIDATOR>,
    false
  >;
  <
    OBJ extends Record<string, any> | void | null,
    REST extends [DataValidator, ...DataValidator[]],
  >(
    actionQrl: (
      form: JSONObject,
      event: RequestEventAction,
    ) => ValueOrPromise<OBJ>,
    ...rest: REST
  ): Action<StrictUnion<OBJ | FailReturn<FailOfRest<REST>>>>;
  <OBJ>(
    actionQrl: (
      form: JSONObject,
      event: RequestEventAction,
    ) => ValueOrPromise<OBJ>,
    options?: {
      readonly id?: string;
    },
  ): Action<StrictUnion<OBJ>>;
};
```

**References:** [TypedDataValidator](#typeddatavalidator), [DataValidator](#datavalidator), [GetValidatorType](#getvalidatortype), [Action](#action), [StrictUnion](#strictunion), [FailReturn](#failreturn), [FailOfRest](#failofrest), [JSONObject](#jsonobject)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## ActionReturn

```typescript
export type ActionReturn<RETURN> = {
  readonly status?: number;
  readonly value: RETURN;
};
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## ActionStore

```typescript
export type ActionStore<RETURN, INPUT, OPTIONAL extends boolean = true> = {
  readonly actionPath: string;
  readonly isRunning: boolean;
  readonly status?: number;
  readonly formData: FormData | undefined;
  readonly value: RETURN | undefined;
  readonly submit: QRL<
    OPTIONAL extends true
      ? (form?: INPUT | FormData | SubmitEvent) => Promise<ActionReturn<RETURN>>
      : (form: INPUT | FormData | SubmitEvent) => Promise<ActionReturn<RETURN>>
  >;
};
```

**References:** [ActionReturn](#actionreturn)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## ContentHeading

```typescript
export interface ContentHeading
```

| Property   | Modifiers             | Type   | Description |
| ---------- | --------------------- | ------ | ----------- |
| [id](#)    | <code>readonly</code> | string |             |
| [level](#) | <code>readonly</code> | number |             |
| [text](#)  | <code>readonly</code> | string |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## ContentMenu

```typescript
export interface ContentMenu
```

| Property    | Modifiers             | Type                          | Description  |
| ----------- | --------------------- | ----------------------------- | ------------ |
| [href?](#)  | <code>readonly</code> | string                        | _(Optional)_ |
| [items?](#) | <code>readonly</code> | [ContentMenu](#contentmenu)[] | _(Optional)_ |
| [text](#)   | <code>readonly</code> | string                        |              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## DataValidator

```typescript
export type DataValidator<T extends Record<string, any> = {}> = {
  validate(ev: RequestEvent, data: unknown): Promise<ValidatorReturn<T>>;
};
```

**References:** [ValidatorReturn](#validatorreturn)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## DocumentHead

```typescript
export type DocumentHead =
  | DocumentHeadValue
  | ((props: DocumentHeadProps) => DocumentHeadValue);
```

**References:** [DocumentHeadValue](#documentheadvalue), [DocumentHeadProps](#documentheadprops)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## DocumentHeadProps

```typescript
export interface DocumentHeadProps extends RouteLocation
```

**Extends:** [RouteLocation](#routelocation)

| Property          | Modifiers             | Type                                          | Description |
| ----------------- | --------------------- | --------------------------------------------- | ----------- |
| [head](#)         | <code>readonly</code> | [ResolvedDocumentHead](#resolveddocumenthead) |             |
| [resolveValue](#) | <code>readonly</code> | ResolveSyncValue                              |             |
| [withLocale](#)   | <code>readonly</code> | &lt;T&gt;(fn: () =&gt; T) =&gt; T             |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## DocumentHeadValue

```typescript
export interface DocumentHeadValue<FrontMatter extends Record<string, any> = Record<string, unknown>>
```

| Property          | Modifiers             | Type                                         | Description                                                                                                                                                                                                                                                           |
| ----------------- | --------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [frontmatter?](#) | <code>readonly</code> | Readonly&lt;FrontMatter&gt;                  | _(Optional)_ Arbitrary object containing custom data. When the document head is created from markdown files, the frontmatter attributes that are not recognized as a well-known meta names (such as title, description, author, etc...), are stored in this property. |
| [links?](#)       | <code>readonly</code> | readonly [DocumentLink](#documentlink)[]     | _(Optional)_ Used to manually append <code>&lt;link&gt;</code> elements to the <code>&lt;head&gt;</code>.                                                                                                                                                             |
| [meta?](#)        | <code>readonly</code> | readonly [DocumentMeta](#documentmeta)[]     | _(Optional)_ Used to manually set meta tags in the head. Additionally, the <code>data</code> property could be used to set arbitrary data which the <code>&lt;head&gt;</code> component could later use to generate <code>&lt;meta&gt;</code> tags.                   |
| [scripts?](#)     | <code>readonly</code> | readonly [DocumentScript](#documentscript)[] | _(Optional)_ Used to manually append <code>&lt;script&gt;</code> elements to the <code>&lt;head&gt;</code>.                                                                                                                                                           |
| [styles?](#)      | <code>readonly</code> | readonly [DocumentStyle](#documentstyle)[]   | _(Optional)_ Used to manually append <code>&lt;style&gt;</code> elements to the <code>&lt;head&gt;</code>.                                                                                                                                                            |
| [title?](#)       | <code>readonly</code> | string                                       | _(Optional)_ Sets <code>document.title</code>.                                                                                                                                                                                                                        |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## DocumentLink

```typescript
export interface DocumentLink
```

| Property             | Modifiers | Type    | Description  |
| -------------------- | --------- | ------- | ------------ |
| [as?](#)             |           | string  | _(Optional)_ |
| [crossorigin?](#)    |           | string  | _(Optional)_ |
| [disabled?](#)       |           | boolean | _(Optional)_ |
| [href?](#)           |           | string  | _(Optional)_ |
| [hreflang?](#)       |           | string  | _(Optional)_ |
| [id?](#)             |           | string  | _(Optional)_ |
| [imagesizes?](#)     |           | string  | _(Optional)_ |
| [imagesrcset?](#)    |           | string  | _(Optional)_ |
| [integrity?](#)      |           | string  | _(Optional)_ |
| [key?](#)            |           | string  | _(Optional)_ |
| [media?](#)          |           | string  | _(Optional)_ |
| [prefetch?](#)       |           | string  | _(Optional)_ |
| [referrerpolicy?](#) |           | string  | _(Optional)_ |
| [rel?](#)            |           | string  | _(Optional)_ |
| [sizes?](#)          |           | string  | _(Optional)_ |
| [title?](#)          |           | string  | _(Optional)_ |
| [type?](#)           |           | string  | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## DocumentMeta

```typescript
export interface DocumentMeta
```

| Property        | Modifiers             | Type   | Description  |
| --------------- | --------------------- | ------ | ------------ |
| [content?](#)   | <code>readonly</code> | string | _(Optional)_ |
| [httpEquiv?](#) | <code>readonly</code> | string | _(Optional)_ |
| [itemprop?](#)  | <code>readonly</code> | string | _(Optional)_ |
| [key?](#)       | <code>readonly</code> | string | _(Optional)_ |
| [media?](#)     | <code>readonly</code> | string | _(Optional)_ |
| [name?](#)      | <code>readonly</code> | string | _(Optional)_ |
| [property?](#)  | <code>readonly</code> | string | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## DocumentScript

> This API is provided as an alpha preview for developers and may change based on feedback that we receive. Do not use this API in a production environment.

```typescript
export interface DocumentScript
```

| Property     | Modifiers             | Type                                            | Description                |
| ------------ | --------------------- | ----------------------------------------------- | -------------------------- |
| [key?](#)    | <code>readonly</code> | string                                          | **_(ALPHA)_** _(Optional)_ |
| [props?](#)  | <code>readonly</code> | Readonly&lt;QwikIntrinsicElements['script']&gt; | **_(ALPHA)_** _(Optional)_ |
| [script?](#) | <code>readonly</code> | string                                          | **_(ALPHA)_** _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## DocumentStyle

```typescript
export interface DocumentStyle
```

| Property    | Modifiers             | Type                                           | Description  |
| ----------- | --------------------- | ---------------------------------------------- | ------------ |
| [key?](#)   | <code>readonly</code> | string                                         | _(Optional)_ |
| [props?](#) | <code>readonly</code> | Readonly&lt;QwikIntrinsicElements['style']&gt; | _(Optional)_ |
| [style](#)  | <code>readonly</code> | string                                         |              |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## FailOfRest

```typescript
export type FailOfRest<REST extends readonly DataValidator[]> =
  REST extends readonly DataValidator<infer ERROR>[] ? ERROR : never;
```

**References:** [DataValidator](#datavalidator)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## FailReturn

```typescript
export type FailReturn<T> = T & Failed;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## Form

```typescript
Form: <O, I>(
  { action, spaReset, reloadDocument, onSubmit$, ...rest }: FormProps<O, I>,
  key: string | null,
) => QwikJSX.Element;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/form-component.tsx)

## FormProps

```typescript
export interface FormProps<O, I> extends Omit<QwikJSX.IntrinsicElements['form'], 'action' | 'method'>
```

**Extends:** Omit&lt;QwikJSX.IntrinsicElements['form'], 'action' \| 'method'&gt;

| Property                 | Modifiers | Type                                                                                                                                               | Description                                                                                                                                                                      |
| ------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [action?](#)             |           | [ActionStore](#actionstore)&lt;O, I, true \| false&gt;                                                                                             | _(Optional)_ Reference to the action returned by <code>action()</code>.                                                                                                          |
| [key?](#)                |           | string \| number \| null                                                                                                                           | _(Optional)_                                                                                                                                                                     |
| [onSubmit$?](#)          |           | (event: Event, form: HTMLFormElement) =&gt; ValueOrPromise&lt;void&gt;                                                                             | _(Optional)_ Event handler executed right when the form is submitted.                                                                                                            |
| [onSubmitCompleted$?](#) |           | (event: CustomEvent&lt;[FormSubmitCompletedDetail](#formsubmitsuccessdetail)&lt;O&gt;&gt;, form: HTMLFormElement) =&gt; ValueOrPromise&lt;void&gt; | _(Optional)_ Event handler executed right after the action is executed successfully and returns some data.                                                                       |
| [reloadDocument?](#)     |           | boolean                                                                                                                                            | _(Optional)_ When <code>true</code> the form submission will cause a full page reload, even if SPA mode is enabled and JS is available.                                          |
| [spaReset?](#)           |           | boolean                                                                                                                                            | <p>_(Optional)_ When <code>true</code> all the form inputs will be reset in SPA mode, just like happens in a full page form submission.</p><p>Defaults to <code>false</code></p> |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/form-component.tsx)

## FormSubmitSuccessDetail

```typescript
export interface FormSubmitCompletedDetail<T>
```

| Property    | Modifiers | Type   | Description |
| ----------- | --------- | ------ | ----------- |
| [status](#) |           | number |             |
| [value](#)  |           | T      |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/form-component.tsx)

## GetValidatorType

```typescript
export type GetValidatorType<VALIDATOR extends TypedDataValidator> =
  VALIDATOR extends TypedDataValidator<infer TYPE> ? zod.infer<TYPE> : never;
```

**References:** [TypedDataValidator](#typeddatavalidator)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## globalAction$

```typescript
globalAction$: ActionConstructor;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/server-functions.ts)

## globalActionQrl

```typescript
globalActionQrl: ActionConstructorQRL;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/server-functions.ts)

## JSONObject

```typescript
export type JSONObject = {
  [x: string]: JSONValue;
};
```

**References:** [JSONValue](#jsonvalue)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## JSONValue

```typescript
export type JSONValue =
  | string
  | number
  | boolean
  | {
      [x: string]: JSONValue;
    }
  | Array<JSONValue>;
```

**References:** [JSONValue](#jsonvalue)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## Link

```typescript
Link: import("@builder.io/qwik").Component<
  import("@builder.io/qwik").PropFunctionProps<LinkProps>
>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/link-component.tsx)

## LinkProps

```typescript
export interface LinkProps extends AnchorAttributes
```

**Extends:** AnchorAttributes

| Property                             | Modifiers | Type    | Description  |
| ------------------------------------ | --------- | ------- | ------------ |
| ["link:app"?](#linkprops-_link_app_) |           | boolean | _(Optional)_ |
| [prefetch?](#)                       |           | boolean | _(Optional)_ |
| [reload?](#)                         |           | boolean | _(Optional)_ |
| [replaceState?](#)                   |           | boolean | _(Optional)_ |
| [scroll?](#)                         |           | boolean | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/link-component.tsx)

## Loader

```typescript
export type Loader<RETURN> = {
  (): LoaderSignal<RETURN>;
};
```

**References:** [LoaderSignal](#loadersignal)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## LoaderSignal

```typescript
export type LoaderSignal<TYPE> = TYPE extends () => ValueOrPromise<
  infer VALIDATOR
>
  ? ReadonlySignal<ValueOrPromise<VALIDATOR>>
  : ReadonlySignal<TYPE>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## MenuData

```typescript
export type MenuData = [pathname: string, menuLoader: MenuModuleLoader];
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## NavigationType

```typescript
export type NavigationType = "initial" | "form" | "link" | "popstate";
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## PageModule

```typescript
export interface PageModule extends RouteModule
```

**Extends:** RouteModule

| Property               | Modifiers             | Type                                            | Description  |
| ---------------------- | --------------------- | ----------------------------------------------- | ------------ |
| [default](#)           | <code>readonly</code> | unknown                                         |              |
| [head?](#)             | <code>readonly</code> | ContentModuleHead                               | _(Optional)_ |
| [headings?](#)         | <code>readonly</code> | [ContentHeading](#contentheading)[]             | _(Optional)_ |
| [onStaticGenerate?](#) | <code>readonly</code> | [StaticGenerateHandler](#staticgeneratehandler) | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## PathParams

```typescript
export declare type PathParams = Record<string, string>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## QwikCityMockProps

```typescript
export interface QwikCityMockProps
```

| Property     | Modifiers | Type                         | Description  |
| ------------ | --------- | ---------------------------- | ------------ |
| [params?](#) |           | Record&lt;string, string&gt; | _(Optional)_ |
| [url?](#)    |           | string                       | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/qwik-city-component.tsx)

## QwikCityMockProvider

```typescript
QwikCityMockProvider: import("@builder.io/qwik").Component<
  import("@builder.io/qwik").PropFunctionProps<QwikCityMockProps>
>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/qwik-city-component.tsx)

## QwikCityPlan

```typescript
export interface QwikCityPlan
```

| Property            | Modifiers             | Type                      | Description  |
| ------------------- | --------------------- | ------------------------- | ------------ |
| [basePathname?](#)  | <code>readonly</code> | string                    | _(Optional)_ |
| [cacheModules?](#)  | <code>readonly</code> | boolean                   | _(Optional)_ |
| [menus?](#)         | <code>readonly</code> | [MenuData](#menudata)[]   | _(Optional)_ |
| [routes](#)         | <code>readonly</code> | [RouteData](#routedata)[] |              |
| [serverPlugins?](#) | <code>readonly</code> | RouteModule[]             | _(Optional)_ |
| [trailingSlash?](#) | <code>readonly</code> | boolean                   | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## QwikCityProps

```typescript
export interface QwikCityProps
```

| Property             | Modifiers | Type    | Description                                                                        |
| -------------------- | --------- | ------- | ---------------------------------------------------------------------------------- |
| [viewTransition?](#) |           | boolean | <p>_(Optional)_ Enable the ViewTransition API</p><p>Default: <code>true</code></p> |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/qwik-city-component.tsx)

## QwikCityProvider

```typescript
QwikCityProvider: import("@builder.io/qwik").Component<
  import("@builder.io/qwik").PropFunctionProps<QwikCityProps>
>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/qwik-city-component.tsx)

## ResolvedDocumentHead

```typescript
export type ResolvedDocumentHead<
  FrontMatter extends Record<string, any> = Record<string, unknown>,
> = Required<DocumentHeadValue<FrontMatter>>;
```

**References:** [DocumentHeadValue](#documentheadvalue)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## routeAction$

```typescript
routeAction$: ActionConstructor;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/server-functions.ts)

## routeActionQrl

```typescript
routeActionQrl: ActionConstructorQRL;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/server-functions.ts)

## RouteData

```typescript
export type RouteData =
  | [routeName: string, loaders: ModuleLoader[]]
  | [
      routeName: string,
      loaders: ModuleLoader[],
      originalPathname: string,
      routeBundleNames: string[],
    ];
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## routeLoader$

```typescript
routeLoader$: LoaderConstructor;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/server-functions.ts)

## routeLoaderQrl

```typescript
routeLoaderQrl: LoaderConstructorQRL;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/server-functions.ts)

## RouteLocation

```typescript
export interface RouteLocation
```

| Property          | Modifiers             | Type                                         | Description |
| ----------------- | --------------------- | -------------------------------------------- | ----------- |
| [isNavigating](#) | <code>readonly</code> | boolean                                      |             |
| [params](#)       | <code>readonly</code> | Readonly&lt;Record&lt;string, string&gt;&gt; |             |
| [prevUrl](#)      | <code>readonly</code> | URL \| undefined                             |             |
| [url](#)          | <code>readonly</code> | URL                                          |             |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## RouteNavigate

```typescript
export type RouteNavigate = QRL<
  (
    path?: string,
    options?:
      | {
          type?: Exclude<NavigationType, "initial">;
          forceReload?: boolean;
          replaceState?: boolean;
          scroll?: boolean;
        }
      | boolean,
  ) => Promise<void>
>;
```

**References:** [NavigationType](#navigationtype)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## RouterOutlet

```typescript
RouterOutlet: import("@builder.io/qwik").Component<
  import("@builder.io/qwik").PropFunctionProps<Record<any, any>>
>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/router-outlet-component.tsx)

## server$

```typescript
server$: <T extends ServerFunction>(first: T) => ServerQRL<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/server-functions.ts)

## serverQrl

```typescript
serverQrl: <T extends ServerFunction>(qrl: QRL<T>) => ServerQRL<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/server-functions.ts)

## ServiceWorkerRegister

```typescript
ServiceWorkerRegister: (props: { nonce?: string }) =>
  import("@builder.io/qwik").JSXNode<"script">;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/sw-component.tsx)

## StaticGenerate

```typescript
export interface StaticGenerate
```

| Property     | Modifiers | Type                        | Description  |
| ------------ | --------- | --------------------------- | ------------ |
| [params?](#) |           | [PathParams](#pathparams)[] | _(Optional)_ |

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## StaticGenerateHandler

```typescript
export type StaticGenerateHandler = ({
  env,
}: {
  env: EnvGetter;
}) => Promise<StaticGenerate> | StaticGenerate;
```

**References:** [StaticGenerate](#staticgenerate)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## StrictUnion

```typescript
export type StrictUnion<T> = Prettify<StrictUnionHelper<T, T>>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## TypedDataValidator

```typescript
export type TypedDataValidator<T extends zod.ZodType = zod.ZodType> = {
  __zod: zod.ZodSchema<T>;
  validate(
    ev: RequestEvent,
    data: unknown,
  ): Promise<zod.SafeParseReturnType<T, T>>;
};
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## useContent

```typescript
useContent: () => import("./types").ContentState;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/use-functions.ts)

## useDocumentHead

Returns the document head for the current page. The generic type describes the front matter.

```typescript
useDocumentHead: <
  FrontMatter extends Record<string, unknown> = Record<string, any>,
>() => Required<Required<import("./types").DocumentHeadValue<FrontMatter>>>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/use-functions.ts)

## useLocation

```typescript
useLocation: () => RouteLocation;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/use-functions.ts)

## useNavigate

```typescript
useNavigate: () => RouteNavigate;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/use-functions.ts)

## validator$

```typescript
validator$: ValidatorConstructor;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/server-functions.ts)

## validatorQrl

```typescript
validatorQrl: ValidatorConstructorQRL;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/server-functions.ts)

## ValidatorReturn

```typescript
export type ValidatorReturn<T extends Record<string, any> = {}> =
  | ValidatorReturnSuccess
  | ValidatorReturnFail<T>;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## zod$

```typescript
zod$: ZodConstructor;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/server-functions.ts)

## ZodConstructor

```typescript
export type ZodConstructor = {
  <T extends zod.ZodRawShape>(schema: T): TypedDataValidator<zod.ZodObject<T>>;
  <T extends zod.ZodRawShape>(
    schema: (z: typeof zod, ev: RequestEvent) => T,
  ): TypedDataValidator<zod.ZodObject<T>>;
  <T extends zod.Schema>(schema: T): TypedDataValidator<T>;
  <T extends zod.Schema>(
    schema: (z: typeof zod, ev: RequestEvent) => T,
  ): TypedDataValidator<T>;
};
```

**References:** [TypedDataValidator](#typeddatavalidator)

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/types.ts)

## zodQrl

```typescript
zodQrl: ZodConstructorQRL;
```

[Edit this section](https://github.com/BuilderIO/qwik/tree/main/packages/qwik-city/runtime/src/server-functions.ts)
