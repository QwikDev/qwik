import type { Encoding } from 'crypto';

// Copyright 2016 Google Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Polyfill for TextEncoderStream and TextDecoderStream

// Modified by Sukka (https://skk.moe) to increase compatibility and performance with Bun.
/** @internal */
export class _TextDecoderStream_polyfill extends TransformStream<Uint8Array, string> {
  readonly encoding: string;
  readonly fatal: boolean;
  readonly ignoreBOM: boolean;

  constructor(
    encoding: Encoding = 'utf-8',
    { fatal = false, ignoreBOM = false }: ConstructorParameters<typeof TextDecoder>[1] = {}
  ) {
    const decoder = new TextDecoder(encoding, { fatal, ignoreBOM });
    super({
      transform(chunk: Uint8Array, controller: TransformStreamDefaultController<string>) {
        const decoded = decoder.decode(chunk);
        if (decoded.length > 0) {
          controller.enqueue(decoded);
        }
      },
      flush(controller: TransformStreamDefaultController<string>) {
        // If {fatal: false} is in options (the default), then the final call to
        // decode() can produce extra output (usually the unicode replacement
        // character 0xFFFD). When fatal is true, this call is just used for its
        // side-effect of throwing a TypeError exception if the input is
        // incomplete.
        const output = decoder.decode();
        if (output.length > 0) {
          controller.enqueue(output);
        }
      },
    });

    this.encoding = encoding;
    this.fatal = fatal;
    this.ignoreBOM = ignoreBOM;
  }
}
// Polyfill for TextEncoderStream
/** @internal */
export class _TextEncoderStream_polyfill extends TransformStream<string, Uint8Array> {
  constructor() {
    const encoder = new TextEncoder();
    super({
      transform(chunk: string, controller: TransformStreamDefaultController<Uint8Array>) {
        const encoded = encoder.encode(chunk);
        if (encoded.byteLength > 0) {
          controller.enqueue(encoded);
        }
      },
      flush(_controller: TransformStreamDefaultController<Uint8Array>) {
        // When the stream is finished, we don't have any cleanup to do.
        // We don't need to enqueue any data because TextEncoder.encode doesn't have any state.
      },
    });
  }
}
