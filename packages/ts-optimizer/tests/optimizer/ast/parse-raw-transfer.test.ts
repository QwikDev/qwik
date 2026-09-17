import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { disableRawTransfer, parseWithRawTransfer } from '../../../src/optimizer/ast/parse.js';

const vmDataMb = () =>
  Number(/VmData:\s+(\d+)/.exec(readFileSync('/proc/self/status', 'utf8'))![1]) / 1024;

describe('parseWithRawTransfer', () => {
  // Raw transfer reserves ~6 GB per thread; pool workers must not, or fork() in the host fails.
  it.skipIf(process.platform !== 'linux')(
    'does not reserve the raw-transfer buffer once disabled',
    () => {
      disableRawTransfer();
      const before = vmDataMb();
      const result = parseWithRawTransfer(
        'a.tsx',
        'export const a = (x: number) => <div>{x}</div>;'
      );
      expect(result.program.body).toHaveLength(1);
      expect(vmDataMb() - before).toBeLessThan(256);
    }
  );
});
