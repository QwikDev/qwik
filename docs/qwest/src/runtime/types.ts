/**
 * @public
 */
export interface PageHandler {
  getContent: () => Content | null;
  getLayout: () => Layout | null;
  getAttributes: () => PageAttributes;
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
export interface LoadPageOptions {
  pathname: string;
}

/**
 * @public
 */
export interface LoadIndexOptions {
  pathname: string;
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
export interface PageHeading {
  text: string;
  id: string;
  level: number;
}
