import type { FunctionComponent, HTMLAttributes } from '@builder.io/qwik';
import type { ROUTE_TYPE_ENDPOINT } from './constants';

/**
 * @public
 */
export interface QwikCityOptions {
  routes: RouteData[];
}

/**
 * @public
 */
export interface QwikCity {
  readonly Head: FunctionComponent<HTMLAttributes<HTMLHeadElement>>;
  readonly Content: FunctionComponent<{}>;
  readonly page: Page;
  readonly route: Route;
}

/**
 * @public
 */
export interface Page {
  readonly breadcrumbs: PageBreadcrumb[];
  readonly head: PageHead;
  readonly headings: PageHeading[];
  readonly menu: { path: string };
}

export interface PageModule {
  readonly breadcrumbs: PageBreadcrumb[];
  readonly default: any;
  readonly head: PageHead | PageHeadFunction;
  readonly headings: PageHeading[];
  readonly menu: { path: string };
}

export interface LayoutModule {
  readonly default: any;
}

/**
 * @public
 */
export interface Route {
  pathname: string;
  readonly params: RouteParams;
  readonly href: string;
  readonly search: string;
  readonly hash: string;
  readonly origin: string;
}

/**
 * @public
 */
export interface EndpointModule {
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
export interface PageHead {
  title?: string;
  meta?: HeadMeta;
  links?: HeadLink[];
  styles?: HeadStyle[];
}

export interface PageHeadFunctionOptions {
  route: Route;
}

/**
 * @public
 */
export type PageHeadFunction = (opts: PageHeadFunctionOptions) => Promise<PageHead> | PageHead;

/**
 * @public
 */
export type HeadMeta = Record<string, string | boolean | number>;

/**
 * @public
 */
export interface HeadLink {
  as?: string;
  crossorigin?: string;
  disabled?: boolean;
  href?: string;
  hreflang?: string;
  imagesizes?: string;
  imagesrcset?: string;
  integrity?: string;
  key?: string;
  media?: string;
  prefetch?: string;
  referrerpolicy?: string;
  rel?: string;
  sizes?: string;
  title?: string;
  type?: string;
}

/**
 * @public
 */
export interface HeadStyle {
  style: string;
  key?: string;
  attributes?: { [attrName: string]: string };
}

/**
 * @public
 */
export interface PageAttributes {
  [pageAttribute: string]: string | undefined;
}

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
export interface Layout {}

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
  | [pattern: RegExp, pageLoader: (() => Promise<PageModule | LayoutModule>)[]]
  | [
      pattern: RegExp,
      pageLoader: (() => Promise<PageModule | LayoutModule>)[],
      paramNames: string[]
    ]
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
