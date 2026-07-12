import type {
  ComputedSignal,
  JSXOutput,
  NoSerialize,
  QRL,
  QwikIntrinsicElements,
  Signal,
  ValueOrPromise,
} from '@qwik.dev/core';
import type { SerializationStrategy } from '@qwik.dev/core/internal';
import type {
  AbortMessage,
  EnvGetter,
  RequestEvent,
  RequestEventAction,
  RequestEventBase,
  RequestEventLoader,
  RequestHandler,
  ResolveSyncValue,
  ServerError,
} from '@qwik.dev/router/middleware/request-handler';
import type * as v from 'valibot';
import type * as z from 'zod';
import type { Q_ROUTE } from './constants';
import type { RouteLoaderCtx } from './route-loaders';

export type {
  Cookie,
  CookieOptions,
  CookieValue,
  DeferReturn,
  InternalRequest,
  RequestEvent,
  RequestEventAction,
  RequestEventBase,
  RequestEventCommon,
  RequestEventLoader,
  RequestHandler,
  ResolveSyncValue,
  ResolveValue,
} from '@qwik.dev/router/middleware/request-handler';

export interface RouteModule<BODY = unknown> {
  onDelete?: RequestHandler<BODY> | RequestHandler<BODY>[];
  onGet?: RequestHandler<BODY> | RequestHandler<BODY>[];
  onHead?: RequestHandler<BODY> | RequestHandler<BODY>[];
  onOptions?: RequestHandler<BODY> | RequestHandler<BODY>[];
  onPatch?: RequestHandler<BODY> | RequestHandler<BODY>[];
  onPost?: RequestHandler<BODY> | RequestHandler<BODY>[];
  onPut?: RequestHandler<BODY> | RequestHandler<BODY>[];
  onRequest?: RequestHandler<BODY> | RequestHandler<BODY>[];
}

/** @public */
export type PageModule = RouteModule & {
  readonly default: (props: Record<string, never>) => JSXOutput;
  readonly routeConfig?: RouteConfig;
  readonly head?: ContentModuleHead;
  readonly eTag?: ContentModuleETag;
  readonly cacheKey?: CacheKeyFn;
  readonly headings?: ContentHeading[];
  readonly onStaticGenerate?: StaticGenerateHandler;
};

export interface LayoutModule extends RouteModule {
  readonly default?: (props: Record<string, never>) => JSXOutput;
  readonly routeConfig?: RouteConfig;
  readonly head?: ContentModuleHead;
}

export interface MenuModule {
  readonly default: ContentMenu;
}

/** @public */
export type HttpStatus = {
  /** The HTTP status code, e.g. 404 */
  status: number;
  /** The error message, e.g. "Not Found" */
  message: string;
};

/** @public */
export interface RouteLocation {
  readonly params: Readonly<Record<string, string>>;
  readonly url: URL;
  readonly isNavigating: boolean;
  readonly prevUrl: URL | undefined;
}

/** @public */
export type NavigationType = 'initial' | 'form' | 'link' | 'popstate';

/** @internal */
export type RouteStateInternal = {
  type: NavigationType;
  dest: URL;
  forceReload?: boolean;
  replaceState?: boolean;
  scroll?: boolean;
  historyUpdated?: boolean;
};

export type RebuildRouteInfoInternal = (
  url: URL
) => Promise<{ loadedRoute: LoadedRoute; requestHandlers: RequestHandler<any>[] }>;

/**
 * @param url - The URL that the user is trying to navigate to, or a number to indicate the user is
 *   trying to navigate back/forward in the application history. If it is missing, the event is sent
 *   by the browser and the user is trying to reload or navigate away from the page. In this case,
 *   the function should decide the answer synchronously.
 * @returns `true` to prevent navigation, `false` to allow navigation, or a Promise that resolves to
 *   `true` or `false`. For browser events, returning `true` or a Promise may show a confirmation
 *   dialog, at the browser's discretion. If the user confirms, the navigation will still be
 *   allowed.
 * @public
 */
export type PreventNavigateCallback = (url?: number | URL) => ValueOrPromise<boolean>;

/** @internal registers prevent navigate handler and returns cleanup function */
export type RoutePreventNavigate = QRL<(cb$: QRL<PreventNavigateCallback>) => () => void>;

export type ScrollState = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** @public */
export type RouteNavigate = QRL<
  (
    path?: string | number | URL,
    options?:
      | {
          type?: Exclude<NavigationType, 'initial'>;
          forceReload?: boolean;
          replaceState?: boolean;
          scroll?: boolean;
        }
      | boolean
  ) => Promise<void>
>;

export type RouteAction = Signal<RouteActionValue>;

export type RouteActionResolver = { status: number; result: unknown };
export type RouteActionValue =
  | {
      id: string;
      data: FormData | Record<string, unknown> | undefined;
      output?: RouteActionResolver;
      resolve?: NoSerialize<(data: RouteActionResolver) => void>;
    }
  | undefined;

export type MutableRouteLocation = Mutable<RouteLocation>;

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** @public */
export interface DocumentHeadValue<
  FrontMatter extends Record<string, any> = Record<string, unknown>,
