import type { ServerActionUtils } from './server-functions';
import { jsx, _wrapSignal, QwikJSX } from '@builder.io/qwik';

/**
 * @alpha
 */
export interface FormProps<T> extends Omit<QwikJSX.IntrinsicElements['form'], 'action'> {
  action: ServerActionUtils<T>;
  method?: 'post';
}

/**
 * @alpha
 */
export const Form = <T,>({ action, ...rest }: FormProps<T>) => {
  return jsx('form', {
    action: action.actionPath,
    'preventdefault:submit': true,
    onSubmit$: action.execute,
    ...rest,
    method: 'post',
  });
};
