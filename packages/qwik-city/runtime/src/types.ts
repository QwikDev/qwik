import type {
  GetSyncData,
  RequestEventAction,
  RequestEventLoader,
  RequestHandler,
} from '@builder.io/qwik-city/middleware/request-handler';
import type { NoSerialize, QRL, Signal, ValueOrPromise } from '@builder.io/qwik';
import type { z } from 'zod';

export type {
  Cookie,
  CookieOptions,
  CookieValue,
  GetData,
  GetSyncData,
  RequestEvent,
  RequestHandler,
  RequestEventLoader,
  RequestEventCommon,
} from '@builder.io/qwik-city/middleware/request-handler';

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

/**
 * @alpha
 */
export interface PageModule extends RouteModule {
  readonly default: any;
  readonly head?: ContentModuleHead;
  readonly headings?: ContentHeading[];
  readonly onStaticGenerate?: StaticGenerateHandler;
}

export interface LayoutModule extends RouteModule {
  readonly default: any;
  readonly head?: ContentModuleHead;
}

export interface MenuModule {
  readonly default: ContentMenu;
}

/**
 * @alpha
 */
export interface RouteLocation {
  readonly params: Readonly<Record<string, string>>;
  readonly href: string;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly isNavigating: boolean;
}

/**
 * @alpha
 */
export type JSONValue = string | number | boolean | { [x: string]: JSONValue } | Array<JSONValue>;

/**
 * @alpha
 */
export type JSONObject = { [x: string]: JSONValue };

export type GetValidatorType<B extends ZodReturn<any>> = B extends ZodReturn<infer TYPE>
  ? z.infer<z.ZodObject<TYPE>>
  : never;

/**
 * @alpha
 */
export interface ActionConstructor {
  <O>(actionQrl: (form: JSONObject, event: RequestEventAction) => ValueOrPromise<O>): Action<O>;
  <O, B extends ZodReturn>(
    actionQrl: (data: GetValidatorType<B>, event: RequestEventAction) => ValueOrPromise<O>,
    options: B
  ): Action<
    O | FailReturn<z.typeToFlattenedError<GetValidatorType<B>>>,
    GetValidatorType<B>,
    false
  >;
}
export type LoaderStateHolder = Record<string, Signal<any>>;

/**
 * @alpha
 */
export type RouteNavigate = QRL<(path?: string) => Promise<void>>;

export type RouteAction = Signal<RouteActionValue>;

export type RouteActionResolver = { status: number; result: any };
export type RouteActionValue =
  | {
      id: string;
      data: FormData | Record<string, any> | undefined;
      output?: RouteActionResolver;
      resolve?: NoSerialize<(data: RouteActionResolver) => void>;
    }
  | undefined;

export type MutableRouteLocation = Mutable<RouteLocation>;

export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * @alpha
 */
export interface DocumentHeadValue {
  /**
   * Sets `document.title`.
   */
  readonly title?: string;
  /**
   * Used to manually set meta tags in the head. Additionally, the `data`
   * property could be used to set arbitrary data which the `<head>` component
   * could later use to generate `<meta>` tags.
   */
  readonly meta?: readonly DocumentMeta[];
  /**
   * Used to manually append `<link>` elements to the `<head>`.
   */
  readonly links?: readonly DocumentLink[];
  /**
   * Used to manually append `<style>` elements to the `<head>`.
   */
  readonly styles?: readonly DocumentStyle[];
  /**
   * Arbitrary object containing custom data. When the document head is created from
   * markdown files, the frontmatter attributes that are not recognized as a well-known
   * meta names (such as title, description, author, etc...), are stored in this property.
   */
  readonly frontmatter?: Readonly<Record<string, any>>;
}

/**
 * @alpha
 */
export type ResolvedDocumentHead = Required<DocumentHeadValue>;

/**
 * @alpha
 */
export interface DocumentMeta {
  readonly content?: string;
  readonly httpEquiv?: string;
  readonly name?: string;
  readonly property?: string;
  readonly key?: string;
  readonly itemprop?: string;
}

/**
 * @alpha
 */
export interface DocumentLink {
  as?: string;
  crossorigin?: string;
  disabled?: boolean;
  href?: string;
  hreflang?: string;
  id?: string;
  imagesizes?: string;
  imagesrcset?: string;
  integrity?: string;
  media?: string;
  prefetch?: string;
  referrerpolicy?: string;
  rel?: string;
  sizes?: string;
  title?: string;
  type?: string;
  key?: string;
}

