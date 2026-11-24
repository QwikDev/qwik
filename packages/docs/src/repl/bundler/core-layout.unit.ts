import { describe, expect, it } from 'vitest';
import { shipsCoreAsQwikLibrary } from './core-layout';

describe('shipsCoreAsQwikLibrary', () => {
  it.each(['1.9.0', '2.0.0-beta.40', '2.0.0-rc.5'])('is false for %s', (version) => {
    expect(shipsCoreAsQwikLibrary(version)).toBe(false);
  });

  it.each(['2.0.0-rc.6', '2.0.0', '2.0.1', '2.1.0', '3.0.0'])('is true for %s', (version) => {
    expect(shipsCoreAsQwikLibrary(version)).toBe(true);
  });
});
