import { describe, expect, test } from 'vitest';
import { setBuildAnalysisResponseHeaders } from './index';

describe('setBuildAnalysisResponseHeaders', () => {
  test('copies configured Vite server headers onto the report response', () => {
    const headers = new Map<string, number | string | string[]>();
    const res = {
      setHeader(name: string, value: number | string | string[]) {
        headers.set(name, value);
      },
    };

    setBuildAnalysisResponseHeaders(res, {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'X-Skipped': undefined,
    });

    expect(headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
    expect(headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(headers.has('X-Skipped')).toBe(false);
  });
});
