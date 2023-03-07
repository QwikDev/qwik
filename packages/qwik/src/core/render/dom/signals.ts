import type { SubscriberSignal } from '../../state/common';
import { tryGetContext } from '../../state/context';
import { jsxToString, serializeClass } from '../execute-component';
import type { RenderStaticContext } from '../types';
import { setProperty } from './operations';
import { smartSetProperty, SVG_NS } from './visitor';

export const executeSignalOperation = (
  staticCtx: RenderStaticContext,
  operation: SubscriberSignal
) => {
  let value = operation[2].value;
  switch (operation[0]) {
    case 1: {
      const prop = operation[4];
      const elm = operation[3];
      const ctx = tryGetContext(elm);
      const isSVG = elm.namespaceURI === SVG_NS;
      let oldValue = undefined;
      if (prop === 'class') {
        value = serializeClass(value);
      }
      if (ctx && ctx.$vdom$) {
        const normalizedProp = isSVG ? prop : prop.toLowerCase();
        oldValue = ctx.$vdom$.$props$[normalizedProp];
        ctx.$vdom$.$props$[normalizedProp] = value;
      }
      return smartSetProperty(staticCtx, elm, prop, value, oldValue, isSVG);
    }
    case 2: {
      const elm = operation[3];
      return setProperty(staticCtx, elm, 'data', jsxToString(value));
    }
  }
};
