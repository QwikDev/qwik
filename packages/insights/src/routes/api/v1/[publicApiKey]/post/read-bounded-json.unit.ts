import { expect, test } from 'vitest';
import { readBoundedJson } from './read-bounded-json';

const post = (body: string) => new Request('https://insights.qwik.dev', { method: 'POST', body });

test('parses a body within the byte limit', async () => {
  await expect(readBoundedJson(post('{"a":"ü"}'), 10)).resolves.toEqual({ a: 'ü' });
});

test('rejects a body over the byte limit', async () => {
  await expect(readBoundedJson(post('{"a":"ü"}'), 9)).resolves.toBeUndefined();
});
