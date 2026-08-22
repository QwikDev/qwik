import { describe, expect, expectTypeOf, test } from 'vitest';
import { Form, type FormProps } from './form-component';
import type { ActionStore } from './types';

describe('FormProps', () => {
  test('requires an action or an explicit GET method', () => {
    type TestAction = ActionStore<unknown, unknown, false>;

    expectTypeOf<{ action: TestAction }>().toExtend<FormProps<unknown, unknown>>();
    expectTypeOf<{ method: 'get' }>().toExtend<FormProps<unknown, unknown>>();
    expectTypeOf<{}>().not.toExtend<FormProps<unknown, unknown>>();
    expectTypeOf<{ action: TestAction; method: 'get' }>().not.toExtend<
      FormProps<unknown, unknown>
    >();
  });

  test('reports ambiguous runtime props in development', () => {
    expect(() => Form({} as never, null)).toThrow(
      'Form requires either an action or method="get". Use a native <form> when handling submission manually.'
    );
    expect(() =>
      Form({ action: {} as ActionStore<unknown, unknown, false>, method: 'get' } as never, null)
    ).toThrow(
      'Form cannot use both an action and method="get". Choose one, or use a native <form> when handling submission manually.'
    );
  });
});
