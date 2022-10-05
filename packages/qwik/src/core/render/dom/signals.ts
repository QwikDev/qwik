import { tryGetContext } from '../../props/props';
import type { SubscriberSignal } from '../container';
import type { RenderStaticContext } from '../types';
import { setProperty } from './operations';
import { smartSetProperty } from './visitor';

export const executeSignalOperation = (
  staticCtx: RenderStaticContext,
  operation: SubscriberSignal
) => {
  const prop = operation[5] ?? 'value';
  const value = operation[2][prop];
  switch (operation[0]) {
    case 1: {
      const prop = operation[4];
      const elm = operation[3];
      const ctx = tryGetContext(elm);
      let oldValue = undefined;
      if (ctx && ctx.$vdom$) {
        const normalizedProp = prop.toLowerCase();
        oldValue = ctx.$vdom$.$props$[normalizedProp];
        ctx.$vdom$.$props$[normalizedProp] = value;
      }
      return smartSetProperty(staticCtx, elm, prop, value, oldValue);
    }
    case 2:
      return setProperty(staticCtx, operation[3], 'data', value);
  }
};