> {
  /** Sets `document.title`. */
  readonly title?: string;
  /** Used to manually set meta tags in the head. */
  readonly meta?: readonly DocumentMeta[];
  /** Used to manually append `<link>` elements to the `<head>`. */
  readonly links?: readonly DocumentLink[];
  /** Used to manually append `<style>` elements to the `<head>`. */
  readonly styles?: readonly DocumentStyle[];
  /** Used to manually append `<script>` elements to the `<head>`. */
  readonly scripts?: readonly DocumentScript[];
  /**
   * Arbitrary object containing custom data. When the document head is created from markdown files,
   * the frontmatter attributes that are not recognized as a well-known meta names (such as title,
   * description, author, etc...), are stored in this property.
   */
  readonly frontmatter?: Readonly<FrontMatter>;
}

/** @public */
export type ResolvedDocumentHead<
  FrontMatter extends Record<string, any> = Record<string, unknown>,
> = Required<DocumentHeadValue<FrontMatter>> & {
  /** The build's manifest hash, used for per-loader data URLs. Always defined (`'dev'` in dev). */
  readonly manifestHash: string;
};

/** @public */
export type DocumentMeta = QwikIntrinsicElements['meta'];

/** @public */
export type DocumentLink = QwikIntrinsicElements['link'];

/** @public */
export type DocumentStyle = Readonly<
  (
    | (Omit<QwikIntrinsicElements['style'], 'dangerouslySetInnerHTML'> & { props?: never })
    | {
        key?: string;
        /**
         * The props of the style element. @deprecated Prefer setting the properties directly
         * instead of using this property.
         */
        props: Readonly<QwikIntrinsicElements['style']>;
      }
  ) &
    (
      | {
          /** The inline style content. */
          style?: string;
          dangerouslySetInnerHTML?: never;
        }
      | { dangerouslySetInnerHTML?: string; style?: never }
    )
>;

/** @public */
export type DocumentScript = (
  | (Omit<QwikIntrinsicElements['script'], 'dangerouslySetInnerHTML'> & { props?: never })
  | {
      key?: string;
      /**
       * The props of the script element. @deprecated Prefer setting the properties directly instead
       * of using this property.
       */
      props: Readonly<QwikIntrinsicElements['script']>;
    }
) &
  (
    | {
        /** The inline script content. */
        script?: string;
        dangerouslySetInnerHTML?: never;
      }
    | { dangerouslySetInnerHTML?: string; script?: never }
  );

/** @public */
export interface DocumentHeadProps extends RouteLocation {
  readonly head: ResolvedDocumentHead;
  /** The HTTP status code of the response (e.g. 200, 404). */
  readonly status: number;
  /** @deprecated This is not necessary, it works correctly without */
  readonly withLocale: <T>(fn: () => T) => T;
  readonly resolveValue: ResolveSyncValue;
}

/** @public */
export type DocumentHead = DocumentHeadValue | ((props: DocumentHeadProps) => DocumentHeadValue);

export type ContentStateInternal = NoSerialize<ContentModule[]>;

/** @public */
export interface ContentState {
  readonly headings: ContentHeading[] | undefined;
  readonly menu: ContentMenu | undefined;
}

/** @public */
export interface ContentMenu {
  readonly text: string;
  readonly href?: string;
  readonly items?: ContentMenu[];
}

/** @public */
export interface ContentHeading {
  readonly text: string;
  readonly id: string;
  readonly level: number;
}

export type ContentModuleLoader = () => ValueOrPromise<ContentModule>;
export type EndpointModuleLoader = () => ValueOrPromise<RouteModule>;
// export type RouteLoaderLoader = () => ValueOrPromise<LoaderInternal>;
export type ModuleLoader = ContentModuleLoader | EndpointModuleLoader; //| RouteLoaderLoader;
export type MenuModuleLoader = () => Promise<MenuModule>;

/**
 * A nested route trie structure. The root represents `/` and each level represents a URL segment.
 *
 * Keys starting with `_` are metadata; all other keys are child route segments.
 *
 * - Use `_W` as the key for a single dynamic segment (param); `_P` on that node names the param.
 * - Use `_A` as the key for a rest/catch-all segment; `_P` on that node names the param.
 * - For infix params like `pre[slug]post`, use `_W` with `_0` (prefix) and `_9` (suffix).
 * - Use `_M` for an array of group (pathless layout) nodes, sorted by group name.
 *
 * When matching, exact segments are tried first (case-insensitive), then `_W` (with optional
 * prefix/suffix), then `_A`. When no route matches, the closest `_E` (error.tsx) or `_4` (404.tsx)
 * loader in the ancestor chain is used to render the error page.
 *
 * @public
 */
export interface RouteData {
  /** This node's layout loader (single). Runtime accumulates these during trie traversal. */
  _L?: ContentModuleLoader;
  /**
   * This node's index/page loader. Single = normal (runtime prepends gathered _L). Array = override
   * (layout stop / named layout — IS the complete chain).
   */
  _I?: ContentModuleLoader | ModuleLoader[];
  /** Rewrite/goto target path. Matcher re-walks trie from root using this path's keys. */
  _G?: string;
  /** The JS bundle names for this route (SSR only) */
  _B?: string[];
  /**
   * Not-found (404) boundary: single loader (runtime prepends layouts) or override chain
   * (`404@layout`/`!`).
   */
  _4?: ContentModuleLoader | ModuleLoader[];
  /** Error (error.tsx) boundary, same single-or-override-chain shape as `_4`. */
  _E?: ContentModuleLoader | ModuleLoader[];
  /** The parameter name when this node is reached via `_W` or `_A` from the parent */
  _P?: string;
  /** Prefix for infix params (e.g. "pre" for `pre[slug]post`) — only on `_W` nodes */
  _0?: string;
  /** Suffix for infix params (e.g. "post" for `pre[slug]post`) — only on `_W` nodes */
  _9?: string;
  /** Group (pathless layout) nodes merged into this level, sorted by group name */
  _M?: RouteData[];
  /** Menu loader for this subtree (from menu.md). Runtime uses nearest ancestor during traversal. */
  _N?: MenuModuleLoader;
  /** Array of routeLoader$ hashes for this node's loaders */
  _R?: string[];
  /** Child route segments (any key not starting with `_`) */
  [part: string]:
    | RouteData
    | RouteData[]
    | ModuleLoader[]
    | ContentModuleLoader
    | MenuModuleLoader
    | string[]
    | string
    | undefined;
}

