import { component$, type QRL } from '@qwik.dev/core';
import { describe, expectTypeOf, test } from 'vitest';
import type { FunctionComponent as ReactFC } from 'react';
import { qwikify, qwikify$, qwikifyQrl } from './qwikify';
import { reactify, reactify$, reactifyQrl } from './reactify';

describe('qwik react aliases', () => {
  test('qwikify and reactify accept plain values and QRLs', () => () => {
    const ReactCmp: ReactFC<{ count: number; children?: unknown }> = () => null;
    const ReactCmpQrl = true as any as QRL<typeof ReactCmp>;
    const QwikCmp = component$<{ count: number }>(() => null);
    const QwikCmpQrl = true as any as QRL<typeof QwikCmp>;

    expectTypeOf(qwikify(ReactCmp)).not.toBeAny();
    expectTypeOf(qwikify(ReactCmpQrl)).not.toBeAny();
    expectTypeOf(qwikify$(() => null)).not.toBeAny();
    expectTypeOf(qwikifyQrl(ReactCmpQrl)).not.toBeAny();

    expectTypeOf(reactify(QwikCmp)).toBeAny();
    expectTypeOf(reactify(QwikCmpQrl)).toBeAny();
    expectTypeOf(reactify$(() => null)).toBeAny();
    expectTypeOf(reactifyQrl(QwikCmpQrl)).toBeAny();
  });
});
