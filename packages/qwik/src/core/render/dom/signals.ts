import type { SubscriberSignal } from '../../state/common';
import { tryGetContext } from '../../state/context';
import { jsxToString, serializeClassWithHost } from '../execute-component';
import type { RenderStaticContext } from '../types';
import { setProperty } from './operations';
import { smartSetProperty, SVG_NS } from './visitor';

export const executeSignalOperation = (
  staticCtx: RenderStaticContext,
  operation: SubscriberSignal
) => {
  try {
    switch (operation[0]) {
      case 1: {
        const elm = operation[1];
        if (tryGetContext(elm) == null) {
          return;
        }
        const prop = operation[4];
        const isSVG = elm.namespaceURI === SVG_NS;
        let value = operation[2].value;
        if (prop === 'class') {
          value = serializeClassWithHost(value, tryGetContext(operation[3]));
        }
        return smartSetProperty(staticCtx, elm, prop, value, isSVG);
      }
      case 2: {
        const elm = operation[3];
        if (!staticCtx.$visited$.includes(elm)) {
          const value = operation[2].value;
          return setProperty(staticCtx, elm, 'data', jsxToString(value));
        }
      }
    }
  } catch (e) {
    // Ignore
  }
};
