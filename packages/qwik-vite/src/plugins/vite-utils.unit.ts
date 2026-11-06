import { describe, expect, test } from 'vitest';
import { sanitizeChunkGroupName, shortenChunkName } from './vite-utils';

describe('sanitizeChunkGroupName', () => {
  test('returns null for empty names', () => {
    expect(sanitizeChunkGroupName(null)).toBeNull();
    expect(sanitizeChunkGroupName(undefined)).toBeNull();
    expect(sanitizeChunkGroupName('')).toBeNull();
  });

  test('keeps a plain name as-is', () => {
    expect(sanitizeChunkGroupName('routes')).toBe('routes');
  });

  test('flattens path separators, which the bundler rejects in [name]', () => {
    expect(sanitizeChunkGroupName('src/routes/index')).toBe('src-routes-index');
    expect(sanitizeChunkGroupName('./src/routes')).toBe('src-routes');
    expect(sanitizeChunkGroupName('../../src/routes')).toBe('src-routes');
    expect(sanitizeChunkGroupName('src\\routes\\index')).toBe('src-routes-index');
  });

  test('suffixes reserved names so a segment cannot hijack the manifest pointers', () => {
    expect(sanitizeChunkGroupName('qwik-core')).toBe('qwik-core-segment');
    expect(sanitizeChunkGroupName('qwikloader')).toBe('qwikloader-segment');
    expect(sanitizeChunkGroupName('qwik-preloader')).toBe('qwik-preloader-segment');
  });
});

describe('shortenChunkName', () => {
  test('shortens only names over 200 bytes', () => {
    expect(shortenChunkName('a'.repeat(200))).toBe('a'.repeat(200));
    expect(shortenChunkName('a'.repeat(201))).not.toBe('a'.repeat(201));
    expect(Buffer.byteLength(shortenChunkName('a'.repeat(201)))).toBeLessThanOrEqual(200);
  });

  test('shortens a longer name to 200 bytes, keeping its start and end', () => {
    const name = `segment_app.tsx_App_component_${'div_'.repeat(60)}button_q_e_click_ppvuTaDoEGk`;
    const shortened = shortenChunkName(name);

    expect(Buffer.byteLength(shortened)).toBeLessThanOrEqual(200);
    expect(shortened).toMatch(/^segment_app\.tsx_App_component_div_/);
    expect(shortened).toMatch(/_button_q_e_click_ppvuTaDoEGk$/);
  });

  test('keeps long names that differ only in the middle apart', () => {
    const withMiddle = (middle: string) => `app.tsx_${'a'.repeat(150)}${middle}${'z'.repeat(150)}`;

    expect(shortenChunkName(withMiddle('b'))).not.toBe(shortenChunkName(withMiddle('c')));
  });

  test.each(['', 'a', 'ab'])('cuts multi-byte names on whole characters (padding %j)', (pad) => {
    const shortened = shortenChunkName(`${pad}${'组'.repeat(100)}${pad}`);

    expect(Buffer.byteLength(shortened)).toBeLessThanOrEqual(200);
    expect(shortened).not.toContain('\uFFFD');
  });
});
