export interface ParsedPage {
  id: string;
  pathname: string;
  title: string;
  layout: string;
  filePath: string;
}

export interface PageAttributes {
  title?: string;
  layout?: string;
  pathname?: string;
  id?: string;
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
}
