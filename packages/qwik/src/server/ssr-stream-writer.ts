import type { SSRInternalStreamWriter, SSRSegmentWriteChunk } from './qwik-types';
export {
  createStringStreamWriter,
  stringifyRootRefPath,
  writeStringRootRef,
  writeStringRootRefDelta,
  writeStringRootRefPath,
} from './qwik-copy';
import { writeStringRootRef, writeStringRootRefDelta, writeStringRootRefPath } from './qwik-copy';

export const renderSSRChunks = (chunks: SSRSegmentWriteChunk[], remap?: number[]): string => {
  let out = '';
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (typeof chunk === 'string') {
      out += chunk;
    } else if (chunk.type === 'root-ref-delta') {
      const id = remap ? (remap[chunk.localId] ?? chunk.localId) : chunk.localId;
      const base = remap ? (remap[chunk.localBaseId] ?? chunk.localBaseId) : chunk.localBaseId;
      out += String(id - base);
    } else {
      const localId = chunk.type === 'root-ref' ? chunk.localId : chunk.localPath[0];
      out += String(remap ? (remap[localId] ?? localId) : localId);
      if (chunk.type !== 'root-ref-path') {
        continue;
      }
      const path = chunk.localPath;
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
  writeRootRefDelta(id: number, base: number): void {
    writeStringRootRefDelta(this, id, base);
  }
  clear() {
    this.buffer.length = 0;
  }
  toString(_?: number[]) {
    return this.buffer.join('');
  }
}

export class StringBufferSegmentWriter implements SSRInternalStreamWriter {
  private chunks: SSRSegmentWriteChunk[] = [];
  write(text: string) {
    this.chunks.push(text);
  }
  writeRootRef(id: number): void {
    this.chunks.push({ type: 'root-ref', localId: id });
  }
  writeRootRefPath(path: number[]): void {
    this.chunks.push({ type: 'root-ref-path', localPath: path });
  }
  writeRootRefDelta(id: number, base: number): void {
    this.chunks.push({ type: 'root-ref-delta', localId: id, localBaseId: base });
  }
  clear() {
    this.chunks.length = 0;
  }

  extract(): SSRSegmentWriteChunk[] {
    const chunks = this.chunks;
    this.chunks = [];
    return chunks;
  }

  toString(remap?: number[]) {
    return renderSSRChunks(this.chunks, remap);
  }
}
