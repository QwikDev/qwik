import { Fragment, Fragment as F, type JSXOutput } from '@qwik.dev/core';
import { Fragment as RuntimeFragment } from '@qwik.dev/core/jsx-runtime';
import { expectTypeOf, test } from 'vitest';

test('accepts Fragment imports and aliases in JSX', () => () => {
  expectTypeOf(<Fragment />).toEqualTypeOf<JSXOutput>();
  expectTypeOf(
    <Fragment>
      <span>one</span>
      <span>two</span>
    </Fragment>
  ).toEqualTypeOf<JSXOutput>();
  expectTypeOf(
    <F key="row">
      <b>alias</b>
    </F>
  ).toEqualTypeOf<JSXOutput>();
  expectTypeOf(<RuntimeFragment />).toEqualTypeOf<JSXOutput>();
  // @ts-expect-error Fragment does not accept element attributes.
  const invalid: Parameters<typeof Fragment>[0] = { class: 'invalid' };
  void invalid;
});