/**
 * @deprecated Use `QwikRouterConfig` instead. Will be removed in V3.
 * @public
 */
export type QwikCityPlan = QwikRouterConfig;

/** @public */
export interface QwikRouterConfig {
  readonly routes: RouteData;
  readonly serverPlugins?: RouteModule[];
  readonly basePathname?: string;
  readonly trailingSlash?: boolean;
  readonly cacheModules?: boolean;
  /** When true, return null instead of rendering the 404 page, letting the adapter handle it */
  readonly fallthrough?: boolean;
}

/** @public */
export declare type PathParams = Record<string, string>;

export type ContentModule = PageModule | LayoutModule;

/** @public */
export type ContentModuleHead = DocumentHead | ResolvedDocumentHead;

/**
 * The eTag export type for routeConfig.
 *
 * - `string` — static ETag value.
 * - `(props: DocumentHeadProps) => string | null` — compute the ETag from route context (params, URL,
 *   loaded data via `resolveValue`, etc.). Return `null` to skip eTag for this request.
 *
 * Qwik normalizes eTag values by stripping weak-form `W/` prefixes, quotes, and forbidden chars,
 * then sends a strong `ETag` header. Values that normalize to an empty string are treated as
 * absent.
 *
 * When set (and a value is produced), the server includes an `ETag` header and returns `304` if
 * `If-None-Match` matches.
 *
 * @public
 */
export type ContentModuleETag = string | ((props: DocumentHeadProps) => string | null);

/**
 * Cache key function. Used by `routeConfig.cacheKey` (SSR HTML cache) and by `routeLoader$`'s
 * `cacheKey` option (per-loader JSON cache).
 *
 * - `true`: use the surface's default key.
 *
 *   - SSR default: `${status}|${eTag}|${pathname}` when an eTag is set, otherwise
 *       `${status}|${pathname}`.
 *   - Loader default: `${pathname}|${filteredSearch}|${loaderId}|${eTag}` when an eTag is set,
 *       otherwise `${pathname}|${filteredSearch}|${loaderId}`.
 * - Function: receives the request event and the normalized, unquoted eTag (or an empty string when
 *   none was provided). Return the cache key string, or `null` or `''` to skip caching for this
 *   request. Loader callbacks receive the loader-scoped request event, with `url`, `query`, and
 *   `request.url` filtered by the loader's `search` allowlist.
 *
 * Note: valid cacheKeys are non-empty strings.
 *
 * @public
 */
export type CacheKeyFn = true | ((requestEv: RequestEvent, eTag: string) => string | null);

/**
 * The value shape returned by a routeConfig export (object form or function return).
 *
 * @public
 */
export interface RouteConfigValue {
  readonly head?: DocumentHeadValue;
  readonly eTag?: ContentModuleETag;
  readonly cacheKey?: CacheKeyFn;
}

/**
 * Unified route configuration export. Groups head, eTag, and cacheKey with the same resolution
 * rules as DocumentHead: can be a static object or a function receiving DocumentHeadProps.
 *
 * When a module exports `routeConfig`, the separate `head`, `eTag`, and `cacheKey` exports are
 * ignored for that module.
 *
 * @public
 */
export type RouteConfig = RouteConfigValue | ((props: DocumentHeadProps) => RouteConfigValue);

/** The route to render */
export interface LoadedRoute {
  /** The canonical path of the route, e.g. `/products/[id]` */
  $routeName$: string;
  /** The route parameters, e.g. `{ id: '123' }` */
  $params$: PathParams;
  /** The modules associated with this route (on 404, contains only the error component) */
  $mods$: (RouteModule | ContentModule)[];
  /** The menu associated with this route */
  $menu$?: ContentMenu | undefined;
  /** The bundle names for this route */
  $routeBundleNames$?: string[] | undefined;
  /** Whether this route is a not-found (404) route */
  $notFound$?: boolean;
  /** The nearest _E (error.tsx) boundary's chain to render on a thrown ServerError (in its layouts). */
  $errorLoader$?: ModuleLoader[];
  /** Merged array of routeLoader$ hashes from all matched nodes (layouts + page) */
  $loaders$?: string[];
  /** Runtime-only mapping of routeLoader$ hashes to the matched pathname used for q-loader fetches */
  $loaderPaths$?: Record<string, string>;
}

export interface EndpointResponse {
  status: number;
  statusMessage?: string;
  formData?: FormData;
  action?: string;
  actionResult?: unknown;
  loaderHashes?: string[];
}

/** @public */
export type StaticGenerateHandler = ({
  env,
}: {
  env: EnvGetter;
}) => Promise<StaticGenerate> | StaticGenerate;

