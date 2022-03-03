export interface PageHandler {
  getContent: () => Content | null;
  getLayout: () => Layout | null;
  getMetadata: () => PageMetadata;
}

export interface PageMetadata {
  title: string;
  description: string;
  [pageAttribute: string]: string;
}

export type Content = any;
export type Layout = any;

export interface PageIndex {
  text: string;
  href?: string;
  items?: PageIndex[];
}

export interface LoadPageOptions {
  pathname: string;
}

export interface LoadIndexOptions {
  pathname: string;
}

export interface MetaOptions {
  title?: string;
  description?: string;
  keywords?: string;
  [name: string]: content;
}

export interface HeadMeta {
  title?: string;
  description?: string;
  keywords?: string;
  [name: string]: content;
}

export type HeadLinks = HeadLinkAttributes[];

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

export declare function loadPage(opts: LoadIndexOptions): Promise<PageHandler | null>;

export declare function loadIndex(opts: LoadIndexOptions): Promise<PageIndex | null>;

export declare function setHeadMeta(meta: HeadMeta): void;

export declare function setHeadLinks(links: HeadLinks): void;
