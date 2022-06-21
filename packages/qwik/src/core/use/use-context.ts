import { useSequentialScope } from './use-store.public';
import { setAttribute } from '../render/cursor';
import { fromCamelToKebabCase } from '../util/case';
import { getContext } from '../props/props';
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
  const { get, set, ctx } = useSequentialScope<boolean>();
  if (get) {
    return;
  }
  const hostElement = ctx.$hostElement$!;
  const renderCtx = ctx.$renderCtx$!;
  const hostCtx = getContext(hostElement);
  let contexts = hostCtx.$contexts$;
  if (!contexts) {
    hostCtx.$contexts$ = contexts = new Map();
  }
  contexts.set(context.id, newValue);

  const serializedContexts: string[] = [];
  contexts.forEach((_, key) => {
    serializedContexts.push(`${key}`);
  });
  setAttribute(renderCtx, hostElement, QCtxAttr, serializedContexts.join(' '));
  set(true);
};

/**
 * @alpha
 */
export const useContext = <STATE extends object>(context: Context<STATE>): STATE => {
  const { get, set, ctx } = useSequentialScope<STATE>();
  if (get) {
    return get;
  }
  let hostElement = ctx.$hostElement$;
  const contexts = ctx.$renderCtx$.$contexts$;
  for (let i = contexts.length - 1; i >= 0; i--) {
    const ctx = contexts[i];
    hostElement = ctx.$element$;
    if (ctx.$contexts$) {
      const found = ctx.$contexts$.get(context.id);
      if (found) {
        set(found);
        return found;
      }
    }
  }
  const foundEl = hostElement.closest(`[q\\:ctx*="${context.id}"]`);
  if (foundEl) {
    const value = getContext(foundEl).$contexts$!.get(context.id);
    if (value) {
      set(value);
      return value;
    }
  }
  throw qError(QError_notFoundContext, context.id);
};
