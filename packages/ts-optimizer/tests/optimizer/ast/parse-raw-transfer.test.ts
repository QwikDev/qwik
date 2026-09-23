import { describe, expect, it } from 'vitest';
import { disableRawTransfer, parseWithRawTransfer } from '../../../src/optimizer/ast/parse.js';

/** Bytes backing ArrayBuffers; the raw-transfer buffer shows up here in full on every platform. */
const arrayBufferMb = () => process.memoryUsage().arrayBuffers / 1024 / 1024;

describe('parseWithRawTransfer', () => {
  // Raw transfer reserves ~6 GB per thread; pool workers must not, or fork() in the host fails.
  it('does not reserve the raw-transfer buffer once disabled', () => {
    disableRawTransfer();
    const before = arrayBufferMb();
    const result = parseWithRawTransfer('a.tsx', 'export const a = (x: number) => <div>{x}</div>;');
    expect(result.program.body).toHaveLength(1);
    expect(arrayBufferMb() - before).toBeLessThan(256);
  });
});
