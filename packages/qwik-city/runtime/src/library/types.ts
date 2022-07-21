import type { RenderDocument } from '../../../../qwik/src/server/types';
import type { ROUTE_TYPE_ENDPOINT } from './constants';

export interface EndpointModule<BODY = unknown> {
  onDelete?: EndpointHandler<BODY>;
  onGet?: EndpointHandler<BODY>;
  onHead?: EndpointHandler<BODY>;
  onOptions?: EndpointHandler<BODY>;
  onPatch?: EndpointHandler<BODY>;
  onPost?: EndpointHandler<BODY>;
  onPut?: EndpointHandler<BODY>;
  onRequest?: EndpointHandler<BODY>;
}

export interface PageModule extends EndpointModule {
  readonly default: any;
  readonly head?: ContentModuleHead;
  readonly headings?: ContentHeading[];
}

export interface LayoutModule extends EndpointModule {
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
}

export interface RouteNavigate {
  pathname: string;
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
  data: T | null;
  head: ResolvedDocumentHead;
}

/**
 * @public
 */
export type DocumentHead<T = unknown> =
  | DocumentHeadValue
  | ((props: DocumentHeadProps<T>) => DocumentHeadValue);

export interface ContentStateInternal {
  contents: ContentModule[];
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
export type EndpointModuleLoader = () => Promise<EndpointModule>;
export type MenuModuleLoader = () => Promise<MenuModule>;
export type ModuleLoader = ContentModuleLoader | EndpointModuleLoader;

/**
 * @public
 */
export type RouteData =
  | [pattern: RegExp, pageLoaders: ContentModuleLoader[]]
  | [pattern: RegExp, pageLoaders: ContentModuleLoader[], paramNames: string[]]
  | [
      pattern: RegExp,
      endpointLoaders: EndpointModuleLoader[],
      paramNames: string[],
      routeType: typeof ROUTE_TYPE_ENDPOINT
    ];

export type MenuData = [pathname: string, menuLoader: MenuModuleLoader];

/**
 * @public
 */
export interface QwikCityPlan {
  routes: RouteData[];
  menus?: MenuData[];
  trailingSlash?: boolean;
  cacheModules?: boolean;
}

/**
 * @public
 */
export type RouteParams = Record<string, string>;

export interface MatchedRoute {
  loaders: ModuleLoader[];
  params: RouteParams;
}

export interface LoadedRoute extends MatchedRoute {
  contents: ContentModule[];
  menu: ContentMenu | undefined;
}

export interface LoadedContent extends LoadedRoute {
  pageModule: PageModule;
}

export type ContentModule = PageModule | LayoutModule;

export type ContentModuleHead = DocumentHead | ResolvedDocumentHead;

/**
 * @public
 */
export interface RequestEvent {
  request: Request;
  params: RouteParams;
  url: URL;
}

/**
 * @public
 */
export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS'
  | 'CONNECT'
  | 'TRACE';

/**
 * @public
 */
export type EndpointHandler<BODY = unknown> = (
  ev: RequestEvent
) => EndpointResponse<BODY> | undefined | null | Promise<EndpointResponse<BODY> | undefined | null>;

export interface EndpointResponse<BODY = unknown> {
  body?: BODY | null | undefined;
  /**
   * HTTP Headers. The "Content-Type" header is used to determine how to serialize the `body` for the
   * HTTP Response.  For example, a "Content-Type" including `application/json` will serialize the `body`
   * with `JSON.stringify(body)`. If the "Content-Type" header is not provided, the response
   * will default to include the header `"Content-Type": "application/json; charset=utf-8"`.
   */
  headers?: Record<string, string | undefined>;

  /**
   * HTTP Status code. The status code is import to determine if the data can be public
   * facing or not. Setting a value of `200` will allow the endpoint to be fetched using
   * an `"accept": "application/json"` request header. If the data from the API
   * should not allowed to be requested, the status should be set to one of the Client Error
   * response status codes. An example would be `401` for "Unauthorized", or `403` for
   * "Forbidden".
   *
   * https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
   */
  status?: number;

  /**
   * URL to redirect to. The `redirect` property is for convenience rather
   * than manually setting the redirect status code and the `location` header.
   * Defaults to use the `307` response status code, but can be overwritten
   * by manually setting the `status` property.
   */
  redirect?: string;
}

export interface NormalizedEndpointResponse {
  body: any;
  headers: Record<string, string>;
  status: number;
}

export interface QwikCityRenderDocument extends RenderDocument {
  _qwikUserCtx?: QwikCityUserContext;
}

export interface QwikCityUserContext {
  qcRoute: MutableRouteLocation;
  qcRequest: {
    method: HttpMethod;
  };
  qcResponse: NormalizedEndpointResponse | null;
}
