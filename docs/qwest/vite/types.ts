export interface ParsedData {
  pages: ParsedPage[];
  indexes: ParsedIndex[];
}

export interface ParsedIndex {
  pathname: string;
  filePath: string;
  title: string;
  items: ParsedIndexItem[];
}

export interface ParsedIndexItem {
  text: string;
  href?: string;
  items?: ParsedIndexItem[];
}

export interface ParsedPage {
  pathname: string;
  title: string;
  filePath: string;
}

export interface PageAttributes {
  title?: string;
  layout?: string;
  permalink?: string;
}

export interface NormalizedPluginOptions extends PluginOptions {
  extensions: string[];
}

export interface PluginOptions {
  layouts: {
    [layoutName: string]: string;
    default: string;
  };
  pagesDir: string;
  /**
   * File extensions to parse. Defaults to `['.md', '.mdx']`.
   */
  extensions?: string[];
  /**
   * Ensure a trailing slash ends page urls. Defaults to `false`.
   */
  trailingSlash?: boolean;
}
