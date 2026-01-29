declare module 'https://deno.land/std/path/mod.ts' {
  export function extname(paths: string): string;
  export function fromFileUrl(url: string): string;
  export function join(...paths: string[]): string;
}

interface FsFile {
  readable: ReadableStream<Uint8Array>;
}
declare const Deno: {
  env: any;
  open(path: string, mode: { read: boolean }): Promise<FsFile>;
  readTextFile(path: string): Promise<string>;
  readFile(path: string): Promise<Uint8Array>;
  version: {
    deno: string;
  };
};
