import { describe, expect, it } from 'vitest';
import { StreamHandler } from './ssr-stream-handler';
import type { RenderToStreamOptions, StreamWriter } from './types';

const createDeferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe('StreamHandler', () => {
  it('should clear pendingFlush after a queued synchronous flush completes', async () => {
    const firstWrite = createDeferred();
    const chunks: string[] = [];
    let writeCount = 0;
    const stream: StreamWriter = {
      write(chunk) {
        chunks.push(chunk);
        writeCount++;
        if (writeCount === 1) {
          return firstWrite.promise;
        }
      },
    };
    const handler = new StreamHandler(
      {
        stream,
        streaming: {
          inOrder: {
            strategy: 'disabled',
          },
        },
      } as RenderToStreamOptions,
      {
        firstFlush: 0,
        render: 0,
        snapshot: 0,
      }
    );

    handler.stream.write('a');
    const firstFlush = handler.flush();
    expect(firstFlush).toBeInstanceOf(Promise);
    expect(handler.waitForPendingFlush()).toBe(firstFlush);

    handler.stream.write('b');
    const queuedFlush = handler.flush();
    expect(queuedFlush).toBeInstanceOf(Promise);

    firstWrite.resolve();
    await queuedFlush;

    expect(chunks).toEqual(['a', 'b']);
    expect(handler.waitForPendingFlush()).toBeUndefined();

    handler.stream.write('c');
    const thirdFlush = handler.flush();

    expect(thirdFlush).toBeUndefined();
    expect(chunks).toEqual(['a', 'b', 'c']);
    expect(handler.waitForPendingFlush()).toBeUndefined();
  });
});
