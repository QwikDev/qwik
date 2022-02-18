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

export interface LoadPageOptions {
  pathname: string;
}

export interface LoadIndexOptions {
  pathname: string;
}

export interface PageIndex {
  text: string;
  href?: string;
  items?: PageIndex[];
}

export declare function loadPage(opts: LoadIndexOptions): Promise<PageHandler | null>;

export declare function loadIndex(opts: LoadIndexOptions): Promise<PageIndex | null>;
