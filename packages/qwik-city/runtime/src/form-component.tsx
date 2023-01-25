import type { GetFailReturn, GetValueReturn, ServerActionUse } from './server-functions';
import { jsx, _wrapSignal, QwikJSX, ValueOrPromise } from '@builder.io/qwik';

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
  action: ServerActionUse<O, I>;
  reloadDocument?: boolean;
  spaReset?: boolean;
  onSubmit$?: (event: Event, form: HTMLFormElement) => ValueOrPromise<void>;
  onSubmitSuccess$?: (
    event: CustomEvent<FormSubmitSuccessDetail<O>>,
    form: HTMLFormElement
  ) => ValueOrPromise<void>;
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
