/**
 * @public
 */
export interface PageHandler {
  readonly head: PageHead | PageHeadFunction;
  readonly attributes: PageAttributes;
  readonly breadcrumbs: PageBreadcrumb[];
  readonly content: Content;
  readonly headings: PageHeading[];
  readonly index: { path: string };
  readonly layout: Layout;
  readonly source: PageSource;
  readonly url: URL;
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

/**
 * @public
 */
export type PageHeadFunction = () => Promise<PageHead> | PageHead;

/**
 * @public
 */
export interface HeadMeta {
  description?: string;
  keywords?: string;
  [name: string]: Content;
}

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
export interface PageSource {
  path: string;
}

/**
 * @public
 */
export type Content = any;

/**
 * @public
 */
export type Layout = any;

/**
 * @public
 */
export interface PageIndex {
  text: string;
  href?: string;
  items?: PageIndex[];
}

/**
 * @public
 */
export interface PageHeading {
  text: string;
  id: string;
  level: number;
}