/**
 * @alpha
 */
export interface DocumentStyle {
  readonly style: string;
  readonly props?: Readonly<{ [propName: string]: string }>;
  readonly key?: string;
}

/**
 * @alpha
 */
export interface DocumentHeadProps extends RouteLocation {
  readonly head: ResolvedDocumentHead;
  readonly withLocale: <T>(fn: () => T) => T;
  readonly getData: GetSyncData;
}

/**
 * @alpha
 */
export type DocumentHead = DocumentHeadValue | ((props: DocumentHeadProps) => DocumentHeadValue);

export type ContentStateInternal = NoSerialize<ContentModule[]>;

/**
 * @alpha
 */
export interface ContentState {
  readonly headings: ContentHeading[] | undefined;
  readonly menu: ContentMenu | undefined;
}

/**
 * @alpha
 */
export interface ContentMenu {
  readonly text: string;
  readonly href?: string;
  readonly items?: ContentMenu[];
}

/**
 * @alpha
 */
export interface ContentHeading {
  readonly text: string;
  readonly id: string;
  readonly level: number;
}

export type ContentModuleLoader = () => Promise<ContentModule>;
export type EndpointModuleLoader = () => Promise<RouteModule>;
export type ModuleLoader = ContentModuleLoader | EndpointModuleLoader;
export type MenuModuleLoader = () => Promise<MenuModule>;

/**
 * @alpha
 */
export type RouteData =
  | [pattern: RegExp, loaders: ModuleLoader[]]
  | [pattern: RegExp, loaders: ModuleLoader[], paramNames: string[]]
  | [
      pattern: RegExp,
      loaders: ModuleLoader[],
      paramNames: string[],
      originalPathname: string,
      routeBundleNames: string[]
    ];

/**
 * @alpha
 */
export type MenuData = [pathname: string, menuLoader: MenuModuleLoader];

/**
 * @alpha
 */
export interface QwikCityPlan {
  readonly routes: RouteData[];
  readonly serverPlugins?: RouteModule[];
  readonly basePathname?: string;
  readonly menus?: MenuData[];
  readonly trailingSlash?: boolean;
  readonly cacheModules?: boolean;
}

/**
 * @alpha
 * @deprecated Please update to `PathParams` instead
 */
export declare type RouteParams = Record<string, string>;

/**
 * @alpha
 */
export declare type PathParams = Record<string, string>;

export type ContentModule = PageModule | LayoutModule;

export type ContentModuleHead = DocumentHead | ResolvedDocumentHead;

export type LoadedRoute = [
  params: PathParams,
  mods: (RouteModule | ContentModule)[],
  menu: ContentMenu | undefined,
  routeBundleNames: string[] | undefined
];

export interface LoadedContent extends LoadedRoute {
  pageModule: PageModule;
}

/**
 * @alpha
 * @deprecated Please use `RequestHandler` instead.
 */
export type EndpointHandler<BODY = unknown> = RequestHandler<BODY>;

export type RequestHandlerBody<BODY> = BODY | string | number | boolean | undefined | null | void;

export type RequestHandlerBodyFunction<BODY> = () =>
  | RequestHandlerBody<BODY>
  | Promise<RequestHandlerBody<BODY>>;

export interface EndpointResponse {
  status: number;
  loaders: Record<string, unknown>;
  formData?: FormData;
  action?: string;
}

export interface ClientPageData extends Omit<EndpointResponse, 'status'> {
  status: number;
  href: string;
  redirect?: string;
}

/**
 * @alpha
 */
export type StaticGenerateHandler = () => Promise<StaticGenerate> | StaticGenerate;

/**
 * @alpha
 */
export interface StaticGenerate {
  params?: PathParams[];
}

export interface QwikCityRenderDocument extends Document {}

export interface QwikCityEnvData {
  params: PathParams;
  response: EndpointResponse;
  loadedRoute: LoadedRoute | null;
}

export interface SimpleURL {
  origin: string;
  href: string;
  pathname: string;
  search: string;
  hash: string;
}

/**
 * @alpha
 */
export interface ActionReturn<RETURN> {
  readonly status?: number;
  readonly value: GetValueReturn<RETURN>;
}

