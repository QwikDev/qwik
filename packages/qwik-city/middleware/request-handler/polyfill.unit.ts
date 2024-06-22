import { describe, it, expect } from 'vitest';
import { _TextEncoderStream_polyfill } from './polyfill';

describe('_TextEncoderStream_polyfill tests', () => {
  it('should encode string to Uint8Array', async () => {
    const encoderStream = new _TextEncoderStream_polyfill();
    const reader = encoderStream.readable.getReader();

    encoderStream.writable.getWriter().write('hello');
    const { value, done } = await reader.read();
    expect(value).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(value)).toBe('hello');
    expect(done).toBeFalsy();
  });

  it('should handle multiple chunks', async () => {
    const encoderStream = new _TextEncoderStream_polyfill();
    const encoderStream2 = new TextEncoderStream();
    const writer = encoderStream.writable.getWriter();
    const reader = encoderStream.readable.getReader();
    const writer2 = encoderStream2.writable.getWriter();
    const reader2 = encoderStream2.readable.getReader();

    writer.write('hello');
    writer.write(' world');
    writer2.write('hello');
    writer2.write(' world');

    const results1 = [await reader.read(), await reader.read()];
    const results2 = [await reader2.read(), await reader2.read()];
    await writer.close();
    await writer2.close();

    expect(results1.length).toBe(results2.length);
    expect(new TextDecoder().decode(results1[0].value)).toBe(
      new TextDecoder().decode(results2[0].value)
    );
    expect(new TextDecoder().decode(results1[1].value)).toBe(
      new TextDecoder().decode(results2[1].value)
    );
  });

  it('encoding consistency with native TextEncoderStream', async () => {
    const polyfillStream = new _TextEncoderStream_polyfill();
    const nativeStream = new TextEncoderStream();
    const testString = 'This is a test string.';

    const polyReader = polyfillStream.readable.getReader();
    const nativeReader = nativeStream.readable.getReader();

    polyfillStream.writable.getWriter().write(testString);
    nativeStream.writable.getWriter().write(testString);

    const polyResult = await polyReader.read();
    const nativeResult = await nativeReader.read();

    expect(polyResult.value).toEqual(nativeResult.value);
    expect(new TextDecoder().decode(polyResult.value)).toBe(testString);
  });

  it('handles non-string inputs', async () => {
    const polyfillStream = new _TextEncoderStream_polyfill();
    const nativeStream = new TextEncoderStream();

    const nativeWriter = nativeStream.writable.getWriter();
    const polyWriter = polyfillStream.writable.getWriter();

    expect(polyWriter.write(123 as any)).toEqual(nativeWriter.write(123 as any));
    expect(polyWriter.write({} as any)).toEqual(nativeWriter.write({} as any));
  });

  it("can encode emoji characters just the same as Node.js' implementation", async () => {
    const polyfillStream = new _TextEncoderStream_polyfill();
    const nativeStream = new TextEncoderStream();

    const input = '🦊test emoji encoding📦';

    const polyReader = polyfillStream.readable.getReader();
    const nativeReader = nativeStream.readable.getReader();

    polyfillStream.writable.getWriter().write(input);
    nativeStream.writable.getWriter().write(input);

    const polyResult = await polyReader.read();
    const nativeResult = await nativeReader.read();

    expect(polyResult.value).toEqual(nativeResult.value);
    expect(new TextDecoder().decode(polyResult.value)).toBe(input);
  });

  it('handles large input', async () => {
    const encoderStream = new _TextEncoderStream_polyfill();
    const writer = encoderStream.writable.getWriter();
    const reader = encoderStream.readable.getReader();
    const largeString = 'a'.repeat(10 ** 6); // 1 million characters

    writer.write(largeString);
    const { value } = await reader.read();
    expect(value?.byteLength).toBe(largeString.length);
  });

  it('sequential writes and reads', async () => {
    const encoderStream = new _TextEncoderStream_polyfill();
    const writer = encoderStream.writable.getWriter();
    const reader = encoderStream.readable.getReader();

    writer.write('first');
    writer.write('second');

    const firstResult = await reader.read();
    const secondResult = await reader.read();

    await writer.close();

    expect(new TextDecoder().decode(firstResult.value)).toBe('first');
    expect(new TextDecoder().decode(secondResult.value)).toBe('second');
  });

  it('stream chaining', async () => {
    const encoderStream = new _TextEncoderStream_polyfill();
    const transformStream = new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
      },
    });

    const writer = encoderStream.writable.getWriter();
    const chainedStream = encoderStream.readable.pipeThrough(transformStream);
    const reader = chainedStream.getReader();

    writer.write('test chaining');
    const result = await reader.read();
    expect(new TextDecoder().decode(result.value)).toBe('test chaining');
  });
});
