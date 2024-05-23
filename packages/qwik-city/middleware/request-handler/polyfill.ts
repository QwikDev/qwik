// Polyfill for TextEncoderStream

/**
 * TextEncoderStream polyfill based on Node.js' implementation
 * https://github.com/nodejs/node/blob/3f3226c8e363a5f06c1e6a37abd59b6b8c1923f1/lib/internal/webstreams/encoding.js#L38-L119
 * (MIT License)
 */
/** @internal */
export class _TextEncoderStream_polyfill {
  #pendingHighSurrogate: string | null = null;

  #handle = new TextEncoder();

  #transform = new TransformStream<string, Uint8Array>({
    transform: (chunk, controller) => {
      // https://encoding.spec.whatwg.org/#encode-and-enqueue-a-chunk
      chunk = String(chunk);

      let finalChunk = '';
      for (const item of chunk) {
        const codeUnit = item.charCodeAt(0);
        if (this.#pendingHighSurrogate !== null) {
          const highSurrogate = this.#pendingHighSurrogate;

          this.#pendingHighSurrogate = null;
          if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
            finalChunk += highSurrogate + item;
            continue;
          }

          finalChunk += '\uFFFD';
        }

        if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
          this.#pendingHighSurrogate = item;
          continue;
        }

        if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
          finalChunk += '\uFFFD';
          continue;
        }

        finalChunk += item;
      }

      if (finalChunk) {
        controller.enqueue(this.#handle.encode(finalChunk));
      }
    },

    flush: (controller) => {
      // https://encoding.spec.whatwg.org/#encode-and-flush
      if (this.#pendingHighSurrogate !== null) {
        controller.enqueue(new Uint8Array([0xef, 0xbf, 0xbd]));
      }
    },
  });

  get encoding() {
    return this.#handle.encoding;
  }

  get readable() {
    return this.#transform.readable;
  }

  get writable() {
    return this.#transform.writable;
  }

  get [Symbol.toStringTag]() {
    return 'TextEncoderStream';
  }
}


const resolved = Promise.resolve();
/** @internal */
export class _TextEncoderStream_polyfill2 {
  // minimal polyfill implementation of TextEncoderStream
  // since Cloudflare Pages doesn't support readable.pipeTo()
  _writer: any;
  readable: any;
  writable: any;

  constructor() {
    this._writer = null;
    this.readable = {
      pipeTo: (writableStream: any) => {
        this._writer = writableStream.getWriter();
      },
    };
    this.writable = {
      getWriter: () => {
        if (!this._writer) {
          throw new Error('No writable stream');
        }
        const encoder = new TextEncoder();
        return {
          write: async (chunk: any) => {
            if (chunk != null) {
              await this._writer.write(encoder.encode(chunk));
            }
          },
          close: () => this._writer.close(),
          ready: resolved,
        };
      },
    };
  }
}