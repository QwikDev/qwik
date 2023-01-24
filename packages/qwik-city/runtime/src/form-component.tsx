import type { ServerActionUse } from './server-functions';
import { jsx, _wrapSignal, QwikJSX, ValueOrPromise } from '@builder.io/qwik';

/**
 * @alpha
 */
export interface FormSubmitCompletedDetail<T> {
  status: number;
  value: T;
}

/**
 * @alpha
 */
export interface FormProps<T> extends Omit<QwikJSX.IntrinsicElements['form'], 'action' | 'method'> {
  action: ServerActionUse<T>;
  reloadDocument?: boolean;
  spaReset?: boolean;
  onSubmit$?: (event: Event, form: HTMLFormElement) => ValueOrPromise<void>;
  onSubmitCompleted$?: (
    event: CustomEvent<FormSubmitCompletedDetail<T>>,
    form: HTMLFormElement
  ) => ValueOrPromise<void>;
}

/**
 * @alpha
 */
export const Form = <T,>({
  action,
  spaReset,
  reloadDocument,
  onSubmit$,
  ...rest
}: FormProps<T>) => {
  return jsx('form', {
    ...rest,
    action: action.actionPath,
    'preventdefault:submit': !reloadDocument,
    onSubmit$: [!reloadDocument ? action.run : undefined, onSubmit$],
    method: 'post',
    ['data-spa-reset']: spaReset ? 'true' : undefined,
  });
};
