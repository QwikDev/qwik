// Polyfill for TextEncoderStream
/** @internal */
export class _TextEncoderStream_polyfill extends TransformStream<string, Uint8Array> {
  public ready = Promise.resolve();
  public closed = false;
  public destroyed = false;
  public encoding = 'utf-8';

  constructor() {
    const encoder = new TextEncoder();
    super({
      transform: (chunk: string, controller: TransformStreamDefaultController<Uint8Array>) => {
        const encoded = encoder.encode(chunk);
        if (encoded.byteLength > 0) {
          controller.enqueue(encoded);
        }
      },
      flush: (/* controller: TransformStreamDefaultController<Uint8Array> */) => {
        // With TextEncoder there's no need to handle the flush method since it doesn't have any end-of-stream state.
        this.closed = true;
        this.destroyed = true;
      },
    });
  }
}
