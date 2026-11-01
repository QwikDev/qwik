import { describe, expect, it, vi } from 'vitest';
import { StreamHandler } from './ssr-stream-handler';
import type { InOrderStreaming, RenderToStreamOptions, StreamWriter } from './types';

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

  describe('first flush hold', () => {
    const createHeldHandler = (
      inOrder: InOrderStreaming = {
        strategy: 'auto',
        maximumInitialChunk: 10,
        maximumChunk: 10,
      }
    ) => {
      const chunks: string[] = [];
      const handler = new StreamHandler(
        {
          stream: { write: (chunk: string) => void chunks.push(chunk) },
          streaming: { inOrder },
        } as RenderToStreamOptions,
        {
          firstFlush: 0,
          render: 0,
          snapshot: 0,
        }
      );
      handler.holdFirstFlush();
      return { handler, chunks };
    };

    it('a held flush writes nothing', () => {
      const { handler, chunks } = createHeldHandler();

      handler.stream.write('a');
      handler.flush();

      expect(chunks).toEqual([]);
      expect(handler.networkFlushes).toBe(0);
    });

    it('a held flush does not report the first write', () => {
      const { handler } = createHeldHandler();
      const onFirstWrite = vi.fn();
      handler.onFirstWrite = onFirstWrite;

      handler.stream.write('a');
      handler.flush();
      expect(onFirstWrite).not.toHaveBeenCalled();

      handler.releaseFirstFlush();
      handler.flush();
      expect(onFirstWrite).toHaveBeenCalledTimes(1);
    });

    it('the first flush after release writes the whole buffer', () => {
      const { handler, chunks } = createHeldHandler();

      handler.stream.write('a');
      handler.flush();
      handler.stream.write('b');
      handler.releaseFirstFlush();
      expect(chunks).toEqual([]);

      handler.flush();

      expect(chunks).toEqual(['ab']);
      expect(handler.networkFlushes).toBe(1);
    });

    it('a stream block that ends while held stays in the buffer', () => {
      const { handler, chunks } = createHeldHandler();

      handler.streamBlockStart();
      handler.stream.write('block');
      handler.streamBlockEnd();
      expect(chunks).toEqual([]);

      handler.releaseFirstFlush();
      handler.flush();

      expect(chunks).toEqual(['block']);
    });

    it('a buffer past maximumInitialChunk writes through the hold', () => {
      const { handler, chunks } = createHeldHandler();

      handler.stream.write('a'.repeat(5));
      expect(chunks).toEqual([]);

      handler.stream.write('b'.repeat(5));

      expect(chunks).toEqual(['aaaaabbbbb']);
    });

    it('a buffer past maximumInitialChunk ends the hold', () => {
      const { handler, chunks } = createHeldHandler();

      handler.stream.write('a'.repeat(10));
      handler.stream.write('b');
      handler.flush();

      expect(chunks).toEqual(['a'.repeat(10), 'b']);
    });

    it('the disabled strategy holds past any size', () => {
      const { handler, chunks } = createHeldHandler({ strategy: 'disabled' });

      handler.stream.write('a'.repeat(100_000));
      handler.flush();

      expect(chunks).toEqual([]);
    });
  });
});
