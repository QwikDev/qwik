import {
  jsx,
  component$,
  Slot,
  $,
  sync$,
  type EventHandler,
  type QRLEventHandlerMulti,
  type QwikJSX,
} from '@qwik.dev/core';
import type { ActionStore } from './types';
import { _isSyncQrl } from '@qwik.dev/core/internal';
import { useNavigate } from './use-functions';

type ActionFormElement = HTMLFormElement & { _qSubmit?: SubmitEvent };

/** @public */
export interface FormSubmitCompletedDetail<T> {
  status: number;
  value: T;
}

/** @public */
export interface FormProps<O, I> extends Omit<
  QwikJSX.IntrinsicElements['form'],
  'action' | 'method'
> {
  /** Reference to the action returned by `action()`. */
  action?: ActionStore<O, I, true | false>;

  /**
   * When `true` the form submission will cause a full page reload, even if SPA mode is enabled and
   * JS is available.
   */
  reloadDocument?: boolean;

  /**
   * Resets SPA form controls after responses, including validation failures.
   *
   * Defaults to `false`
   */
  spaReset?: boolean;

  /**
   * Runs after a form submission returns, including validation failures. Like the native `on*$`
   * events, it accepts an inline function as well as a QRL.
   */
  onSubmitCompleted$?:
    | QRLEventHandlerMulti<CustomEvent<FormSubmitCompletedDetail<O>>, HTMLFormElement>
    // `Form` is not a `component$`, so its props don't get the `PublicProps` treatment that allows
    // plain functions. The optimizer turns an inline handler into a QRL anyway.
    | EventHandler<CustomEvent<FormSubmitCompletedDetail<O>>, HTMLFormElement>
    | undefined;

  key?: string | number | null;
}

/** @public */
export const Form = <O, I>(
  { action, spaReset, reloadDocument, onSubmit$, ...rest }: FormProps<O, I>,
  key: string | null
) => {
  if (action) {
    const submitHandlers = ([onSubmit$] as unknown[]).flat(Infinity) as EventHandler<
      SubmitEvent,
      HTMLFormElement
    >[];
    const firstAsyncHandler = submitHandlers.findIndex(
      (handler) => handler && !_isSyncQrl(handler)
    );
    const syncHandlers =
      firstAsyncHandler === -1 ? submitHandlers : submitHandlers.slice(0, firstAsyncHandler);
    const asyncHandlers = firstAsyncHandler === -1 ? [] : submitHandlers.slice(firstAsyncHandler);
    return jsx(
      'form',
      {
        ...rest,
        action: action.actionPath,
        'preventdefault:submit': !reloadDocument,
        onSubmit$: [
          !reloadDocument
            ? sync$((event: SubmitEvent, form: ActionFormElement) => {
                form._qSubmit ??= event;
              })
            : undefined,
          ...(!reloadDocument ? syncHandlers : []),
          !reloadDocument
            ? $(async (event: SubmitEvent, form: ActionFormElement) => {
                if (form._qSubmit !== event) {
                  return;
                }
                try {
                  for (const handler of asyncHandlers) {
                    await handler?.(event, form);
                  }
                  await action.submit(event);
                } finally {
                  delete form._qSubmit;
                }
              })
            : onSubmit$,
          // The async handler never runs if its chunk fails to load.
          !reloadDocument
            ? sync$((event: SubmitEvent, form: ActionFormElement) => {
                if (form._qSubmit === event) {
                  delete form._qSubmit;
                }
              })
            : undefined,
        ],
        method: 'post',
        ['data-spa-reset']: spaReset ? 'true' : undefined,
      },
      key
    );
  } else {
    return (
      <GetForm
        key={key}
        spaReset={spaReset}
        reloadDocument={reloadDocument}
        onSubmit$={onSubmit$}
        {...(rest as any)}
      />
    );
  }
};

export const GetForm = component$<FormProps<undefined, undefined>>(
  ({ action: _0, spaReset, reloadDocument, onSubmit$, ...rest }) => {
    const nav = useNavigate();
    return (
      <form
        action="get"
        preventdefault:submit={!reloadDocument}
        data-spa-reset={spaReset ? 'true' : undefined}
        {...rest}
        onSubmit$={[
          ...((Array.isArray(onSubmit$) ? onSubmit$ : [onSubmit$]) as QRLEventHandlerMulti<
            SubmitEvent,
            HTMLFormElement
          >[]), // type casting to keep consumers linters happy
          $(async (_evt, form) => {
            const formData = new FormData(form);
            const params = new URLSearchParams();
            formData.forEach((value, key) => {
              if (typeof value === 'string') {
                params.append(key, value);
              }
            });
            await nav('?' + params.toString(), { type: 'form', forceReload: true });
          }),
          $((_evt, form) => {
            if (form.getAttribute('data-spa-reset') === 'true') {
              form.reset();
            }
            form.dispatchEvent(
              new CustomEvent('submitcompleted', {
                bubbles: false,
                cancelable: false,
                composed: false,
                detail: {
                  status: 200,
                },
              })
            );
          }),
        ]}
      >
        <Slot />
      </form>
    );
  }
);
