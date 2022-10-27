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
export interface DocumentHeadProps<T = unknown> extends RouteLocation {
  data: T;
  head: ResolvedDocumentHead;
}

/**
 * @alpha
 */
export type DocumentHead<T = unknown> =
  | DocumentHeadValue
  | ((props: DocumentHeadProps<GetEndpointData<T>>) => DocumentHeadValue);

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

export type FallbackRouteData =
  | [pattern: RegExp, loaders: ModuleLoader[]]
  | [pattern: RegExp, loaders: ModuleLoader[], paramNames: string[]];

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
 */
export type RouteParams = Record<string, string>;

export type ContentModule = PageModule | LayoutModule;

export type ContentModuleHead = DocumentHead | ResolvedDocumentHead;

export type LoadedRoute = [
  params: RouteParams,
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
 * @alpha
 */
export interface RequestEvent<PLATFORM = unknown> {
  request: RequestContext;
  response: ResponseContext;
  url: URL;

  /** URL Route params which have been parsed from the current url pathname. */
  params: RouteParams;

  /** Platform specific data and functions */
  platform: PLATFORM;

  next: () => Promise<void>;
  abort: () => void;
}

/**
 * @alpha
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/**
 * @alpha
 */
export type RequestHandler<BODY = unknown, PLATFORM = unknown> = (
  ev: RequestEvent<PLATFORM>
) => RequestHandlerResult<BODY>;

/**
 * @alpha
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

export interface ClientPageData extends Omit<EndpointResponse, 'status'> {
  status?: number;
  prefetch?: string[];
  redirect?: string;
  isStatic: boolean;
}

/**
 * @alpha
 */
export type StaticGenerateHandler = () => Promise<StaticGenerate> | StaticGenerate;

export interface StaticGenerate {
  params?: RouteParams[];
}

export interface QwikCityRenderDocument extends Document {}

export interface QwikCityEnvData {
  params: RouteParams;
  response: EndpointResponse;
}

export type GetEndpointData<T> = T extends RequestHandler<infer U> ? U : T;

export interface SimpleURL {
  origin: string;
  href: string;
  pathname: string;
  search: string;
  hash: string;
}
