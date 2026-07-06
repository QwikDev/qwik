import { $, type JSXOutput } from '@qwik.dev/core';
import { describe, expectTypeOf, test } from 'vitest';
import type { ErrorBoundaryProps } from './error-boundary';
import type { ErrorBoundaryStore } from './error-handling';

describe('ErrorBoundary public types', () => {
  // `()=>()=>` bodies never execute; compile-time only.
  test('fallback$ error param is exactly unknown', () => () => {
    type FallbackError = Parameters<ErrorBoundaryProps['fallback$']>[0];
    expectTypeOf<FallbackError>().toEqualTypeOf<unknown>();
    expectTypeOf<FallbackError>().not.toBeAny();
  });

  test('fallback$ forces narrowing before touching the error', () => () => {
    const _typed: ErrorBoundaryProps['fallback$'] = $((error) => {
      // @ts-expect-error error is `unknown`, so a bare `.message` access is rejected.
      error.message;
      if (error instanceof Error) {
        return <span>{error.message}</span>;
      }
      return <span>error</span>;
    });
    expectTypeOf(_typed).not.toBeAny();
  });

  test('fallback$ return accepts every JSXOutput shape', () => () => {
    const accept = (_fallback: ErrorBoundaryProps['fallback$']) => {};
    accept($(() => <span>boom</span>));
    accept($(() => 'boom'));
    accept($(() => 42));
    accept($(() => false));
    accept($(() => null));
    accept($(() => undefined));
    accept($(() => [<span>a</span>, 'b', null]));
    // @ts-expect-error fallback$ must return JSXOutput, not an arbitrary object.
    accept($(() => ({ not: 'jsx' })));
    expectTypeOf<JSXOutput>().not.toBeAny();
  });

  test('ErrorBoundaryStore.error is unknown | undefined', () => () => {
    expectTypeOf<ErrorBoundaryStore['error']>().toEqualTypeOf<unknown>();
  });
});
