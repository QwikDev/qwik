import { getInvokeContext } from './use-core';
import { useSequentialScope } from './use-store.public';
import { setAttribute } from '../render/cursor';
import { fromCamelToKebabCase } from '../util/case';
import { getContext } from '../props/props';
import { unwrapSubscriber, wrapSubscriber } from './use-subscriber';
import { useHostElement } from './use-host-element.public';
import { QCtxAttr } from '../util/markers';
import { qError, QError_notFoundContext } from '../error/error';

/**
 * @alpha
 */
export interface Context<STATE extends object> {
  readonly id: string;
  readonly _v: STATE;
}

/**
 * @alpha
 */
export const createContext = <STATE extends object>(name: string): Context<STATE> => {
  return Object.freeze({
    id: fromCamelToKebabCase(name),
  } as any);
};

/**
 * @alpha
 */
export const useContextProvider = <STATE extends object>(
  context: Context<STATE>,
  newValue: STATE
) => {
  const [value, setValue] = useSequentialScope();
  if (value) {
    return;
  }
  const invokeContext = getInvokeContext();
  const hostElement = invokeContext.$hostElement$!;
  const renderCtx = invokeContext.$renderCtx$!;
  const ctx = getContext(hostElement);
  let contexts = ctx.$contexts$;
  if (!contexts) {
    ctx.$contexts$ = contexts = new Map();
  }
  newValue = unwrapSubscriber(newValue);
  contexts.set(context.id, newValue);

  const serializedContexts: string[] = [];
  contexts.forEach((_, key) => {
    serializedContexts.push(`${key}`);
  });
  setAttribute(renderCtx, hostElement, QCtxAttr, serializedContexts.join(' '));
  setValue(true);
};

/**
 * @alpha
 */
export const useContext = <STATE extends object>(context: Context<STATE>): STATE => {
  const value = _useContext(context);
  return wrapSubscriber(value, useHostElement());
};

const _useContext = <STATE extends object>(context: Context<STATE>): STATE => {
  const [value, setValue] = useSequentialScope();
  if (!value) {
    const invokeContext = getInvokeContext();
    let hostElement = invokeContext.$hostElement$!;
    const contexts = invokeContext.$renderCtx$!.$contexts$;
    for (let i = contexts.length - 1; i >= 0; i--) {
      const ctx = contexts[i];
      hostElement = ctx.$element$;
      if (ctx.$contexts$) {
        const found = ctx.$contexts$.get(context.id);
        if (found) {
          setValue(found);
          return found;
        }
      }
    }
    const foundEl = hostElement.closest(`[q\\:ctx*="${context.id}"]`);
    if (foundEl) {
      const value = getContext(foundEl).$contexts$!.get(context.id);
      if (value) {
        setValue(value);
        return value;
      }
    }
    throw qError(QError_notFoundContext, context.id);
  }
  return value;
};
