import { getInvokeContext } from './use-core';
import { useSequentialScope } from './use-store.public';
import { setAttribute } from '../render/cursor';
import { fromCamelToKebabCase } from '../util/case';
import { getContext } from '../props/props';
import { unwrapSubscriber, wrapSubscriber } from './use-subscriber';
import { useHostElement } from './use-host-element.public';
import { QCtxAttr } from '../util/markers';

/**
 * @alpha
 */
export interface Context<STATE extends object> {
  readonly id: string;
  readonly _value: STATE;
}

/**
 * @alpha
 */
export function createContext<STATE extends object>(name: string): Context<STATE> {
  return Object.freeze({
    id: fromCamelToKebabCase(name),
  } as any);
}

/**
 * @alpha
 */
export function useContextProvider<STATE extends object>(context: Context<STATE>, newValue: STATE) {
  const [value, setValue] = useSequentialScope();
  if (!value) {
    const invokeContext = getInvokeContext();
    const hostElement = invokeContext.hostElement!;
    const renderCtx = invokeContext.renderCtx!;
    const ctx = getContext(hostElement);
    let contexts = ctx.contexts;
    if (!contexts) {
      ctx.contexts = contexts = new Map();
    }
    newValue = unwrapSubscriber(newValue);
    contexts.set(context.id, newValue);

    const serializedContexts: string[] = [];
    contexts.forEach((value, key) => {
      serializedContexts.push(`${key}=${ctx.refMap.indexOf(value)}`);
    });
    setAttribute(renderCtx, hostElement, QCtxAttr, serializedContexts.join(' '));
    setValue(newValue);
  }
}

/**
 * @alpha
 */
export function useContext<STATE extends object>(context: Context<STATE>): STATE {
  const value = _useContext(context);
  return wrapSubscriber(value, useHostElement());
}

export function _useContext<STATE extends object>(context: Context<STATE>): STATE {
  const [value, setValue] = useSequentialScope();
  if (!value) {
    const invokeContext = getInvokeContext();
    let hostElement = invokeContext.hostElement!;
    const components = invokeContext.renderCtx!.components;
    for (let i = components.length - 1; i >= 0; i--) {
      hostElement = components[i].hostElement;
      const ctx = getContext(components[i].hostElement);
      if (ctx.contexts) {
        const found = ctx.contexts.get(context.id);
        if (found) {
          setValue(found);
          return found;
        }
      }
    }
    const foundEl = hostElement.closest(`[q\\:ctx*="${context.id}="]`);
    if (foundEl) {
      const value = getContext(foundEl).contexts!.get(context.id);
      if (value) {
        setValue(value);
        return value;
      }
    }
    throw new Error(`not found state for useContext: ${context.id}`);
  }
  return value;
}
