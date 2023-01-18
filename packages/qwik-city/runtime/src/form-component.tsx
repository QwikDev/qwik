import type { ServerActionUse } from './server-functions';
import { jsx, _wrapSignal, QwikJSX } from '@builder.io/qwik';

/**
 * @alpha
 */
export interface FormProps<T> extends Omit<QwikJSX.IntrinsicElements['form'], 'action'> {
  action: ServerActionUse<T>;
  method?: 'post';
}

/**
 * @alpha
 */
export const Form = <T,>({ action, ...rest }: FormProps<T>) => {
  return jsx('form', {
    action: action.actionPath,
    'preventdefault:submit': true,
    onSubmit$: action.run,
    ...rest,
    method: 'post',
  });
};
