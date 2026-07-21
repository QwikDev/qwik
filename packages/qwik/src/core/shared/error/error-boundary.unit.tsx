import { $, type JSXOutput } from '@qwik.dev/core';
import { describe, expectTypeOf, test } from 'vitest';
import type { ErrorBoundaryProps } from './error-boundary';
import type { ErrorBoundaryStore } from './error-handling';

describe('ErrorBoundary public types', () => {
  // `()=>()=>` bodies never execute; compile-time only.
  test('fallback$ error param is exactly Error', () => () => {
    type FallbackError = Parameters<ErrorBoundaryProps['fallback$']>[0];
    expectTypeOf<FallbackError>().toEqualTypeOf<Error>();
    expectTypeOf<FallbackError>().not.toBeAny();
  });

  test('fallback$ allows direct message access without narrowing', () => () => {
    const _typed: ErrorBoundaryProps['fallback$'] = $((error) => {
      return <span>{error.message}</span>;
    });
    expectTypeOf(_typed).not.toBeAny();
  });

  test('onError$ error param is exactly Error', () => () => {
    type OnError = NonNullable<ErrorBoundaryProps['onError$']>;
    expectTypeOf<Parameters<OnError>[0]>().toEqualTypeOf<Error>();
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
