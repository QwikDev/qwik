import type { FunctionComponent } from '@builder.io/qwik';
import type { ROUTE_TYPE_ENDPOINT } from './constants';

export interface PageModule {
  readonly default: any;
  readonly breadcrumbs?: ContentBreadcrumb[];
  readonly head?: ContentModuleHead;
  readonly headings?: ContentHeading[];
}

export interface LayoutModule {
  readonly default: any;
  readonly head?: ContentModuleHead;
}

/**
 * @public
 */
export interface RouteLocation {
  hash: string;
  host: string;
  hostname: string;
  href: string;
  origin: string;
  params: RouteParams;
  pathname: string;
  port: string;
  protocol: string;
  search: string;
  query: Record<string, string>;
}

/**
 * @public
 */
export interface EndpointModule {
  all?: EndpointHandler;
  del?: EndpointHandler;
  get?: EndpointHandler;
  head?: EndpointHandler;
  options?: EndpointHandler;
  patch?: EndpointHandler;
  post?: EndpointHandler;
  put?: EndpointHandler;
}

/**
 * @public
 */
export interface DocumentHead {
  title: string;
  meta: DocumentMeta[];
  links: DocumentLink[];
  styles: DocumentStyle[];
}

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
export interface HeadComponentProps {
  resolved: DocumentHead;
  location: RouteLocation;
}

/**
 * @public
 */
export type HeadComponent = FunctionComponent<HeadComponentProps>;

/**
 * @public
 */
export interface ContentBreadcrumb {
  text: string;
  href?: string;
}

export interface ContentState {
  breadcrumbs: ContentBreadcrumb[] | undefined;
  headings: ContentHeading[] | undefined;
  modules: ContentModule[];
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

/**
 * @public
 */
export interface QwikCityPlan {
  routes: RouteData[];
  menus?: { [pathName: string]: ContentMenu };
  trailingSlash?: boolean;
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
  modules: ContentModule[];
}

export interface LoadedContent extends LoadedRoute {
  pageModule: PageModule;
}

export type ContentModule = PageModule | LayoutModule;

export type ContentModuleHead = HeadComponent | DocumentHead;

/**
 * @public
 */
export interface RequestEvent {
  method: string;
  request: Request;
  params: RouteParams;
  url: URL;
}

/**
 * @public
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * @public
 */
export type EndpointHandler = (ev: RequestEvent) => Response | Promise<Response>;
