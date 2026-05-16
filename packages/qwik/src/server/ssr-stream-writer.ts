import type { SSRInternalStreamWriter, SSRWriteChunk } from './qwik-types';
export {
  createStringStreamWriter,
  stringifyRootRefPath,
  writeStringRootRef,
  writeStringRootRefPath,
} from './qwik-copy';
import { writeStringRootRef, writeStringRootRefPath } from './qwik-copy';

export const renderSSRChunks = (chunks: SSRWriteChunk[], remap?: number[]): string => {
  let out = '';
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (typeof chunk === 'string') {
      out += chunk;
    } else if (typeof chunk === 'number') {
      out += String(remap ? remap[chunk] : chunk);
    } else {
      const path = chunk.path;
      out += String(remap ? remap[path[0]] : path[0]);
      for (let j = 1; j < path.length; j++) {
        out += ' ' + path[j];
      }
    }
  }
  return out;
};

export class StringSSRWriter implements SSRInternalStreamWriter {
  private buffer = [] as string[];
  write(text: string) {
    this.buffer.push(text);
  }
  writeRootRef(id: number): void {
    writeStringRootRef(this, id);
  }
  writeRootRefPath(path: number[]): void {
    writeStringRootRefPath(this, path);
  }
  clear() {
    this.buffer.length = 0;
  }
  toString(_?: number[]) {
    return this.buffer.join('');
  }
}

export class StringBufferSegmentWriter implements SSRInternalStreamWriter {
  private chunks: SSRWriteChunk[] = [];
  write(text: string) {
    this.chunks.push(text);
  }
  writeRootRef(id: number): void {
    this.chunks.push(id);
  }
  writeRootRefPath(path: number[]): void {
    this.chunks.push({ path });
  }
  clear() {
    this.chunks.length = 0;
  }

  extract(): SSRWriteChunk[] {
    const chunks = this.chunks;
    this.chunks = [];
    return chunks;
  }

  toString(remap?: number[]) {
    return renderSSRChunks(this.chunks, remap);
  }
}
