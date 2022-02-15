export interface PageOptions {
  pathname: string;
}

export interface Page {
  id: string;
  pathname: string;
  title: string;
  getContent: () => Promise<Content | null>;
  getLayout: () => Promise<Layout | null>;
  getMetadata: () => Promise<{ [attrName: string]: any }>;
}

export type PageData = [
  /** id */
  type: string,
  /** pathname */
  type: string,
  /** title */
  type: string,
  /** getContent */
  type: () => Promise<Content | null>,
  /** getLayout */
  type: () => Promise<Content | null>,
  /** getContentModule */
  type: Promise<any> | undefined,
  /** getLayoutModule */
  type: Promise<any> | undefined
];

export type Content = any;

export type Layout = any;

export interface NavItem {
  title: string;
  href?: string;
  children?: NavItem[];
}

export interface NavOptions {
  category?: string;
}

export declare function getPage(opts: PageOptions): Promise<Page | null>;

export declare function getNavItems(opts: NavOptions | undefined): Promise<NavItem[]>;