/** @public */
export interface StaticGenerate {
  params?: PathParams[];
}

/** @deprecated Use `QwikRouterEnvData` instead. Will be removed in V3. */
export type QwikCityEnvData = QwikRouterEnvData;
/** @public */
export interface QwikRouterEnvData {
  routeName: string;
  ev: RequestEvent;
  params: PathParams;
  response: EndpointResponse;
  loadedRoute: LoadedRoute;
  routeLoaderCtx: RouteLoaderCtx;
  loaderValues: Record<string, unknown>;
}

/** @public The server data that is provided by Qwik Router during SSR rendering. It can be retrieved with `useServerData(key)` in the server, but it is not available in the client. */
export type ServerData = {
  url: string;
  requestHeaders: Record<string, string>;
  renderMode: 'static' | 'server';
  locale: string | undefined;
  nonce: string | undefined;
  containerAttributes: Record<string, string> & { [Q_ROUTE]: string };
  qwikrouter: QwikRouterEnvData;
};

export interface SimpleURL {
  origin: string;
  href: string;
  pathname: string;
  search: string;
  hash: string;
}

export type Editable<T> = {
  -readonly [P in keyof T]: T[P];
};

type UnionKeys<T> = T extends T ? keyof T : never;
type StrictUnionHelper<T, TAll> = T extends any
  ? T & Partial<Record<Exclude<UnionKeys<TAll>, keyof T>, never>>
  : never;

/** @public */
export type StrictUnion<T> = Prettify<StrictUnionHelper<T, T>>;

type Prettify<T> = {} & {
  [K in keyof T]: T[K];
};

/** @public */
export type JSONValue = string | number | boolean | { [x: string]: JSONValue } | Array<JSONValue>;

/** @public */
export type JSONObject = { [x: string]: JSONValue };

/** @public */
export type GetValidatorInputType<VALIDATOR extends TypedDataValidator> =
  VALIDATOR extends ValibotDataValidator<infer TYPE>
    ? v.InferInput<TYPE>
    : VALIDATOR extends ZodDataValidator<infer TYPE>
      ? z.input<TYPE>
      : never;

/** @public */
export type GetValidatorOutputType<VALIDATOR extends TypedDataValidator> =
  VALIDATOR extends ValibotDataValidator<infer TYPE>
    ? v.InferOutput<TYPE>
    : VALIDATOR extends ZodDataValidator<infer TYPE>
      ? z.output<TYPE>
      : never;

/** @public */
export type GetValidatorType<VALIDATOR extends TypedDataValidator> =
  GetValidatorOutputType<VALIDATOR>;

/** @public */
export type ActionOptions = {
  readonly id?: string;
  readonly validation?: DataValidator[];
  /**
   * Route loaders to invalidate after this action completes. The loader hooks' hashes are sent to
   * the client so it knows which loaders to re-fetch. If omitted, ALL route loaders are invalidated
   * (unless `strictLoaders` is enabled globally in the Vite plugin).
   */
  readonly invalidate?: Loader<any>[];
};

/** @public */
export type FailOfRest<REST extends readonly DataValidator[]> = REST extends readonly DataValidator<
  infer ERROR
>[]
  ? ERROR
  : never;

type IsAny<Type> = 0 extends 1 & Type ? true : false;

/** @public */
export type ValidatorErrorKeyDotNotation<T, Prefix extends string = ''> =
  IsAny<T> extends true
    ? never
    : T extends object
      ? {
          [K in keyof T & string]: IsAny<T[K]> extends true
            ? never
            : T[K] extends (infer U)[]
              ? IsAny<U> extends true
                ? never
                : U extends object
                  ? `${Prefix}${K}[]` | ValidatorErrorKeyDotNotation<U, `${Prefix}${K}[].`>
                  : `${Prefix}${K}[]`
              : T[K] extends object
                ? ValidatorErrorKeyDotNotation<T[K], `${Prefix}${K}.`>
                : `${Prefix}${K}`;
        }[keyof T & string]
      : never;

/** @public */
export type ValidatorErrorType<T, U = string> = {
  formErrors: U[];
  fieldErrors: Partial<{
    [K in ValidatorErrorKeyDotNotation<T>]: K extends `${infer _Prefix}[]${infer _Suffix}`
      ? U[]
      : U;
  }>;
};

