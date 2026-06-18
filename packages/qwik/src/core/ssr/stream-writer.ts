import type { SSRInternalStreamWriter, StreamWriter } from './ssr-types';

/** @internal */
export const stringifyRootRefPath = (path: number[]): string => {
  let text = String(path[0]);
  for (let i = 1; i < path.length; i++) {
    text += ' ' + path[i];
  }
  return text;
};

/** @internal */
export const writeStringRootRef = (
  writer: Pick<StreamWriter, 'write'>,
  id: number
): ReturnType<StreamWriter['write']> => writer.write(String(id));

/** @internal */
export const writeStringRootRefPath = (
  writer: Pick<StreamWriter, 'write'>,
  path: number[]
): ReturnType<StreamWriter['write']> => writer.write(stringifyRootRefPath(path));

/** @internal */
export const createStringStreamWriter = (
  write: StreamWriter['write'],
  /**
   * Buffer checkpoint/truncate, supplied by a buffering owner (e.g. the stream handler operating on
   * its stream-block buffer). When omitted, the writer streams straight through and cannot rewind.
   */
  ops?: { checkpoint(): number; truncate(checkpoint: number): void }
): SSRInternalStreamWriter => ({
  write,
  writeRootRef(id) {
    return writeStringRootRef(this, id);
  },
  writeRootRefPath(path) {
    return writeStringRootRefPath(this, path);
  },
  checkpoint() {
    if (!ops) {
      throw new Error('This stream writer does not support checkpoint/truncate.');
    }
    return ops.checkpoint();
  },
  truncate(checkpoint) {
    if (!ops) {
      throw new Error('This stream writer does not support checkpoint/truncate.');
    }
    ops.truncate(checkpoint);
  },
});
