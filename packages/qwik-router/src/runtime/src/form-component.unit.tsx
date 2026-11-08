import { $ } from '@qwik.dev/core';
import { describe, expectTypeOf, test } from 'vitest';
import { Form, type FormSubmitCompletedDetail } from './form-component';
import type { ActionStore } from './types';

type Output = { ok: boolean };
type Input = { name: string };

describe('Form types', () => {
  // Only type-checked, never rendered
  const action = {} as ActionStore<Output, Input>;

  test('onSubmitCompleted$ accepts an inline handler with typed event and form', () => () => (
    <Form
      action={action}
      onSubmitCompleted$={(event, form) => {
        expectTypeOf(event).toEqualTypeOf<CustomEvent<FormSubmitCompletedDetail<Output>>>();
        expectTypeOf(event.detail.value).toEqualTypeOf<Output>();
        expectTypeOf(form).toEqualTypeOf<HTMLFormElement>();
      }}
    />
  ));

  test('onSubmitCompleted$ still accepts QRLs and arrays of QRLs', () => () => {
    const handler = $((event: CustomEvent<FormSubmitCompletedDetail<Output>>) => event.detail);
    return (
      <>
        <Form action={action} onSubmitCompleted$={handler} />
        <Form action={action} onSubmitCompleted$={[handler, handler]} />
      </>
    );
  });

  test('onSubmitCompleted$ rejects handlers for a different event', () => () => (
    <Form
      action={action}
      // @ts-expect-error the handler expects a different event
      onSubmitCompleted$={(event: KeyboardEvent) => event.key}
    />
  ));
});
