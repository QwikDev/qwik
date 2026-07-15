import type { ValueOrPromise } from '../utils/types';

export type SsrWriteChunk = string | number | { readonly path: number[] };

export interface SerdesWriter {
  write(chunk: string): ValueOrPromise<void>;
  writeRootRef(id: number): ValueOrPromise<void>;
  writeRootRefPath(path: number[]): ValueOrPromise<void>;
  toString(remap?: number[]): string;
}

export const createStringSerdesWriter = (
  write: (chunk: string) => ValueOrPromise<void>
): SerdesWriter => ({
  write,
  writeRootRef(id) {
    return write(String(id));
  },
  writeRootRefPath(path) {
    return write(path.join(' '));
  },
  toString() {
    return '';
  },
});
