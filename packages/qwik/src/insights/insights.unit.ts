import { expect, test } from 'vitest';
import { insightsPing } from './insights';
import compress from 'brotli/compress.js';

test('insightsPing size', () => {
  const pingSrc = (insightsPing as any).resolved.serialized;
  const compressed = compress(Buffer.from(pingSrc), { mode: 1, quality: 11 });

  // Development keeps readable function source. Production bundling minifies the function before
  // _qrlSync() records fn.toString(), without embedding a second copy of the source in the bundle.
  expect(compressed.length).toBeLessThan(950);
  expect(pingSrc.length).toBeLessThan(3000);
  expect(pingSrc).toMatch(/^\(\)\s*=>/);
  expect(pingSrc).toContain('qSymbolTracker');
});
