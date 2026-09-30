import { $, type JSXOutput } from '@qwik.dev/core';
import { describe, expectTypeOf, test } from 'vitest';
import type { CatchProps } from './catch';
import type { CatchStore } from './error-handling';

describe('Catch public types', () => {
  // `()=>()=>` bodies never execute; compile-time only.
  test('fallback$ error param is Error with optional digest', () => () => {
    type FallbackError = Parameters<CatchProps['fallback$']>[0];
    expectTypeOf<FallbackError>().toEqualTypeOf<Error & { digest?: string }>();
    expectTypeOf<FallbackError>().not.toBeAny();
  });

  test('fallback$ allows direct message access without narrowing', () => () => {
    const _typed: CatchProps['fallback$'] = $((error) => {
      return <span>{error.message}</span>;
    });
    expectTypeOf(_typed).not.toBeAny();
  });

  test('onError$ error param is exactly Error', () => () => {
    type OnError = NonNullable<CatchProps['onError$']>;
    expectTypeOf<Parameters<OnError>[0]>().toEqualTypeOf<Error>();
  });

  test('fallback$ return accepts every JSXOutput shape', () => () => {
    const accept = (_fallback: CatchProps['fallback$']) => {};
    accept($(() => <span>boom</span>));
    accept($(() => 'boom'));
    accept($(() => 42));
    accept($(() => false));
    accept($(() => null));
    accept($(() => undefined));
    accept($(() => [<span>a</span>, 'b', null]));
    // @ts-expect-error not a JSXOutput
    accept($(() => ({ not: 'jsx' })));
    expectTypeOf<JSXOutput>().not.toBeAny();
  });

  test('CatchStore.error is unknown | undefined', () => () => {
    expectTypeOf<CatchStore['error']>().toEqualTypeOf<unknown>();
  });
});
