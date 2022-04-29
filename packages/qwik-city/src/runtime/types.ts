/**
 * @public
 */
export interface PageHandler {
  attributes: PageAttributes;
  breadcrumbs: PageBreadcrumb[];
  content: Content;
  headings: PageHeading[];
  index: { path: string };
  layout: Layout;
  source: PageSource;
  url: URL;
}

/**
 * @public
 */
export interface PageAttributes {
  title?: string;
  description?: string;
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
export interface MetaOptions {
  title?: string;
  description?: string;
  keywords?: string;
  [name: string]: Content;
}

export interface HeadMeta {
  title?: string;
  description?: string;
  keywords?: string;
  [name: string]: Content;
}

/**
 * @public
 */
export type HeadLinks = HeadLinkAttributes[];

/**
 * @public
 */
export interface HeadLinkAttributes {
  as?: string;
  crossorigin?: string;
  disabled?: boolean;
  href?: string;
  hreflang?: string;
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
}

/**
 * @public
 */
export type HeadStyles = HeadStyle[];

/**
 * @public
 */
export interface HeadStyle {
  style: string;
  uniqueId?: string;
  attributes?: { [attrName: string]: string };
}

/**
 * @public
 */
export interface PageHeading {
  text: string;
  id: string;
  level: number;
}
