import { describe, expect, it } from 'vitest';
import { getReleasedVersion, getReleaseStage } from './release-stage';

describe('getReleasedVersion', () => {
  it('drops the dev build stamp', () => {
    expect(getReleasedVersion('2.0.0-rc.4-dev+a1b2c3d-20261104120000')).toBe('2.0.0-rc.4');
    expect(getReleasedVersion('2.0.0-rc.4')).toBe('2.0.0-rc.4');
  });
});

describe('getReleaseStage', () => {
  it.each([
    ['2.0.0-alpha.12', 'alpha'],
    ['2.0.0-beta.30', 'beta'],
    ['2.0.0-rc.4', 'rc'],
    ['2.0.0', 'stable'],
    ['2.0.3', 'stable'],
    ['2.1.0', 'minor'],
    ['2.1.0-beta.1', 'minor'],
    ['3.0.0', 'next-major'],
    ['3.0.0-alpha.1', 'next-major'],
  ])('maps %s to %s', (version, stage) => {
    expect(getReleaseStage(version)).toBe(stage);
  });
});
