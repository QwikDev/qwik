import { jsx, _wrapSignal, QwikJSX, ValueOrPromise } from '@builder.io/qwik';
import type { GetFailReturn, GetValueReturn, ActionStore } from './types';

/**
 * @alpha
 */
export interface FormSubmitSuccessDetail<T> {
  status: number;
  value: GetValueReturn<T>;
}

/**
 * @alpha
 */
export interface FormSubmitFailDetail<T> {
  status: number;
  fail: GetFailReturn<T>;
}

/**
 * @alpha
 */
export interface FormProps<O, I>
  extends Omit<QwikJSX.IntrinsicElements['form'], 'action' | 'method'> {
  /**
   * Reference to the action returned by `action.use()`.
   */
  action: ActionStore<O, I>;

  /**
   * When `true` the form submission will cause a full page reload, even if SPA mode is enabled and JS is available.
   */
  reloadDocument?: boolean;

  /**
   * When `true` all the form inputs will be reset in SPA mode, just like happens in a full page form submission.
   *
   * Defaults to `false`
   */
  spaReset?: boolean;

  /**
   * Event handler executed right when the form is submitted.
   */
  onSubmit$?: (event: Event, form: HTMLFormElement) => ValueOrPromise<void>;

  /**
   * Event handler executed right after the action is executed sucesfully and returns some data.
   */
  onSubmitSuccess$?: (
    event: CustomEvent<FormSubmitSuccessDetail<O>>,
    form: HTMLFormElement
  ) => ValueOrPromise<void>;

  /**
   * Event handler executed right after the action is executed and it returns some `failed` data, such as data passed to `fail()` or validation errors from `zod$()`.
   */
  onSubmitFail$?: (
    event: CustomEvent<FormSubmitFailDetail<O>>,
    form: HTMLFormElement
  ) => ValueOrPromise<void>;
}

/**
 * @alpha
 */
export const Form = <O, I>({
  action,
  spaReset,
  reloadDocument,
  onSubmit$,
  ...rest
}: FormProps<O, I>) => {
  return jsx('form', {
    ...rest,
    action: action.actionPath,
    'preventdefault:submit': !reloadDocument,
    onSubmit$: [!reloadDocument ? action.run : undefined, onSubmit$],
    method: 'post',
    ['data-spa-reset']: spaReset ? 'true' : undefined,
  });
};
