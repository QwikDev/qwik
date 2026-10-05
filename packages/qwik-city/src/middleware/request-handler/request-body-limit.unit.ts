import { describe, expect, test } from 'vitest';
import { limitRequestBody } from './request-body-limit';

describe('limitRequestBody()', () => {
  const createRequest = (chunks: Uint8Array[]) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < chunks.length; i++) {
          controller.enqueue(chunks[i]);
        }
        controller.close();
      },
    });

    return new Request('http://localhost/', {
      body,
      method: 'POST',
      duplex: 'half',
    } as RequestInit);
  };

  test('accepts request bodies at the byte limit', async () => {
    const request = limitRequestBody(createRequest([new Uint8Array(4), new Uint8Array(4)]), 8);

    await expect(request.arrayBuffer()).resolves.toHaveProperty('byteLength', 8);
  });

  test.each([[4, 5], [9]])('rejects request bodies over the byte limit', async (...sizes) => {
    const request = limitRequestBody(createRequest(sizes.map((size) => new Uint8Array(size))), 8);

    await expect(request.arrayBuffer()).rejects.toMatchObject({
      status: 413,
      data: 'Request body exceeds 8 bytes',
    });
  });

  test('rejects invalid byte limits', () => {
    expect(() => limitRequestBody(createRequest([]), 0)).toThrow(
      'requestBodyLimit must be a positive safe integer'
    );
  });
});
