import type { ErrorResponse } from '../../../middleware/request-handler/error-handler';
import type { RedirectResponse } from '../../../middleware/request-handler/redirect-handler';
import type { NoSerialize } from '@builder.io/qwik';

export interface RouteModule<BODY = unknown> {
  onDelete?: RequestHandler<BODY>;
  onGet?: RequestHandler<BODY>;
  onHead?: RequestHandler<BODY>;
  onOptions?: RequestHandler<BODY>;
  onPatch?: RequestHandler<BODY>;
  onPost?: RequestHandler<BODY>;
  onPut?: RequestHandler<BODY>;
  onRequest?: RequestHandler<BODY>;
}

export interface PageModule extends RouteModule {
  readonly default: any;
  readonly head?: ContentModuleHead;
  readonly headings?: ContentHeading[];
}

export interface LayoutModule extends RouteModule {
  readonly default: any;
  readonly head?: ContentModuleHead;
}

export interface MenuModule {
  readonly default: ContentMenu;
}

/**
 * @public
 */
export interface RouteLocation {
  readonly params: RouteParams;
  readonly href: string;
  readonly pathname: string;
  readonly query: Record<string, string>;
}

export interface RouteNavigate {
  path: string;
}

export type MutableRouteLocation = Mutable<RouteLocation>;

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * @public
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
}

/**
 * @public
 */
export type ResolvedDocumentHead = Required<DocumentHeadValue>;

/**
 * @public
 */
export interface DocumentMeta {
  content?: string;
  httpEquiv?: string;
  name?: string;
  property?: string;
  key?: string;
}

/**
 * @public
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
 * @public
 */
export interface DocumentStyle {
  style: string;
  props?: { [propName: string]: string };
  key?: string;
}

/**
 * @public
 */
export interface DocumentHeadProps<T = unknown> extends RouteLocation {
  data: T;
  head: ResolvedDocumentHead;
}

/**
 * @public
 */
export type DocumentHead<T = unknown> =
  | DocumentHeadValue
  | ((props: DocumentHeadProps<T>) => DocumentHeadValue);

export interface ContentStateInternal {
  contents: NoSerialize<ContentModule[]>;
}

export interface ContentState {
  headings: ContentHeading[] | undefined;
  menu: ContentMenu | undefined;
}

/**
 * @public
 */
export interface ContentMenu {
  text: string;
  href?: string;
  items?: ContentMenu[];
}

/**
 * @public
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
 * @public
 */
export type RouteData =
  | [pattern: RegExp, loaders: ModuleLoader[]]
  | [pattern: RegExp, loaders: ModuleLoader[], paramNames: string[]];

export type FallbackRouteData =
  | [pattern: RegExp, loaders: ModuleLoader[]]
  | [pattern: RegExp, loaders: ModuleLoader[], paramNames: string[]];

export type MenuData = [pathname: string, menuLoader: MenuModuleLoader];

/**
 * @public
 */
export interface QwikCityPlan {
  routes?: RouteData[];
  fallbackRoutes?: FallbackRouteData[];
  menus?: MenuData[];
  trailingSlash?: boolean;
  cacheModules?: boolean;
}

/**
 * @public
 */
export type RouteParams = Record<string, string>;

export type ContentModule = PageModule | LayoutModule;

export type ContentModuleHead = DocumentHead | ResolvedDocumentHead;

export interface LoadedRoute {
  params: RouteParams;
  mods: (RouteModule | ContentModule)[];
  menu: ContentMenu | undefined;
}

export interface LoadedContent extends LoadedRoute {
  pageModule: PageModule;
}

/**
 * @public
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
 * @public
 */
export interface ResponseContext {
  /**
   * HTTP response status code.
   *
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
   */
  status: number;

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
}

/**
 * @public
 */
export interface RequestEvent {
  request: RequestContext;
  response: ResponseContext;
  url: URL;

  /** URL Route params which have been parsed from the current url pathname. */
  params: RouteParams;

  next: () => Promise<void>;
  abort: () => void;
}

/**
 * @public
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * @public
 */
export type RequestHandler<BODY = unknown> = (ev: RequestEvent) => RequestHandlerResult<BODY>;

/**
 * @public
 * @deprecated Please use `RequestHandler` instead.
 */
export type EndpointHandler<BODY = unknown> = RequestHandler<BODY>;

export type RequestHandlerBody<BODY> = BODY | string | number | boolean | undefined | null | void;

export type RequestHandlerBodyFunction<BODY> = () =>
  | RequestHandlerBody<BODY>
  | Promise<RequestHandlerBody<BODY>>;

export type RequestHandlerResult<BODY> =
  | (RequestHandlerBody<BODY> | RequestHandlerBodyFunction<BODY>)
  | Promise<RequestHandlerBody<BODY> | RequestHandlerBodyFunction<BODY>>;

export interface EndpointResponse {
  body: any;
  status: number;
}

export interface QwikCityRenderDocument extends Document {}

export interface QwikCityEnvData {
  route: MutableRouteLocation;
  response: EndpointResponse;
}
