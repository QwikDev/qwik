import type { FunctionComponent } from '@builder.io/qwik';
import type { ROUTE_TYPE_ENDPOINT } from './constants';

/**
 * @public
 */
export interface QwikCityRoot {
  Head: FunctionComponent<{}>;
  Content: FunctionComponent<{}>;
  resolveHead: () => DocumentHead;
}

/**
 * @public
 */
export interface Page {
  // readonly breadcrumbs?: PageBreadcrumb[];
  // readonly headings?: PageHeading[];
  // readonly menu?: { path: string };
  // readonly head: ContentModuleHead;
}

export interface PageModule {
  readonly default: any;
  readonly breadcrumbs?: PageBreadcrumb[];
  readonly head?: ContentModuleHead;
  readonly headings?: PageHeading[];
  readonly menu?: { path: string };
}

export interface LayoutModule {
  readonly default: any;
  readonly head?: ContentModuleHead;
}

/**
 * @public
 */
export interface Route {
  pathname: string;
  readonly params: RouteParams;
}

/**
 * @public
 */
export interface EndpointModule {
  readonly all?: EndpointHandler;
  readonly del?: EndpointHandler;
  readonly get?: EndpointHandler;
  readonly head?: EndpointHandler;
  readonly options?: EndpointHandler;
  readonly patch?: EndpointHandler;
  readonly post?: EndpointHandler;
  readonly put?: EndpointHandler;
  readonly default?: any;
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
  attributes?: { [attrName: string]: string };
  key?: string;
}
/**
 * @public
 */
export interface HeadComponentProps {
  resolved: DocumentHead;
  page: Page;
  route: Route;
}

/**
 * @public
 */
export type HeadComponent = FunctionComponent<HeadComponentProps>;

/**
 * @public
 */
export interface PageBreadcrumb {
  text: string;
  href?: string;
}

/**
 * @public
 */
export interface Menu {
  text: string;
  href?: string;
  items?: Menu[];
}

/**
 * @public
 */
export interface PageHeading {
  text: string;
  id: string;
  level: number;
}

/**
 * @public
 */
export type RouteData =
  | [pattern: RegExp, pageLoader: (() => Promise<ContentModule>)[]]
  | [pattern: RegExp, pageLoader: (() => Promise<ContentModule>)[], paramNames: string[]]
  | [
      pattern: RegExp,
      endpointLoader: (() => Promise<EndpointModule>)[],
      paramNames: string[],
      routeType: typeof ROUTE_TYPE_ENDPOINT
    ];

/**
 * @public
 */
export type RouteParams = Record<string, string>;

export interface MatchedRoute {
  route: RouteData;
  params: RouteParams;
  pathname: string;
}

export interface LoadedRoute extends MatchedRoute {
  modules: ContentModule[];
}

export interface LoadedContent extends LoadedRoute {
  pageModule: PageModule;
  page: Page;
}

export type ContentModule = PageModule | LayoutModule;

export type ContentModuleHead = HeadComponent | DocumentHead;

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
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * @public
 */
export type EndpointHandler = (ev: RequestEvent) => Response | Promise<Response>;

export interface QwikCityState {
  modules: ContentModule[];
  page: Page;
  head: DocumentHead;
  route: Route;
}
