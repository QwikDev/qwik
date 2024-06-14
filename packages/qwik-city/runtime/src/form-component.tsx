import {
  jsx,
  _wrapSignal,
  component$,
  Slot,
  $,
  type QwikJSX,
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
  onSubmit$?: QRLEventHandlerMulti<SubmitEvent, HTMLFormElement> | undefined;

  /** Event handler executed right after the action is executed successfully and returns some data. */
  onSubmitCompleted$?:
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
    const isArrayApi = Array.isArray(onSubmit$);
    // if you pass an array you can choose where you want action.submit in it
    if (isArrayApi) {
      return jsx(
        'form',
        {
          ...rest,
          action: action.actionPath,
          'preventdefault:submit': !reloadDocument,
          onSubmit$: [
            ...onSubmit$,
            // action.submit "submitcompleted" event for onSubmitCompleted$ events
            !reloadDocument
              ? $((evt: SubmitEvent) => {
                  if (!action.submitted) {
                    return action.submit(evt);
                  }
                })
              : undefined,
          ],
          method: 'post',
          ['data-spa-reset']: spaReset ? 'true' : undefined,
        },
        key
      );
    }
    return jsx(
      'form',
      {
        ...rest,
        action: action.actionPath,
        'preventdefault:submit': !reloadDocument,
        onSubmit$: [
          // action.submit "submitcompleted" event for onSubmitCompleted$ events
          !reloadDocument ? action.submit : undefined,
          // TODO: v2 breaking change this should fire before the action.submit
          onSubmit$,
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
        onSubmit$={[
          ...(Array.isArray(onSubmit$) ? onSubmit$ : [onSubmit$]),
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
            //
          }),
          // end of array
        ]}
      >
        <Slot />
      </form>
    );
  }
);