/** @public */
export type ActionConstructor = {
  // Use options object, use typed data validator, use data validator
  <
    OBJ extends Record<string, any> | void | null,
    VALIDATOR extends TypedDataValidator,
    REST extends [DataValidator, ...DataValidator[]],
  >(
    actionQrl: (
      data: GetValidatorOutputType<VALIDATOR>,
      event: RequestEventAction
    ) => ValueOrPromise<OBJ>,
    options: ActionOptions & {
      readonly validation: [VALIDATOR, ...REST];
    }
  ): Action<
    StrictUnion<
      | OBJ
      | FailReturn<ValidatorErrorType<GetValidatorInputType<VALIDATOR>>>
      | FailReturn<FailOfRest<REST>>
    >,
    GetValidatorInputType<VALIDATOR>,
    false
  >;

  // Use options object, use typed data validator
  <OBJ extends Record<string, any> | void | null, VALIDATOR extends TypedDataValidator>(
    actionQrl: (
      data: GetValidatorOutputType<VALIDATOR>,
      event: RequestEventAction
    ) => ValueOrPromise<OBJ>,
    options: ActionOptions & {
      readonly validation: [VALIDATOR];
    }
  ): Action<
    StrictUnion<OBJ | FailReturn<ValidatorErrorType<GetValidatorInputType<VALIDATOR>>>>,
    GetValidatorInputType<VALIDATOR>,
    false
  >;

  // Use options object, use data validator
  <OBJ extends Record<string, any> | void | null, REST extends [DataValidator, ...DataValidator[]]>(
    actionQrl: (data: JSONObject, event: RequestEventAction) => ValueOrPromise<OBJ>,
    options: ActionOptions & {
      readonly validation: REST;
    }
  ): Action<StrictUnion<OBJ | FailReturn<FailOfRest<REST>>>>;

  // Use typed data validator, use data validator
  <
    OBJ extends Record<string, any> | void | null,
    VALIDATOR extends TypedDataValidator,
    REST extends [DataValidator, ...DataValidator[]],
  >(
    actionQrl: (
      data: GetValidatorOutputType<VALIDATOR>,
      event: RequestEventAction
    ) => ValueOrPromise<OBJ>,
    options: VALIDATOR,
    ...rest: REST
  ): Action<
    StrictUnion<
      | OBJ
      | FailReturn<ValidatorErrorType<GetValidatorInputType<VALIDATOR>>>
      | FailReturn<FailOfRest<REST>>
    >,
    GetValidatorInputType<VALIDATOR>,
    false
  >;

  // Use typed data validator
  <OBJ extends Record<string, any> | void | null, VALIDATOR extends TypedDataValidator>(
    actionQrl: (
      data: GetValidatorOutputType<VALIDATOR>,
      event: RequestEventAction
    ) => ValueOrPromise<OBJ>,
    options: VALIDATOR
  ): Action<
    StrictUnion<OBJ | FailReturn<ValidatorErrorType<GetValidatorInputType<VALIDATOR>>>>,
    GetValidatorInputType<VALIDATOR>,
    false
  >;

  // Use data validator
  <OBJ extends Record<string, any> | void | null, REST extends [DataValidator, ...DataValidator[]]>(
    actionQrl: (form: JSONObject, event: RequestEventAction) => ValueOrPromise<OBJ>,
    ...rest: REST
  ): Action<StrictUnion<OBJ | FailReturn<FailOfRest<REST>>>>;

  // No validators
  <OBJ>(
    actionQrl: (form: JSONObject, event: RequestEventAction) => ValueOrPromise<OBJ>,
    options?: ActionOptions
  ): Action<StrictUnion<OBJ>>;
};

/** @public */
export type ActionConstructorQRL = {
  // Use options object, use typed data validator, use data validator
  <
    OBJ extends Record<string, any> | void | null,
    VALIDATOR extends TypedDataValidator,
    REST extends [DataValidator, ...DataValidator[]],
  >(
    actionQrl: QRL<
      (data: GetValidatorOutputType<VALIDATOR>, event: RequestEventAction) => ValueOrPromise<OBJ>
    >,
    options: ActionOptions & {
      readonly validation: [VALIDATOR, ...REST];
    }
  ): Action<
    StrictUnion<
      | OBJ
      | FailReturn<ValidatorErrorType<GetValidatorInputType<VALIDATOR>>>
      | FailReturn<FailOfRest<REST>>
    >,
    GetValidatorInputType<VALIDATOR>,
    false
  >;

  // Use options object, use typed data validator
  <OBJ extends Record<string, any> | void | null, VALIDATOR extends TypedDataValidator>(
    actionQrl: QRL<
      (data: GetValidatorOutputType<VALIDATOR>, event: RequestEventAction) => ValueOrPromise<OBJ>
    >,
    options: ActionOptions & {
      readonly validation: [VALIDATOR];
    }
  ): Action<
    StrictUnion<OBJ | FailReturn<ValidatorErrorType<GetValidatorInputType<VALIDATOR>>>>,
    GetValidatorInputType<VALIDATOR>,
    false
  >;

  // Use options object, use data validator
  <OBJ extends Record<string, any> | void | null, REST extends [DataValidator, ...DataValidator[]]>(
    actionQrl: QRL<(data: JSONObject, event: RequestEventAction) => ValueOrPromise<OBJ>>,
    options: ActionOptions & {
      readonly validation: REST;
    }
  ): Action<StrictUnion<OBJ | FailReturn<FailOfRest<REST>>>>;

  // Use typed data validator, use data validator
  <
    OBJ extends Record<string, any> | void | null,
    VALIDATOR extends TypedDataValidator,
    REST extends [DataValidator, ...DataValidator[]],
  >(
    actionQrl: QRL<
      (data: GetValidatorOutputType<VALIDATOR>, event: RequestEventAction) => ValueOrPromise<OBJ>
    >,
    options: VALIDATOR,
    ...rest: REST
  ): Action<
    StrictUnion<
      | OBJ
      | FailReturn<ValidatorErrorType<GetValidatorInputType<VALIDATOR>>>
      | FailReturn<FailOfRest<REST>>
    >,
    GetValidatorInputType<VALIDATOR>,
    false
  >;

  // Use typed data validator
  <OBJ extends Record<string, any> | void | null, VALIDATOR extends TypedDataValidator>(
    actionQrl: QRL<
      (data: GetValidatorOutputType<VALIDATOR>, event: RequestEventAction) => ValueOrPromise<OBJ>
    >,
    options: VALIDATOR
  ): Action<
    StrictUnion<OBJ | FailReturn<ValidatorErrorType<GetValidatorInputType<VALIDATOR>>>>,
    GetValidatorInputType<VALIDATOR>,
    false
  >;

  // Use data validator
  <OBJ extends Record<string, any> | void | null, REST extends [DataValidator, ...DataValidator[]]>(
    actionQrl: QRL<(form: JSONObject, event: RequestEventAction) => ValueOrPromise<OBJ>>,
    ...rest: REST
  ): Action<StrictUnion<OBJ | FailReturn<FailOfRest<REST>>>>;

  // No validators
  <OBJ>(
    actionQrl: QRL<(form: JSONObject, event: RequestEventAction) => ValueOrPromise<OBJ>>,
    options?: ActionOptions
  ): Action<StrictUnion<OBJ>>;
};

