// Polyfill for TextEncoderStream
/** @internal */
export class _TextEncoderStream_polyfill extends TransformStream<string, Uint8Array> {
  private _encoder = new TextEncoder();
  public ready = Promise.resolve();
  public closed = false;
  public destroyed = false;
  public encoding = 'utf-8';

  constructor() {
    super({
      transform: (chunk: string, controller: TransformStreamDefaultController<Uint8Array>) => {
        const encoded = this._encoder.encode(chunk);
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
