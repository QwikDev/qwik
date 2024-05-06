import {
  jsx,
  _wrapSignal,
  type QwikJSX,
  type ValueOrPromise,
  component$,
  Slot,
  type QRLEventHandlerMulti,
} from '@builder.io/qwik';
import type { ActionStore } from './types';
import { useNavigate } from './use-functions';

/** @public */
export interface FormSubmitCompletedDetail<T> {
  status: number;
  value: T;
}

/** @public */
export interface FormProps<O, I>
  extends Omit<QwikJSX.IntrinsicElements['form'], 'action' | 'method'> {
  /** Reference to the action returned by `action()`. */
  action?: ActionStore<O, I, true | false>;

  /**
   * When `true` the form submission will cause a full page reload, even if SPA mode is enabled and
   * JS is available.
   */
  reloadDocument?: boolean;

  /**
   * When `true` all the form inputs will be reset in SPA mode, just like happens in a full page
   * form submission.
   *
   * Defaults to `false`
   */
  spaReset?: boolean;

  /** Event handler executed right when the form is submitted. */
  onSubmit$?:
    | ((event: Event, element: HTMLFormElement) => any)
    | QRLEventHandlerMulti<Event, HTMLFormElement>
    | undefined;

  /** Event handler executed right after the action is executed successfully and returns some data. */
  onSubmitCompleted$?:
    | ((
        event: CustomEvent<FormSubmitCompletedDetail<O>>,
        element: HTMLFormElement
      ) => ValueOrPromise<void>)
    | QRLEventHandlerMulti<CustomEvent<FormSubmitCompletedDetail<O>>, HTMLFormElement>
    | undefined;

  key?: string | number | null;
}

/** @public */
export const Form = <O, I>(
  { action, spaReset, reloadDocument, onSubmit$, ...rest }: FormProps<O, I>,
  key: string | null
) => {
  if (action) {
    return jsx(
      'form',
      {
        ...rest,
        action: action.actionPath,
        'preventdefault:submit': !reloadDocument,
        onSubmit$: [
          !reloadDocument ? action.submit : undefined,
          ...(Array.isArray(onSubmit$) ? onSubmit$ : [onSubmit$]),
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
  ({ action, spaReset, reloadDocument, onSubmit$, ...rest }) => {
    const nav = useNavigate();
    return (
      <form
        action="get"
        preventdefault:submit={!reloadDocument}
        data-spa-reset={spaReset ? 'true' : undefined}
        {...rest}
        onSubmit$={async (evt, form) => {
          if (onSubmit$) {
            // Execute the onSubmit$ event handler(s)
            if (Array.isArray(onSubmit$)) {
              for (const handler of onSubmit$) {
                if (typeof handler === 'function') {
                  await handler(evt, form);
                }
              }
            } else {
              await onSubmit$(evt, form);
            }
          }
          const formData = new FormData(form);
          const params = new URLSearchParams();
          formData.forEach((value, key) => {
            if (typeof value === 'string') {
              params.append(key, value);
            }
          });
          nav('?' + params.toString(), { type: 'form', forceReload: true }).then(() => {
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
          });
        }}
      >
        <Slot />
      </form>
    );
  }
);