/** @public */
export type LoaderOptions = {
  /**
   * Explicit loader id, overriding the QRL hash. Pass a distinct value (e.g. `fn.getHash()`) when
   * loaders share a wrapper QRL.
   */
  readonly id?: string;
  readonly validation?: DataValidator[];
  readonly serializationStrategy?: SerializationStrategy;
  /**
   * Time in milliseconds after which the loader data is considered stale. The server derives
   * `Cache-Control: max-age` seconds from this value on loader responses.
   *
   * On the client, the loader's ComputedSignal `expires` is set to this value. If `poll` is true,
   * the signal auto-refetches when expired. If `poll` is false (default), the data is marked stale
   * but not auto-refetched.
   */
  readonly expires?: number;
  /**
   * When true AND `expires` is set, the loader data is automatically refetched when it expires
   * (polling behavior). When false (default), expired data is marked stale but not auto-refetched.
   */
  readonly poll?: boolean;
  /**
   * Enable ETag-based caching for this loader's JSON responses.
   *
   * - `string` — static ETag value; if `If-None-Match` matches, the loader is skipped entirely
   * - `(ev: RequestEvent) => string | null` — compute the ETag from the request context (params, URL,
   *   headers, etc.); if `If-None-Match` matches, the loader is skipped entirely. Return null to
   *   skip eTag for this request.
   *
   * Qwik normalizes eTag values by stripping weak-form `W/` prefixes, quotes, and forbidden chars,
   * then sends a strong `ETag` header. Values that normalize to an empty string are treated as
   * absent.
   *
   * When set, the server includes an `ETag` header on `q-loader-*.json` responses and returns `304`
   * if the client sends a matching `If-None-Match` header.
   *
   * For auto-computed eTags, use `cacheKey` instead — on cache write the eTag is hashed from the
   * serialized response and stored alongside it, so subsequent hits get the same eTag.
   */
  readonly eTag?: string | ((ev: RequestEvent) => string | null);
  /**
   * Enable in-memory server-side caching of this loader's serialized JSON response.
   *
   * - `true` — use the default key `${pathname}|${filteredSearch}|${loaderId}` (suffixed with
   *   `|${eTag}` when an eTag is set).
   * - Function `(requestEv, eTag) => string | null` — return a custom key, or `null` to skip caching
   *   this request.
   *
   * On cache miss the loader runs, the serialized response is stored alongside its eTag (computed
   * from the data when no `eTag` option is set), and the response is sent. On cache hit the stored
   * `{ eTag, data }` pair is served directly — `If-None-Match` is checked against the stored eTag
   * and a `304` is returned when it matches.
   */
  readonly cacheKey?: CacheKeyFn;
  /**
   * Allowlist of URL search parameter names that this loader depends on.
   *
   * When set, the loader only re-fetches when the listed search params change — other param changes
   * are ignored. Only the listed params are sent in the loader JSON request URL. During SSR and
   * loader JSON requests, the loader receives a request event with `url`, `query`, and
   * `request.url` filtered to the same params.
   *
   * When not set, the `qwikRouter()` plugin option `strictLoaders` determines the behavior. If
   * `strictLoaders` is `true` (this is the default), no search params are sent and changes do not
   * trigger a re-fetch. If `strictLoaders` is `false`, all search params are sent and any change
   * triggers a re-fetch.
   */
  readonly search?: string[];
  /**
   * When true (default), the previous value is kept while the loader re-fetches after navigation,
   * so components see stale data until the new response arrives.
   *
   * When false, the value is cleared on re-fetch, causing reads to suspend (show a loading
   * boundary). This is useful when showing old data during navigation would be confusing.
   */
  readonly allowStale?: boolean;
  /**
   * When true (default), the loader is awaited before SSR renders, so its redirect or error can
   * short-circuit the response and its value is ready for synchronous reads (e.g. in the head).
   *
   * When false, the loader runs in the background without blocking SSR: rendering starts
   * immediately and reading its `.value` suspends until it resolves. A background loader cannot
   * redirect or error the initial SSR response; treat it as a separate request.
   *
   * Setting `false` is experimental and requires adding `experimental: ["blockSSR"]` to your
   * qwikVite plugin options.
   */
  readonly blockSSR?: boolean;
};

