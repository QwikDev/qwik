import { describe, expectTypeOf, test } from 'vitest';
import { server$ } from './server-functions';
import type { RequestEventBase } from './types';

describe('types', () => {
  test('matching', () => () => {
    const foo = () => server$(() => 'hello');

    expectTypeOf(foo).not.toBeAny();
    expectTypeOf(foo).returns.toMatchTypeOf<() => Promise<string>>();
    expectTypeOf(foo).returns.toMatchTypeOf<(sig: AbortSignal) => Promise<string>>();
    expectTypeOf(foo).returns.not.toMatchTypeOf<(meep: boolean) => Promise<string>>();
  });

  test('matching with args', () => () => {
    const foo = () => server$((name: string) => 'hello ' + name);

    expectTypeOf(foo).not.toBeAny();
    expectTypeOf(foo).returns.toMatchTypeOf<(name: string) => Promise<string>>();
    expectTypeOf(foo).returns.toMatchTypeOf<(sig: AbortSignal, name: string) => Promise<string>>();
    expectTypeOf(foo).returns.not.toMatchTypeOf<(meep: boolean) => Promise<string>>();
  });

  test('inferring', () => () => {
    const callIt = () =>
      server$(function () {
        expectTypeOf(this).not.toBeAny();
        expectTypeOf(this).toMatchTypeOf<RequestEventBase>();
        return this;
      })();

    expectTypeOf(callIt).not.toBeAny();
    expectTypeOf(callIt).returns.toMatchTypeOf<Promise<RequestEventBase>>();

    const serverGetSourceSnippet = server$(async function (
      publicApiKey: string,
      symbolHash: string
    ) {
      return {
        fullName: 'fullName',
        count: 5,
        origin: 'origin',
        originUrl: 'url',
        source: 'source',
      };
    });
    expectTypeOf(serverGetSourceSnippet).not.toBeAny();
    expectTypeOf(serverGetSourceSnippet('hi', 'there')).toEqualTypeOf<
      Promise<{
        fullName: string;
        count: number;
        origin: string;
        originUrl: string;
        source: string;
      }>
    >();
    expectTypeOf(serverGetSourceSnippet(new AbortController().signal, 'hi', 'there')).toEqualTypeOf<
      Promise<{
        fullName: string;
        count: number;
        origin: string;
        originUrl: string;
        source: string;
      }>
    >();
  });
});
