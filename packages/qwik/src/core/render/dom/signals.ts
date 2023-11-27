import { getLastSubscription, type SubscriberSignal } from '../../state/common';
import { getContext, tryGetContext } from '../../state/context';
import { trackSignal } from '../../use/use-core';
import { logError } from '../../util/log';
import { serializeClassWithHost, stringifyStyle } from '../execute-component';
import type { RenderContext } from '../types';
import { insertBefore, removeNode } from './operations';
import { getVdom, processData, type ProcessedJSXNode } from './render-dom';
import type { QwikElement } from './virtual-element';
import { SVG_NS, createElm, diffVnode, getVnodeFromEl, smartSetProperty } from './visitor';
import { Virtual, JSXNodeImpl } from '../jsx/jsx-runtime';
import { isPromise } from '../../util/promises';
import { isQwikElement } from '../../util/element';

export const executeSignalOperation = (rCtx: RenderContext, operation: SubscriberSignal) => {
  try {
    const type = operation[0];
    const staticCtx = rCtx.$static$;
    switch (type) {
      case 1:
      case 2: {
        let elm;
        let hostElm;
        if (type === 1) {
          elm = operation[1];
          hostElm = operation[3];
        } else {
          elm = operation[3];
          hostElm = operation[1];
        }
        // assertTrue(elm.isConnected, 'element must be connected to the dom');
        // assertTrue(hostElm.isConnected, 'host element must be connected to the dom');
        const elCtx = tryGetContext(elm);
        if (elCtx == null) {
          return;
        }
        const prop = operation[4];
        const isSVG = elm.namespaceURI === SVG_NS;
        staticCtx.$containerState$.$subsManager$.$clearSignal$(operation);
        let value = trackSignal(operation[2], operation.slice(0, -1) as any) as any;
        if (prop === 'class') {
          value = serializeClassWithHost(value, tryGetContext(hostElm));
        } else if (prop === 'style') {
          value = stringifyStyle(value);
        }
        const vdom = getVdom(elCtx);
        if (prop in vdom.$props$ && vdom.$props$[prop] === value) {
          return;
        }
        vdom.$props$[prop] = value;
        return smartSetProperty(staticCtx, elm, prop, value, isSVG);
      }
      case 3:
      case 4: {
        const elm = operation[3];
        if (!staticCtx.$visited$.includes(elm)) {
          // assertTrue(elm.isConnected, 'text node must be connected to the dom');
          staticCtx.$containerState$.$subsManager$.$clearSignal$(operation);
          // MISKO: I believe no `invocationContext` is OK because the JSX in signal
          // has already been converted to JSX and there is nothing to execute there.
          const invocationContext = undefined;
          let signalValue = trackSignal(operation[2], operation.slice(0, -1) as any);
          const subscription = getLastSubscription()!;

          if (Array.isArray(signalValue)) {
            signalValue = new JSXNodeImpl<typeof Virtual>(Virtual, {}, null, signalValue, 0, null);
          }
          let newVnode = processData(signalValue, invocationContext) as
            | ProcessedJSXNode
            | undefined;
          if (isPromise(newVnode)) {
            logError('Rendering promises in JSX signals is not supported');
          } else {
            if (newVnode === undefined) {
              newVnode = processData('', invocationContext) as ProcessedJSXNode;
            }
            const oldVnode = getVnodeFromEl(elm);
            const element = getQwikElement(operation[1]);
            rCtx.$cmpCtx$ = getContext(element, rCtx.$static$.$containerState$);
            if (
              oldVnode.$type$ == newVnode.$type$ &&
              oldVnode.$key$ == newVnode.$key$ &&
              oldVnode.$id$ == newVnode.$id$
            ) {
              diffVnode(rCtx, oldVnode, newVnode, 0);
            } else {
              const promises: Promise<any>[] = []; // TODO(misko): hook this up
              const oldNode = oldVnode.$elm$;
              const newElm = createElm(rCtx, newVnode, 0, promises);
              if (promises.length) {
                logError('Rendering promises in JSX signals is not supported');
              }
              subscription[3] = newElm;
              insertBefore(rCtx.$static$, elm.parentElement!, newElm, oldNode);
              oldNode && removeNode(staticCtx, oldNode);
            }
          }
        }
      }
    }
  } catch (e) {
    // Ignore
  }
};
function getQwikElement(element: QwikElement | Text): QwikElement {
  while (element) {
    if (isQwikElement(element)) {
      return element;
    }
    element = element.parentElement!;
  }
  throw new Error('Not found');
}
