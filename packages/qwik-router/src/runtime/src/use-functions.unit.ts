import { $ } from '@qwik.dev/core';
import { describe, expectTypeOf, test } from 'vitest';
import { usePreventNavigate, usePreventNavigate$, usePreventNavigateQrl } from './use-functions';

describe('use-functions types', () => {
  test('usePreventNavigate accepts plain callbacks and QRLs', () => () => {
    expectTypeOf(usePreventNavigate((url) => !!url)).toEqualTypeOf<void>();
    expectTypeOf(usePreventNavigate($((url) => !!url))).toEqualTypeOf<void>();
    expectTypeOf(usePreventNavigate$((url) => !!url)).toEqualTypeOf<void>();
    expectTypeOf(usePreventNavigateQrl($((url) => !!url))).toEqualTypeOf<void>();
  });
});
