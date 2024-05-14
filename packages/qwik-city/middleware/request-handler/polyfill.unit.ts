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
    const writer = encoderStream.writable.getWriter();
    const reader = encoderStream.readable.getReader();

    writer.write('hello');
    writer.write(' world');
    const results: any[] = [];
    reader.read().then((data) => results.push(data));
    reader.read().then((data) => results.push(data));

    await writer.close();
    expect(results.length).toBe(2);
    expect(new TextDecoder().decode(results[0].value)).toBe('hello');
    expect(new TextDecoder().decode(results[1].value)).toBe(' world');
  });

  it('should signal closed and destroyed on end', async () => {
    const encoderStream = new _TextEncoderStream_polyfill();
    const writer = encoderStream.writable.getWriter();
    await writer.close();

    expect(encoderStream.closed).toBeTruthy();
    expect(encoderStream.destroyed).toBeTruthy();
  });

  it('should handle empty string input', async () => {
    const encoderStream = new _TextEncoderStream_polyfill();
    const writer = encoderStream.writable.getWriter();
    const reader = encoderStream.readable.getReader();

    writer.write('');
    const { value, done } = await reader.read();
    expect(value).toBeTruthy();
    expect(value?.byteLength).toBe(0);
    expect(done).toBeFalsy();
  });

  // Add more tests as needed for thorough coverage
});
