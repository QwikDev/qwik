import type { Cookie, CookieOptions, CookieValue } from '../../middleware/request-handler/types';
import type { ErrorResponse } from '../../middleware/request-handler/error-handler';
import type { RedirectResponse } from '../../middleware/request-handler/redirect-handler';
import type { NoSerialize, QRL, Signal } from '@builder.io/qwik';
import type { ServerAction, ServerLoader } from './server-functions';

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
  readonly params: Record<string, string>;
  readonly href: string;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly isPending: boolean;
}

export type RouteNavigate = QRL<(path?: string) => Promise<void>>;

export type RouteAction = Signal<RouteActionValue>;

export type RouteActionValue = NoSerialize<{
  data: FormData;
  id: string;
  resolve: (result: any) => void;
}>;

export type MutableRouteLocation = Mutable<RouteLocation>;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * @alpha
 */
export interface DocumentHeadValue {
  /**
   * Sets `document.title`.
   */
  title?: string;
  /**
   * Used to manually set meta tags in the head. Additionally, the `data`
   * property could be used to set arbitrary data which the `<head>` component
   * could later use to generate `<meta>` tags.
   */
  meta?: DocumentMeta[];
  /**
   * Used to manually append `<link>` elements to the `<head>`.
   */
  links?: DocumentLink[];
  /**
   * Used to manually append `<style>` elements to the `<head>`.
   */
  styles?: DocumentStyle[];
  /**
   * Arbitrary object containing custom data. When the document head is created from
   * markdown files, the frontmatter attributes that are not recognized as a well-known
   * meta names (such as title, description, author, etc...), are stored in this property.
   */
  frontmatter?: Record<string, any>;
}

/**
 * @alpha
 */
export type ResolvedDocumentHead = Required<DocumentHeadValue>;

/**
 * @alpha
 */
export interface DocumentMeta {
  content?: string;
  httpEquiv?: string;
  name?: string;
  property?: string;
  key?: string;
  itemprop?: string;
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
  style: string;
  props?: { [propName: string]: string };
  key?: string;
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

export interface ContentStateInternal {
  contents: NoSerialize<ContentModule[]>;
}

export interface ContentState {
  headings: ContentHeading[] | undefined;
  menu: ContentMenu | undefined;
}

/**
 * @alpha
 */
export interface ContentMenu {
  text: string;
  href?: string;
  items?: ContentMenu[];
}

/**
 * @alpha
 */
export interface ContentHeading {
  text: string;
  id: string;
  level: number;
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

export type MenuData = [pathname: string, menuLoader: MenuModuleLoader];

/**
 * @alpha
 */
export interface QwikCityPlan {
  routes: RouteData[];
  basePathname?: string;
  menus?: MenuData[];
  trailingSlash?: boolean;
  cacheModules?: boolean;
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
 */
export interface RequestContext {
  formData(): Promise<FormData>;
  headers: Headers;
  json(): Promise<any>;
  method: string;
  text(): Promise<string>;
  url: string;
}

/**
 * @alpha
 */
export interface ResponseContext {
  /**
   * HTTP response status code.
   *
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
   */
  status: number;

  /**
   * Which locale the content is in.
   *
   * The locale value can be retrieved from selected methods using `getLocale()`:
   */
  locale: string | undefined;

  /**
   * HTTP response headers.
   *
   * https://developer.mozilla.org/en-US/docs/Glossary/Response_header
   */
  readonly headers: Headers;

  /**
   * URL to redirect to. When called, the response will immediately
   * end with the correct redirect status and headers.
   * Defaults to use the `307` response status code, but can be
   * overridden by setting the `status` argument.
   *
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Redirections
   */
  readonly redirect: (url: string, status?: number) => RedirectResponse;

  /**
   * When called, the response will immediately end with the given
   * status code. This could be useful to end a response with `404`,
   * and use the 404 handler in the routes directory.
   * See https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
   * for which status code should be used.
   */
  readonly error: (status: number) => ErrorResponse;

  /**
   * Convenience method to send an HTML body response. The response will be automatically JSON
   * stringify the data and set the `Content-Type` header to
   * `text/html; charset=utf-8`. A send response can only be called once.
   */
  readonly html: (html: string) => void;

  /**
   * Convenience method to send a JSON body response. The response will be automatically
   * set the `Content-Type` header to `application/json; charset=utf-8`.
   * A send response can only be called once.
   */
  readonly json: (data: any) => void;

  /**
   * Send a body response. The `Content-Type` response header is not automatically set
   * when using `send()` and must be set manually. A send response can only be called once.
   */
  readonly send: (data: any) => void;
}

/**
 * @alpha
 */
export interface RequestEvent<PLATFORM = unknown> extends RequestEventBase<PLATFORM> {
  readonly next: () => Promise<void>;
  readonly abort: () => void;
}

export interface GetData {
  <T>(loader: ServerLoader<T>): Promise<T>;
  <T>(loader: ServerAction<T>): Promise<T | undefined>;
}

export interface GetSyncData {
  <T>(loader: ServerLoader<T>): T;
  <T>(loader: ServerAction<T>): T | undefined;
}

/**
 * @alpha
 */
export interface RequestEventLoader<PLATFORM = unknown> extends RequestEventBase<PLATFORM> {
  getData: GetData;
}

/**
 * @alpha
 */
export interface RequestEventBase<PLATFORM> {
  readonly request: RequestContext;
  readonly response: ResponseContext;
  readonly url: URL;

  /**
   * URL path params which have been parsed from the current url pathname segments.
   * Use `query` to instead retrieve the query string search params.
   */
  readonly params: Record<string, string>;

  /**
   * URL Query Strings (URL Search Params).
   * Use `params` to instead retrieve the route params found in the url pathname.
   */
  readonly query: URLSearchParams;

  /** Platform specific data and functions */
  readonly platform: PLATFORM;

  readonly cookie: Cookie;
}

/**
 * @alpha
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * @alpha
 */
export type RequestHandler<PLATFORM = unknown> = (ev: RequestEvent<PLATFORM>) => void;

/**
 * @alpha
 * @deprecated Please use `RequestHandler` instead.
 */
export type EndpointHandler<BODY = unknown> = RequestHandler<BODY>;

export type RequestHandlerBody<BODY> = BODY | string | number | boolean | undefined | null | void;

export type RequestHandlerBodyFunction<BODY> = () =>
  | RequestHandlerBody<BODY>
  | Promise<RequestHandlerBody<BODY>>;

// export type RequestHandlerResult<BODY> =
//   | (RequestHandlerBody<BODY> | RequestHandlerBodyFunction<BODY>)
//   | Promise<RequestHandlerBody<BODY> | RequestHandlerBodyFunction<BODY>>;

export interface EndpointResponse {
  status: number;
  loaders: Record<string, Promise<any>>;
}

export interface ClientPageData extends Omit<EndpointResponse, 'status' | 'body'> {
  status?: number;
  prefetch?: string[];
  redirect?: string;
  isStatic: boolean;
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
  mode: QwikCityMode;
  params: PathParams;
  response: EndpointResponse;
}

export type QwikCityMode = 'dev' | 'static' | 'server';

export interface SimpleURL {
  origin: string;
  href: string;
  pathname: string;
  search: string;
  hash: string;
}

export { Cookie, CookieOptions, CookieValue };
