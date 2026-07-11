import { describe, expect, test } from 'vitest';
import {
  calculateVersionStatus,
  createDependencyEntries,
  normalizeRepositoryUrl,
} from './dependency-model';

describe('createDependencyEntries', () => {
  test('returns typed entries in dependency section order', () => {
    const entries = createDependencyEntries({
      dependencies: { vite: '^7.0.0' },
      devDependencies: { vitest: '4.1.0' },
      peerDependencies: { '@qwik.dev/core': 'workspace:^' },
    });

    expect(entries).toEqual([
      ['vite', '^7.0.0', 'dependencies'],
      ['vitest', '4.1.0', 'devDependencies'],
      ['@qwik.dev/core', 'workspace:^', 'peerDependencies'],
    ]);
  });
});

describe('calculateVersionStatus', () => {
  test('returns latest when installed version matches latest', () => {
    expect(calculateVersionStatus('1.2.3', '1.2.3')).toBe('latest');
  });

  test('returns outdated when installed version differs from latest', () => {
    expect(calculateVersionStatus('1.2.3', '1.3.0')).toBe('outdated');
  });

  test('returns unknown when current version is a range or latest is missing', () => {
    expect(calculateVersionStatus('^1.2.3', '1.3.0')).toBe('unknown');
    expect(calculateVersionStatus('1.2.3')).toBe('unknown');
  });
});

describe('normalizeRepositoryUrl', () => {
  test('normalizes common repository values', () => {
    expect(normalizeRepositoryUrl('git+https://github.com/QwikDev/qwik.git')).toBe(
      'https://github.com/QwikDev/qwik'
    );
    expect(normalizeRepositoryUrl({ url: 'ssh://git@github.com/QwikDev/qwik.git' })).toBe(
      'https://github.com/QwikDev/qwik'
    );
  });
});