/** @public */
export type LoaderConstructor = {
  // Without validation
  <OBJ>(
    loaderFn: (event: RequestEventLoader) => ValueOrPromise<OBJ>,
    options?: LoaderOptions
  ): Loader<[Extract<OBJ, Failed>] extends [never] ? OBJ : StrictUnion<OBJ>>;

  // With validation
  <OBJ extends Record<string, any> | void | null, REST extends readonly DataValidator[]>(
    loaderFn: (event: RequestEventLoader) => ValueOrPromise<OBJ>,
    ...rest: REST
  ): Loader<StrictUnion<OBJ | FailReturn<FailOfRest<REST>>>>;
};

/** @public */
export type LoaderConstructorQRL = {
  // Without validation
  <OBJ>(
    loaderQrl: QRL<(event: RequestEventLoader) => ValueOrPromise<OBJ>>,
    options?: LoaderOptions
  ): Loader<[Extract<OBJ, Failed>] extends [never] ? OBJ : StrictUnion<OBJ>>;

  // With validation
  <OBJ extends Record<string, any> | void | null, REST extends readonly DataValidator[]>(
    loaderQrl: QRL<(event: RequestEventLoader) => ValueOrPromise<OBJ>>,
    ...rest: REST
  ): Loader<StrictUnion<OBJ | FailReturn<FailOfRest<REST>>>>;
};

/** @public */
export type ActionReturn<RETURN> = {
  readonly status?: number;
  readonly value: RETURN;
};

/** @public */
export type ActionStore<RETURN, INPUT, OPTIONAL extends boolean = true> = {
  /**
   * It's the "action" path that a native `<form>` should have in order to call the action.
   *
   * ```tsx
   *  <form action={action.actionPath} />
   * ```
   *
   * Most of the time this property should not be used directly, instead use the `Form` component:
   *
   * ```tsx
   * import {action$, Form} from '@qwik.dev/router';
   *
   * export const useAddUser = action$(() => { ... });
   *
   * export default component$(() => {
   *   const action = useAddUser();
   *   return (
   *     <Form action={action}/>
   *   );
   * });
   * ```
   */
  readonly actionPath: string;

  /**
   * Reactive property that becomes `true` only in the browser, when a form is submitted and
   * switched back to false when the action finish, ie, it describes if the action is actively
   * running.
   *
   * This property is specially useful to disable the submit button while the action is processing,
   * to prevent multiple submissions, and to inform visually to the user that the action is actively
   * running.
   *
   * It will be always `false` in the server, and only becomes `true` briefly while the action is
   * running.
   */
  readonly isRunning: boolean;

  /**
   * Returned HTTP status code of the action after its last execution.
   *
   * It's `undefined` before the action is first called.
   */
  readonly status?: number;

  /**
   * When calling an action through a `<form>`, this property contains the previously submitted
   * `FormData`.
   *
   * This is useful to keep the filled form data even after a full page reload.
   *
   * It's `undefined` before the action is first called.
   */
  readonly formData: FormData | undefined;

  /**
   * Returned successful data of the action. This reactive property will contain the data returned
   * inside the `action$` function.
   *
   * It's `undefined` before the action is first called.
   */
  readonly value: RETURN | undefined;

  /**
   * Method to execute the action programmatically from the browser. Ie, instead of using a
   * `<form>`, a 'click' handle can call the `run()` method of the action in order to execute the
   * action in the server.
   */
  readonly submit: QRL<
    OPTIONAL extends true
      ? (form?: INPUT | FormData | SubmitEvent) => Promise<ActionReturn<RETURN>>
      : (form: INPUT | FormData | SubmitEvent) => Promise<ActionReturn<RETURN>>
  >;
  /** Is action.submit was submitted */
  readonly submitted: boolean;
};

type Failed = {
  failed: true;
};

/** @public */
export type FailReturn<T> = T & Failed;

/**
 * Drops control-flow signals (`ev.redirect()`, `ev.error()`, etc.) from a loader/action return
 * type: those are thrown, not surfaced as data. `ev.fail()` is plain data and is kept.
 *
 * @public
 */
export type ExcludeControlFlow<T> = Exclude<T, AbortMessage | ServerError>;

/** @public */
export type LoaderSignal<TYPE> = (TYPE extends () => ValueOrPromise<infer VALIDATOR>
  ? Signal<ValueOrPromise<VALIDATOR>>
  : Signal<TYPE>) &
  Pick<ComputedSignal<any>, 'promise' | 'pending' | 'error' | 'loading'>;

/** @public */
export type Loader<RETURN> = {
  /**
   * Returns the `Signal` containing the data returned by the `loader$` function. Like all `use-`
   * functions and methods, it can only be invoked within a `component$()`.
   */
  (): LoaderSignal<ExcludeControlFlow<RETURN>>;
};

export interface LoaderInternal extends Loader<any> {
  readonly __brand?: 'server_loader';
  __qrl: QRL<(event: RequestEventLoader) => ValueOrPromise<unknown>>;
  __id: string;
  __validators: DataValidator[] | undefined;
  __serializationStrategy: SerializationStrategy;
  __expires: number;
  __poll: boolean;
  __eTag: string | ((ev: RequestEvent) => string | null) | undefined;
  __cacheKey: CacheKeyFn | undefined;
  __search: string[] | undefined;
  __allowStale: boolean;
  __blockSSR: boolean;
  (): LoaderSignal<unknown>;
}

/** @public */
export type Action<RETURN, INPUT = Record<string, unknown>, OPTIONAL extends boolean = true> = {
  /**
   * Returns the `ActionStore` containing the current action state and methods to invoke it from a
   * component$(). Like all `use-` functions and methods, it can only be invoked within a
   * `component$()`.
   */
  (): ActionStore<ExcludeControlFlow<RETURN>, INPUT, OPTIONAL>;
};

