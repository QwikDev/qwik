import { describe, expect, it } from 'vitest';
import { StreamHandler } from './ssr-stream-handler';
import { StringBufferSegmentWriter, StringSSRWriter } from './ssr-stream-writer';
import type { RenderToStreamOptions } from './types';

describe('SSR buffer checkpoint/truncate', () => {
  it('StringSSRWriter discards back to a checkpoint', () => {
    const w = new StringSSRWriter();
    w.write('keep');
    const cp = w.checkpoint();
    w.write('DISCARD');
    w.truncate(cp);
    w.write('-more');
    expect(w.toString()).toBe('keep-more');
  });

  it('StringBufferSegmentWriter discards back to a checkpoint', () => {
    const w = new StringBufferSegmentWriter();
    w.write('keep');
    const cp = w.checkpoint();
    w.write('DISCARD');
    w.truncate(cp);
    w.write('-more');
    expect(w.toString()).toBe('keep-more');
  });

  const makeHandler = () => {
    const out: string[] = [];
    const opts = {
      stream: {
        write: (chunk: string) => {
          out.push(chunk);
        },
      },
      streaming: { inOrder: { strategy: 'disabled' } },
    } as unknown as RenderToStreamOptions;
    const handler = new StreamHandler(opts, { firstFlush: 0, render: 0, snapshot: 0 });
    return { handler, out };
  };

  it('StreamHandler discards stream-block buffer back to a checkpoint', async () => {
    const { handler, out } = makeHandler();
    handler.streamBlockStart();
    handler.stream.write('keep');
    const cp = handler.stream.checkpoint();
    handler.stream.write('DISCARD');
    handler.stream.truncate(cp);
    handler.stream.write('-more');
    await handler.streamBlockEnd();
    await handler.flush();
    expect(out.join('')).toBe('keep-more');
  });

  it('StreamHandler supports nested checkpoints (inner truncate keeps outer)', async () => {
    const { handler, out } = makeHandler();
    handler.streamBlockStart();
    handler.stream.write('outer-');
    const outerCp = handler.stream.checkpoint();
    handler.stream.write('inner-');
    const innerCp = handler.stream.checkpoint();
    handler.stream.write('DISCARD');
    handler.stream.truncate(innerCp); // drop only the innermost write
    handler.stream.write('end');
    expect(handler.stream.checkpoint()).toBeGreaterThan(outerCp);
    await handler.streamBlockEnd();
    await handler.flush();
    expect(out.join('')).toBe('outer-inner-end');
  });
});
