import { isPromise } from './qwik-copy';
import type { IStreamHandler, SSRInternalStreamWriter } from './qwik-types';
import { createStringStreamWriter } from './ssr-stream-writer';
import type {
  InOrderStreaming,
  RenderToStreamOptions,
  RenderToStreamResult,
  StreamWriter,
} from './types';
import { createTimer } from './utils';

export class StreamHandler implements IStreamHandler {
  private bufferSize = 0;
  private buffer: string = '';
  public networkFlushes = 0;
  private inOrderStreaming: InOrderStreaming;
  private streamBlockDepth = 0;
  private streamBlockBuffer: string = '';
  private streamBlockBufferSize = 0;
  private nativeStream: StreamWriter;
  private firstFlushTimer = createTimer();
  private pendingFlush: Promise<void> | undefined;
  private flushQueued = false;
  public stream: SSRInternalStreamWriter;

  constructor(
    public opts: RenderToStreamOptions,
    public timing: RenderToStreamResult['timing']
  ) {
    this.inOrderStreaming = opts.streaming?.inOrder ?? {
      strategy: 'auto',
      maximumInitialChunk: 20_000,
      maximumChunk: 10_000,
    };
    this.nativeStream = opts.stream;
    this.stream = this.setupStreamWriter();
  }

  private setupStreamWriter(): SSRInternalStreamWriter {
    const handler = this;
    // Checkpoint/truncate operate on the stream-block buffer, so they only rewind output that is
    // still buffered (i.e. written while a stream block is open and not yet flushed).
    const bufferOps = {
      checkpoint: () => handler.streamCheckpoint(),
      truncate: (checkpoint: number) => handler.streamTruncate(checkpoint),
    };
    let stream: SSRInternalStreamWriter;
    switch (this.inOrderStreaming.strategy) {
      case 'disabled':
        stream = createStringStreamWriter((chunk: string) => {
          if (chunk === undefined || chunk === null) {
            return;
          }
          handler.enqueue(chunk);
        }, bufferOps);
        break;
      case 'direct': {
        const originalStream = this.nativeStream;
        stream = createStringStreamWriter((chunk: string) => {
          if (chunk === undefined || chunk === null) {
            return;
          }
          if (handler.pendingFlush) {
            const queued = handler.pendingFlush.then(() => originalStream.write(chunk));
            return handler.trackPendingFlush(queued);
          }
          return handler.trackPendingFlush(originalStream.write(chunk));
        }, bufferOps);
        break;
      }
      default:
      case 'auto': {
        const minimumChunkSize = this.inOrderStreaming.maximumChunk ?? 0;
        const initialChunkSize = this.inOrderStreaming.maximumInitialChunk ?? 0;
        stream = createStringStreamWriter((chunk) => {
          if (chunk === undefined || chunk === null) {
            return;
          }

          handler.enqueue(chunk);

          // Check if we should flush (only if not inside a stream block)
          if (handler.streamBlockDepth === 0) {
            const maxBufferSize =
              handler.networkFlushes === 0 ? initialChunkSize : minimumChunkSize;
            if (handler.bufferSize >= maxBufferSize) {
              return handler.flush();
            }
          }
        }, bufferOps);
        break;
      }
    }
    return stream;
  }

  private enqueue(chunk: string) {
    const len = chunk.length;
    if (this.streamBlockDepth > 0) {
      // Inside a stream block, accumulate in stream block buffer
      this.streamBlockBuffer += chunk;
      this.streamBlockBufferSize += len;
    } else {
      // Normal buffering
      this.bufferSize += len;
      this.buffer += chunk;
    }
  }

  private trackPendingFlush(result: ReturnType<StreamWriter['write']>) {
    if (!isPromise(result)) {
      return;
    }

    const pending = Promise.resolve(result).finally(() => {
      if (this.pendingFlush === pending) {
        this.pendingFlush = undefined;
      }
    });
    this.pendingFlush = pending;
    return pending;
  }

  private flushBuffer() {
    const chunk = this.buffer;
    this.buffer = '';
    this.bufferSize = 0;
    this.networkFlushes++;
    if (this.networkFlushes === 1) {
      this.timing.firstFlush = this.firstFlushTimer();
    }

    return this.trackPendingFlush(this.nativeStream.write(chunk));
  }

  flush(): Promise<void> | void {
    if (!this.buffer) {
      return this.waitForPendingFlush();
    }

    if (this.pendingFlush) {
      if (!this.flushQueued) {
        this.flushQueued = true;
        const queued = this.pendingFlush.then(() => {
          this.flushQueued = false;
          this.pendingFlush = undefined;
          return this.flush();
        });
        this.pendingFlush = queued.finally(() => {
          if (this.pendingFlush === queued) {
            this.pendingFlush = undefined;
          }
        });
      }
      return this.pendingFlush;
    }

    return this.flushBuffer();
  }

  waitForPendingFlush() {
    return this.pendingFlush;
  }

  /** Mark the current stream-block buffer position (only meaningful while a stream block is open). */
  streamCheckpoint(): number {
    return this.streamBlockBuffer.length;
  }

  /** Discard stream-block buffer content written since `checkpoint`. */
  streamTruncate(checkpoint: number): void {
    this.streamBlockBuffer = this.streamBlockBuffer.slice(0, checkpoint);
    this.streamBlockBufferSize = this.streamBlockBuffer.length;
  }

  streamBlockStart() {
    this.streamBlockDepth++;
  }

  streamBlockEnd() {
    this.streamBlockDepth--;
    if (this.streamBlockDepth === 0 && this.streamBlockBuffer) {
      // Move block buffer to main buffer and flush as one chunk
      this.buffer += this.streamBlockBuffer;
      this.bufferSize += this.streamBlockBufferSize;
      this.streamBlockBuffer = '';
      this.streamBlockBufferSize = 0;
      return this.flush();
    }
  }
}