/**
 * @alpha
 */
export interface ActionStore<RETURN, INPUT, OPTIONAL extends boolean = true> {
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
   * import {action$, Form} from '@builder.io/qwik-city';
   *
   * export const addUser = action$(() => { ... });
   *
   * export default component$(() => {
   *   const action = addUser.use()l
   *   return (
   *     <Form action={action}/>
   *   );
   * });
   * ```
   */
  readonly actionPath: string;

  /**
   * Reactive property that becomes `true` only in the browser, when a form is submited and switched back to false when the action finish, ie, it describes if the action is actively running.
   *
   * This property is specially useful to disable the submit button while the action is processing, to prevent multiple submissions, and to inform visually to the user that the action is actively running.
   *
   * It will be always `false` in the server, and only becomes `true` briefly while the action is running.
   */
  readonly isRunning: boolean;

  /**
   * Returned HTTP status code of the action after its last execution.
   *
   * It's `undefined` before the action is first called.
   */
  readonly status?: number;

  /**
   * When calling an action through a `<form>`, this property contains the previously submitted `FormData`.
   *
   * This is useful to keep the filled form data even after a full page reload.
   *
   * It's `undefined` before the action is first called.
   */
  readonly formData: FormData | undefined;

  /**
   * Returned succesful data of the action. This reactive property will contain the data returned inside the `action$` function.
   *
   * It's `undefined` before the action is first called.
   */
  readonly value: GetValueReturn<RETURN> | undefined;

  /**
   * Method to execute the action programatically from the browser. Ie, instead of using a `<form>`, a 'click' handle can call the `run()` method of the action
   * in order to execute the action in the server.
   */
  readonly run: QRL<
    OPTIONAL extends true
      ? (form?: INPUT | FormData | SubmitEvent) => Promise<ActionReturn<RETURN>>
      : (form: INPUT | FormData | SubmitEvent) => Promise<ActionReturn<RETURN>>
  >;
}

/**
 * @alpha
 */
export type FailReturn<T> = T & {
  failed: true;
};

/**
 * @alpha
 */
export type V<T> = T extends FailReturn<any> ? never : T;
export type F<T> = T extends FailReturn<any> ? T : never;
export type GetValueReturn<T> =
  | (V<T> & Record<keyof F<T>, undefined>)
  | (F<T> & Record<keyof V<T>, undefined>);

/**
 * @alpha
 */
export type LoaderSignal<T> = Awaited<T> extends () => ValueOrPromise<infer B>
  ? Signal<ValueOrPromise<B>>
  : Signal<Awaited<T>>;

/**
 * @alpha
 */
export interface Loader<RETURN> {
  readonly [isServerLoader]?: true;

  /**
   * Returns the `Signal` containing the data returned by the `loader$` function.
   * Like all `use-` functions and methods, it can only be invokated within a `component$()`.
   */
  use(): LoaderSignal<RETURN>;
}

declare const isServerLoader: unique symbol;

export interface LoaderInternal extends Loader<any> {
  readonly __brand?: 'server_loader';
  __qrl: QRL<(event: RequestEventLoader) => ValueOrPromise<any>>;
  use(): Signal<any>;
}
/**
 * @alpha
 */
export interface Action<RETURN, INPUT = Record<string, any>, OPTIONAL extends boolean = true> {
  readonly [isServerLoader]?: true;

  /**
   * Returns the `ActionStore` containing the current action state and methods to invoke it from a component$().
   * Like all `use-` functions and methods, it can only be invokated within a `component$()`.
   */
  use(): ActionStore<RETURN, INPUT, OPTIONAL>;
}

export interface ActionInternal extends Action<any, any> {
  readonly __brand: 'server_action';
  __qrl: QRL<(form: FormData, event: RequestEventAction) => ValueOrPromise<any>>;
  __schema: ZodReturn | undefined;

  use(): ActionStore<any, any>;
}

export type Editable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * @alpha
 */
export type ActionOptions = z.ZodRawShape;

/**
 * @alpha
 */
export type ZodReturn<T extends ActionOptions = any> = Promise<z.ZodObject<T>>;

/**
 * @alpha
 */
export interface Zod {
  <T extends ActionOptions>(schema: T): ZodReturn<T>;
  <T extends ActionOptions>(schema: (z: typeof import('zod').z) => T): ZodReturn<T>;
}
