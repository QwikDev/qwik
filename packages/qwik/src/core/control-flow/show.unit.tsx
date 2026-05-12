import type { JSXOutput, QRL } from '@qwik.dev/core';
import { describe, expectTypeOf, test } from 'vitest';
import { Show } from './show';

describe('Show types', () => {
  test('accepts plain when$ and branch functions', () => () => {
    const inferBranch = <WHEN, THEN extends JSXOutput, ELSE extends JSXOutput>(
      props: Parameters<typeof Show<WHEN, THEN, ELSE>>[0]
    ) => {
      expectTypeOf(props.when$).toMatchTypeOf<QRL<() => WHEN> | (() => WHEN)>();
      return null as unknown as THEN | ELSE;
    };

    const branch = inferBranch({
      when$: () => true,
      then$: () => <span>Then</span>,
      else$: () => <span>Else</span>,
    });

    expectTypeOf(branch).toMatchTypeOf<JSXOutput>();
  });

  test('allows omitted else$', () => () => {
    const props: Parameters<typeof Show<boolean, JSXOutput>>[0] = {
      when$: () => false,
      then$: () => <span>Then</span>,
    };

    expectTypeOf(props.else$).toEqualTypeOf<undefined | QRL<() => JSXOutput> | (() => JSXOutput)>();
  });

  test('accepts a QRL when$ value', () => () => {
    const when = null as unknown as QRL<() => boolean>;
    const props: Parameters<typeof Show<boolean, JSXOutput>>[0] = {
      when$: when,
      then$: () => <span>Then</span>,
    };

    expectTypeOf(props.when$).toEqualTypeOf<QRL<() => boolean> | (() => boolean)>();
  });
});
