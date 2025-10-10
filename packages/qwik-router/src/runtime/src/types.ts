import type {
  NoSerialize,
  QRL,
  QwikIntrinsicElements,
  ReadonlySignal,
  Signal,
  ValueOrPromise,
} from '@qwik.dev/core';
import type { SerializationStrategy } from '@qwik.dev/core/internal';
import type {
  EnvGetter,
  RequestEvent,
  RequestEventAction,
  RequestEventBase,
  RequestEventLoader,
  RequestHandler,
  ResolveSyncValue,
} from '@qwik.dev/router/middleware/request-handler';
import type * as v from 'valibot';
import type * as z from 'zod';
import type { Q_ROUTE } from './constants';

export type {
  Cookie,
  CookieOptions,
  CookieValue,
  DeferReturn,
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
export interface PageModule extends RouteModule {
  readonly default: unknown;
  readonly head?: ContentModuleHead;
  readonly headings?: ContentHeading[];
  readonly onStaticGenerate?: StaticGenerateHandler;
}

export interface LayoutModule extends RouteModule {
  readonly default: unknown;
  readonly head?: ContentModuleHead;
}

export interface MenuModule {
  readonly default: ContentMenu;
}

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
};

export type RebuildRouteInfoInternal = (
  url: URL
) => Promise<{ loadedRoute: LoadedRoute | null; requestHandlers: RequestHandler<any>[] }>;

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
> = Required<DocumentHeadValue<FrontMatter>>;

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

export type ContentModuleLoader = () => Promise<ContentModule>;
export type EndpointModuleLoader = () => Promise<RouteModule>;
// export type RouteLoaderLoader = () => Promise<LoaderInternal>;
export type ModuleLoader = ContentModuleLoader | EndpointModuleLoader; //| RouteLoaderLoader;
export type MenuModuleLoader = () => Promise<MenuModule>;

export type RouteLoaderInfo = [qrl: string, expires: number, live?: true];
/** @public */
export type RouteData =
  // SSR side
  | [
      routeName: string,
      moduleLoaders: ModuleLoader[],
      // , routeLoaderModules: ModuleLoader[]
    ]
  // Client side
  | [
      routeName: string,
      moduleLoaders: ModuleLoader[],
      // routeLoaderModules: ModuleLoader[],
      /** The actual src/routes pathname, not rewritten */
      originalPathname: string,
      /** The bundles that contain the loaders */
      routeBundleNames: string[],
    ];

export const enum RouteDataProp {
  RouteName,
  ModuleLoaders,
  // RouteLoaderModules,
  OriginalPathname,
  RouteBundleNames,
}

/** @public */
export type MenuData = [pathname: string, menuLoader: MenuModuleLoader];

export const enum MenuDataProp {
  Pathname,
  MenuLoader,
}

/**
 * @deprecated Use `QwikRouterConfig` instead. Will be removed in V3.
 * @public
 */
export type QwikCityPlan = QwikRouterConfig;

/** @public */
export interface QwikRouterConfig {
  readonly routes: RouteData[];
  readonly serverPlugins?: RouteModule[];
  readonly basePathname?: string;
  readonly menus?: MenuData[];
  readonly trailingSlash?: boolean;
  readonly cacheModules?: boolean;
}

/** @public */
export declare type PathParams = Record<string, string>;

export type ContentModule = PageModule | LayoutModule;

export type ContentModuleHead = DocumentHead | ResolvedDocumentHead;

export type LoadedRoute = [
  routeName: string,
  params: PathParams,
  mods: (RouteModule | ContentModule)[],
  menu: ContentMenu | undefined,
  routeBundleNames: string[] | undefined,
];

export const enum LoadedRouteProp {
  RouteName,
  Params,
  Mods,
  Menu,
  RouteBundleNames,
}

export interface EndpointResponse {
  status: number;
  loaders: Record<string, unknown>;
  loadersSerializationStrategy: Map<string, SerializationStrategy>;
  formData?: FormData;
  action?: string;
}

export interface ClientPageData extends Omit<EndpointResponse, 'loadersSerializationStrategy'> {
  href: string;
  redirect?: string;
  isRewrite?: boolean;
}

export interface LoaderData {
  loaders: Record<string, unknown>;
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
  loadedRoute: LoadedRoute | null;
}

/** @public The server data that is provided by Qwik Router during SSR rendering. It can be retrieved with `useServerData(key)` in the server, but it is not available in the client. */
export type ServerData = {
  url: string;
  requestHeaders: Record<string, string>;
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
    options: {
      readonly id?: string;
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
    options: {
      readonly id?: string;
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
    options: {
      readonly id?: string;
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
    options?: {
      readonly id?: string;
    }
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
    options: {
      readonly id?: string;
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
    options: {
      readonly id?: string;
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
    options: {
      readonly id?: string;
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
    options?: {
      readonly id?: string;
    }
  ): Action<StrictUnion<OBJ>>;
};

/** @public */
export type LoaderOptions = {
  readonly id?: string;
  readonly validation?: DataValidator[];
  readonly serializationStrategy?: SerializationStrategy;
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

/** @public */
export type LoaderSignal<TYPE> = TYPE extends () => ValueOrPromise<infer VALIDATOR>
  ? ReadonlySignal<ValueOrPromise<VALIDATOR>>
  : ReadonlySignal<TYPE>;

/** @public */
export type Loader<RETURN> = {
  /**
   * Returns the `Signal` containing the data returned by the `loader$` function. Like all `use-`
   * functions and methods, it can only be invoked within a `component$()`.
   */
  (): LoaderSignal<RETURN>;
};

export interface LoaderInternal extends Loader<any> {
  readonly __brand?: 'server_loader';
  __qrl: QRL<(event: RequestEventLoader) => ValueOrPromise<unknown>>;
  __id: string;
  __validators: DataValidator[] | undefined;
  __serializationStrategy: SerializationStrategy;
  __expires: number;
  // __live: boolean;
  (): LoaderSignal<unknown>;
}

/** @public */
export type Action<RETURN, INPUT = Record<string, unknown>, OPTIONAL extends boolean = true> = {
  /**
   * Returns the `ActionStore` containing the current action state and methods to invoke it from a
   * component$(). Like all `use-` functions and methods, it can only be invoked within a
   * `component$()`.
   */
  (): ActionStore<RETURN, INPUT, OPTIONAL>;
};

export interface ActionInternal extends Action<any, any> {
  readonly __brand: 'server_action';
  __id: string;
  __qrl: QRL<(form: JSONObject, event: RequestEventAction) => ValueOrPromise<unknown>>;
  __validators: DataValidator[] | undefined;

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
