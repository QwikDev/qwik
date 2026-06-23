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
export const writeStringRootRefDelta = (
  writer: Pick<StreamWriter, 'write'>,
  id: number,
  base: number
): ReturnType<StreamWriter['write']> => writer.write(String(id - base));

/** @internal */
export const createStringStreamWriter = (
  write: StreamWriter['write']
): SSRInternalStreamWriter => ({
  write,
  writeRootRef(id) {
    return writeStringRootRef(this, id);
  },
  writeRootRefPath(path) {
    return writeStringRootRefPath(this, path);
  },
  writeRootRefDelta(id, base) {
    return writeStringRootRefDelta(this, id, base);
  },
});
