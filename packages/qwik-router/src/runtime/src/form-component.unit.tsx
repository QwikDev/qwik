import { $, component$ } from '@qwik.dev/core';
import { domRender, trigger } from '@qwik.dev/core/testing';
import { QwikRouterMockProvider } from '@qwik.dev/router';
import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest';
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

const gotoMock = vi.fn();

const GetFormRoot = component$(() => (
  <QwikRouterMockProvider goto={$((path, options) => gotoMock(path, options))}>
    <Form>
      <input name="q" value="release" />
      <button type="submit" name="scope" value="open">
        Open reports
      </button>
      <button type="submit" name="scope" value="closed">
        Closed reports
      </button>
    </Form>
  </QwikRouterMockProvider>
));

describe('GET Form submission', () => {
  // The unit-test DOM has no FormData that reads a form element, so stand in
  // for the platform constructor: it serializes the named controls and adds
  // the submitter's name/value only when a submitter is passed, as browsers do.
  class TestFormData {
    static constructedWith: Array<[unknown, unknown]> = [];
    private entries: Array<[string, string]> = [];

    constructor(form: HTMLFormElement, submitter?: HTMLElement | null) {
      TestFormData.constructedWith.push([form, submitter]);
      Array.from(form.querySelectorAll('input, select, textarea, button')).forEach((el) => {
        const name = el.getAttribute('name');
        if (!name) {
          return;
        }
        const isSubmitButton = el.tagName === 'BUTTON' || el.getAttribute('type') === 'submit';
        if (isSubmitButton && el !== submitter) {
          return;
        }
        this.entries.push([name, el.getAttribute('value') ?? '']);
      });
    }

    forEach(callback: (value: string, key: string) => void) {
      this.entries.forEach(([key, value]) => callback(value, key));
    }
  }

  beforeEach(() => {
    TestFormData.constructedWith = [];
    gotoMock.mockClear();
    vi.stubGlobal('FormData', TestFormData);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderForm = async () => {
    const { document } = await domRender(<GetFormRoot />, { debug: false });
    const form = document.querySelector('form')!;
    const buttons = Array.from(form.querySelectorAll('button'));
    return { document, form, buttons };
  };

  test('navigates with the named submit button in the query', async () => {
    const { document, form, buttons } = await renderForm();

    await trigger(document.body, form, 'submit', { submitter: buttons[0] });

    expect(gotoMock).toHaveBeenCalledTimes(1);
    expect(gotoMock).toHaveBeenCalledWith('?q=release&scope=open', {
      type: 'form',
      forceReload: true,
    });
    expect(TestFormData.constructedWith[0]?.[1]).toBe(buttons[0]);
  });

  test('navigates with the submitter that was used, not the other button', async () => {
    const { document, form, buttons } = await renderForm();

    await trigger(document.body, form, 'submit', { submitter: buttons[1] });

    expect(gotoMock).toHaveBeenCalledWith('?q=release&scope=closed', {
      type: 'form',
      forceReload: true,
    });
  });

  test('navigates with only the fields when there is no submitter', async () => {
    const { document, form } = await renderForm();

    await trigger(document.body, form, 'submit');

    expect(gotoMock).toHaveBeenCalledWith('?q=release', {
      type: 'form',
      forceReload: true,
    });
  });
});
