export interface PageHandler {
  getContent: () => Content | null;
  getLayout: () => Layout | null;
  getMetadata: () => { [attrName: string]: string };
}

export type Content = any;
export type Layout = any;

export interface LoadPageOptions {
  pathname: string;
}

export interface LoadIndexOptions {
  pathname: string;
}

export interface IndexItem {
  text: string;
  href?: string;
  items?: IndexItem[];
}

export declare function loadPage(opts: LoadIndexOptions): Promise<PageHandler | null>;

export declare function loadIndex(opts: LoadIndexOptions): Promise<IndexItem | null>;
