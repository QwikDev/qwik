import type { GetSyncData, RequestHandler } from '@builder.io/qwik-city/middleware/request-handler';
import type { NoSerialize, QRL, Signal } from '@builder.io/qwik';

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
  readonly params: Record<string, string>;
  readonly href: string;
  readonly pathname: string;
  readonly query: URLSearchParams;
  readonly isNavigating: boolean;
}

export type RouteNavigate = QRL<(path?: string) => Promise<void>>;

export type RouteAction = Signal<RouteActionValue>;

export type RouteActionResolver = { status: number; result: any };
export type RouteActionValue =
  | {
      id: string;
      data: FormData | undefined;
      output?: RouteActionResolver;
      resolve?: NoSerialize<(data: RouteActionResolver) => void>;
    }
  | undefined;

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

export type ContentStateInternal = NoSerialize<ContentModule[]>;

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
  serverPlugins?: RouteModule[];
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
 * @deprecated Please use `RequestHandler` instead.
 */
export type EndpointHandler<BODY = unknown> = RequestHandler<BODY>;

export type RequestHandlerBody<BODY> = BODY | string | number | boolean | undefined | null | void;

export type RequestHandlerBodyFunction<BODY> = () =>
  | RequestHandlerBody<BODY>
  | Promise<RequestHandlerBody<BODY>>;

export interface EndpointResponse {
  status: number;
  loaders: Record<string, Promise<any>>;
  action?: string;
}

export interface ClientPageData extends Omit<EndpointResponse, 'status'> {
  status: number;
  href: string;
  isStatic?: boolean;
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
}

export interface SimpleURL {
  origin: string;
  href: string;
  pathname: string;
  search: string;
  hash: string;
}
