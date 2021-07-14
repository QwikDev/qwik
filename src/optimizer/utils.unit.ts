import type { EntryPointOptions } from './types';
import { getEntryPoints } from './utils';

describe('optimizer utils', () => {
  const files = [
    '/mustang.ts',
    '/camaro.tsx',
    '/nova.server.ts',
    '/challenger.d.ts',
    '/cuda.unit.ts',
    '/charger.spec.ts',
    '/amx.test.ts',
    '/__tests__/chevelle.ts',
  ];

  it('getEntryPoints, client options', () => {
    const opts: EntryPointOptions = { platform: 'client' };
    const entries = getEntryPoints(opts, files);
    expect(entries).toEqual(['/mustang.ts', '/camaro.tsx']);
  });

  it('getEntryPoints, no options', () => {
    const opts: EntryPointOptions = {};
    const entries = getEntryPoints(opts, files);
    expect(entries).toEqual(['/mustang.ts', '/camaro.tsx', '/nova.server.ts']);
  });
});
