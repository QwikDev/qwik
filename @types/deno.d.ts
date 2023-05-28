declare module 'https://deno.land/std/path/mod.ts' {
  export function extname(paths: string): string;
  export function fromFileUrl(url: string): string;
  export function join(...paths: string[]): string;
}

declare const Deno: {
  env: any;
  readTextFile(path: string): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
  version: {
    deno: string;
  };
};
