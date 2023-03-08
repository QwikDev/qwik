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
  let value = operation[2].value;
  switch (operation[0]) {
    case 1: {
      const prop = operation[4];
      const elm = operation[1];
      const isSVG = elm.namespaceURI === SVG_NS;
      if (prop === 'class') {
        value = serializeClassWithHost(value, tryGetContext(operation[3]));
      }
      return smartSetProperty(staticCtx, elm, prop, value, isSVG);
    }
    case 2: {
      const elm = operation[3];
      return setProperty(staticCtx, elm, 'data', jsxToString(value));
    }
  }
};
