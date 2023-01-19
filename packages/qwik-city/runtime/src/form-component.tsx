import type { ServerActionUse } from './server-functions';
import { jsx, _wrapSignal, QwikJSX, PropFunction } from '@builder.io/qwik';

/**
 * @alpha
 */
export interface FormProps<T> extends Omit<QwikJSX.IntrinsicElements['form'], 'action'> {
  action: ServerActionUse<T>;
  method?: 'post';
  onSubmit$?: PropFunction<(event: Event) => void>;
  reloadDocument?: boolean;
  spaReset?: boolean;
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
