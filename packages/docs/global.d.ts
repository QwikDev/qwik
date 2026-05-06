// handled by raw-source plugin in vite.repl-apps.ts
declare module '*?raw-source' {
  const url: string;
  export default url;
}

declare module '*?compiled-string' {
  const str: string;
  export default str;
}

declare module '/pagefind/pagefind.js' {
  export function options(options: { bundlePath?: string }): Promise<void>;
  export function init(): Promise<void>;
  export function debouncedSearch(
    term: string,
    options?: unknown,
    debounceTimeoutMs?: number
  ): Promise<{
    results: {
      data: () => Promise<{
        url: string;
        excerpt?: string | null;
        meta?: {
          title?: string | null;
        };
        sub_results?: {
          title?: string | null;
          url: string;
          excerpt?: string | null;
        }[];
      }>;
    }[];
  } | null>;
}
