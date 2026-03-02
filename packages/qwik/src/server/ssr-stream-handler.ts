import type { IStreamHandler } from './qwik-types';
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
  public stream: StreamWriter;

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

  private setupStreamWriter() {
    const handler = this;
    let stream: StreamWriter;
    switch (this.inOrderStreaming.strategy) {
      case 'disabled':
        stream = {
          write(chunk: string) {
            if (chunk === undefined || chunk === null) {
              return;
            }
            handler.enqueue(chunk);
          },
        };
        break;
      case 'direct': {
        const originalStream = this.nativeStream;
        stream = {
          write(chunk: string) {
            if (chunk === undefined || chunk === null) {
              return;
            }
            originalStream.write(chunk);
          },
        };
        break;
      }
      default:
      case 'auto': {
        const minimumChunkSize = this.inOrderStreaming.maximumChunk ?? 0;
        const initialChunkSize = this.inOrderStreaming.maximumInitialChunk ?? 0;
        stream = {
          write(chunk) {
            if (chunk === undefined || chunk === null) {
              return;
            }

            handler.enqueue(chunk);

            // Check if we should flush (only if not inside a stream block)
            if (handler.streamBlockDepth === 0) {
              const maxBufferSize =
                handler.networkFlushes === 0 ? initialChunkSize : minimumChunkSize;
              if (handler.bufferSize >= maxBufferSize) {
                handler.flush();
              }
            }
          },
        };
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

  flush() {
    if (this.buffer) {
      this.nativeStream.write(this.buffer);
      this.buffer = '';
      this.bufferSize = 0;
      this.networkFlushes++;
      if (this.networkFlushes === 1) {
        this.timing.firstFlush = this.firstFlushTimer();
      }
    }
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
      this.flush();
    }
  }
}
