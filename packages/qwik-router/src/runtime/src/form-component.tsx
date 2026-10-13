import {
  jsx,
  component$,
  Slot,
  $,
  isDev,
  type QRLEventHandlerMulti,
  type QwikJSX,
} from '@qwik.dev/core';
import type { ActionStore } from './types';
import { useNavigate } from './use-functions';

/** @public */
export interface FormSubmitCompletedDetail<T> {
  status: number;
  value: T;
}

/** @public */
export type FormProps<O, I> = Omit<QwikJSX.IntrinsicElements['form'], 'action' | 'method'> & {
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

  /** Event handler executed right after the action is executed successfully and returns some data. */
  onSubmitCompleted$?:
    | QRLEventHandlerMulti<CustomEvent<FormSubmitCompletedDetail<O>>, HTMLFormElement>
    | undefined;

  key?: string | number | null;
} & (
    | {
        /** Reference to the action returned by `action()`. */
        action: ActionStore<O, I, true | false>;
        method?: never;
      }
    | {
        action?: never;
        /** Submit the form as a GET navigation. */
        method: 'get';
      }
  );

/** @public */
export const Form = <O, I>(props: FormProps<O, I>, key: string | null) => {
  const { action, method, spaReset, reloadDocument, onSubmit$, ...rest } = props;

  if (isDev) {
    if (action && method === 'get') {
      throw new Error(
        'Form cannot use both an action and method="get". Choose one, or use a native <form> when handling submission manually.'
      );
    }
    if (!action && method !== 'get') {
      throw new Error(
        'Form requires either an action or method="get". Use a native <form> when handling submission manually.'
      );
    }
  }

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
          // Since v2, this fires before the action is executed so it can be prevented
          onSubmit$,
          // action.submit "submitcompleted" event for onSubmitCompleted$ events
          !reloadDocument ? action.submit : undefined,
        ],
        method: 'post',
        ['data-spa-reset']: spaReset ? 'true' : undefined,
      },
      key
    );
  }

  return (
    <GetForm
      key={key}
      method="get"
      spaReset={spaReset}
      reloadDocument={reloadDocument}
      onSubmit$={onSubmit$}
      {...(rest as any)}
    />
  );
};

export const GetForm = component$<FormProps<undefined, undefined>>(
  ({ action: _0, method: _1, spaReset, reloadDocument, onSubmit$, ...rest }) => {
    const nav = useNavigate();
    return (
      <form
        method="get"
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
