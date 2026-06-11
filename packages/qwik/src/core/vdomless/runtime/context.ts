import { QError, qError } from '../../shared/error/error';
import { verifySerializable } from '../../shared/serdes/verify';
import { qDev } from '../../shared/utils/qdev';
import { isObject } from '../../shared/utils/types';
import { createContextScope } from './context-scope';
import { getActiveInvokeContext, invoke } from './invoke-context';

export interface ContextId<STATE> {
  readonly __brand_context_type__: STATE;
  readonly id: string;
}

export interface CreateContext {
  <STATE, T>(context: ContextId<STATE>, transformer: (value: STATE | undefined) => T): T;
  <STATE, T>(context: ContextId<STATE>, defaultValue: T): STATE | T;
  <STATE>(context: ContextId<STATE>): STATE;
}

const CONTEXT_NOT_FOUND = Symbol();

export const createContextProvider = <STATE>(context: ContextId<STATE>, value: STATE): void => {
  if (qDev) {
    validateContext(context);
    verifySerializable(value);
  }

  const invokeContext = getActiveInvokeContext();
  let scope = invokeContext.localContextScope;
  if (scope === null) {
    scope = createContextScope(invokeContext.contextScope);
    invokeContext.localContextScope = scope;
    invokeContext.contextScope = scope;
  }

  scope.values.set(context.id, value);
};

export const createContext: CreateContext = <STATE, T>(
  context: ContextId<STATE>,
  defaultValue?: T | ((current: STATE | undefined) => T)
) => {
  if (qDev) {
    validateContext(context);
  }

  const resolved = resolveContextValue(context);
  if (typeof defaultValue === 'function') {
    const invokeContext = getActiveInvokeContext();
    return invoke(
      invokeContext,
      defaultValue as (current: STATE | undefined) => T,
      resolved === CONTEXT_NOT_FOUND ? undefined : resolved
    );
  }
  if (resolved !== CONTEXT_NOT_FOUND) {
    return resolved;
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw qError(QError.notFoundContext, [context.id]);
};

const resolveContextValue = <STATE>(
  context: ContextId<STATE>
): STATE | undefined | typeof CONTEXT_NOT_FOUND => {
  let scope = getActiveInvokeContext().contextScope;

  while (scope !== null) {
    if (scope.values.has(context.id)) {
      return scope.values.get(context.id) as STATE | undefined;
    }
    scope = scope.parent;
  }

  return CONTEXT_NOT_FOUND;
};

const validateContext = (context: ContextId<any>) => {
  if (!isObject(context) || typeof context.id !== 'string' || context.id.length === 0) {
    throw qError(QError.invalidContext, [context]);
  }
};