export interface ActionInternal extends Action<any, any> {
  readonly __brand: 'server_action';
  __id: string;
  __qrl: QRL<(form: JSONObject, event: RequestEventAction) => ValueOrPromise<unknown>>;
  __validators: DataValidator[] | undefined;
  /** Loader hashes to invalidate after this action. Undefined = invalidate all. */
  __invalidate: string[] | undefined;

  (): ActionStore<unknown, unknown>;
}
/** @public */
export type ValidatorReturn<T extends Record<string, any> = {}> =
  | ValidatorReturnSuccess
  | ValidatorReturnFail<T>;

export type ValidatorReturnSuccess = {
  readonly success: true;
  readonly data?: unknown;
};

export type ValidatorReturnFail<T extends Record<string, any> = {}> = {
  readonly success: false;
  readonly error: T;
  readonly status?: number;
};

/** @public */
export type DataValidator<T extends Record<string, any> = {}> = {
  validate(ev: RequestEvent, data: unknown): Promise<ValidatorReturn<T>>;
};

export type ValidatorConstructor = {
  <T extends ValidatorReturn>(
    validator: (ev: RequestEvent, data: unknown) => ValueOrPromise<T>
  ): T extends ValidatorReturnFail<infer ERROR> ? DataValidator<ERROR> : DataValidator<never>;
};

export type ValidatorConstructorQRL = {
  <T extends ValidatorReturn>(
    validator: QRL<(ev: RequestEvent, data: unknown) => ValueOrPromise<T>>
  ): T extends ValidatorReturnFail<infer ERROR> ? DataValidator<ERROR> : DataValidator<never>;
};

/** @beta */
export type ValibotDataValidator<
  T extends v.GenericSchema | v.GenericSchemaAsync = v.GenericSchema | v.GenericSchemaAsync,
> = {
  readonly __brand: 'valibot';
  validate(
    ev: RequestEvent,
    data: unknown
  ): Promise<ValidatorReturn<ValidatorErrorType<v.InferInput<T>>>>;
};

/** @beta */
export type ValibotConstructor = {
  <T extends v.GenericSchema | v.GenericSchemaAsync>(schema: T): ValibotDataValidator<T>;
  <T extends v.GenericSchema | v.GenericSchemaAsync>(
    schema: (ev: RequestEvent) => T
  ): ValibotDataValidator<T>;
};

/** @beta */
export type ValibotConstructorQRL = {
  <T extends v.GenericSchema | v.GenericSchemaAsync>(schema: QRL<T>): ValibotDataValidator<T>;
  <T extends v.GenericSchema | v.GenericSchemaAsync>(
    schema: QRL<(ev: RequestEvent) => T>
  ): ValibotDataValidator<T>;
};

/** @public */
export type ZodDataValidator<T extends z.ZodType = z.ZodType> = {
  readonly __brand: 'zod';
  validate(
    ev: RequestEvent,
    data: unknown
  ): Promise<ValidatorReturn<ValidatorErrorType<z.input<T>>>>;
};

/** @public */
export type ZodConstructor = {
  <T extends z.ZodRawShape>(schema: T): ZodDataValidator<z.ZodObject<T>>;
  <T extends z.ZodRawShape>(
    schema: (zod: typeof z.z, ev: RequestEvent) => T
  ): ZodDataValidator<z.ZodObject<T>>;
  <T extends z.Schema>(schema: T): ZodDataValidator<T>;
  <T extends z.Schema>(schema: (zod: typeof z.z, ev: RequestEvent) => T): ZodDataValidator<T>;
};

/** @public */
export type ZodConstructorQRL = {
  <T extends z.ZodRawShape>(schema: QRL<T>): ZodDataValidator<z.ZodObject<T>>;
  <T extends z.ZodRawShape>(
    schema: QRL<(zod: typeof z.z, ev: RequestEvent) => T>
  ): ZodDataValidator<z.ZodObject<T>>;
  <T extends z.Schema>(schema: QRL<T>): ZodDataValidator<T>;
  <T extends z.Schema>(schema: QRL<(zod: typeof z.z, ev: RequestEvent) => T>): ZodDataValidator<T>;
};

/** @public */
export type TypedDataValidator = ValibotDataValidator | ZodDataValidator;

/** @public */
export interface ServerConfig {
  // TODO: create id registry
  // id?: string;
  origin?: string;
  // TODO: recreate sending arguments as queryParams
  // only support "get" and "post" for now
  method?: 'get' | 'post'; // | 'patch' | 'delete';
  headers?: Record<string, string>;
  // TODO: add cache interface
  // cache?: any,
  // TODO: cancel with signal
  // signal?: Signal<boolean>;
  fetchOptions?: any;
}

/** @public */
export type ServerFunction = {
  (this: RequestEventBase, ...args: any[]): any;
  options?: ServerConfig;
};

/**
 * You can pass an AbortSignal as the first argument of a `server$` function and it will use it to
 * abort the fetch when fired.
 *
 * @public
 */
export type ServerQRL<T extends ServerFunction> = QRL<
  | ((abort: AbortSignal, ...args: Parameters<T>) => ReturnType<T>)
  | ((...args: Parameters<T>) => ReturnType<T>)
>;
