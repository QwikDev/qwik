import { isPromise } from 'util/types';
import { isQwikComponent } from '../../component/component.public';
import { isQrl } from '../../qrl/qrl-class';
import { Fragment } from '../../render/jsx/jsx-runtime';
import { Slot } from '../../render/jsx/slot.public';
import type { FunctionComponent, JSXNode, JSXOutput } from '../../render/jsx/types/jsx-node';
import type { JSXChildren } from '../../render/jsx/types/jsx-qwik-attributes';
import { SubscriptionType } from '../../state/common';
import { isSignal } from '../../state/signal';
import { trackSignal } from '../../use/use-core';
import { EMPTY_ARRAY } from '../../util/flyweight';
import { qrlToString, type SerializationContext } from '../shared/shared-serialization';
import type { fixMeAny } from '../shared/types';
import { applyInlineComponent, applyQwikComponentBody } from './ssr-render-component';
import type { SSRContainer, SsrAttrs } from './types';

export async function ssrRenderToContainer(ssr: SSRContainer, jsx: JSXOutput) {
  ssr.openContainer();
  await asyncWalkJSX(ssr, jsx);
  ssr.closeContainer();
}

export function asyncWalkJSX(ssr: SSRContainer, value: any): Promise<void> {
  const stack: any[] = [value];
  let resolveDrain: () => void;
  let rejectDrain: (reason: any) => void;
  const drained = new Promise<void>((res, rej) => {
    resolveDrain = res;
    rejectDrain = rej;
  });
  const enqueue = (value: any, closingValue?: Function) => {
    if (closingValue != null) {
      stack.push(closingValue);
    }
    stack.push(value);
    if (isPromise(value)) {
      stack.push(Promise);
    }
  };
  const resolveValue = (value: any) => {
    stack.push(value);
    drain();
  };
  const drain = () => {
    while (stack.length) {
      const value = stack.pop();
      if (typeof value === 'function') {
        if (value === ssr.closeElement) {
          const waitOn = ssr.closeElement();
          if (waitOn) {
            return waitOn.then(resolveValue, rejectDrain);
          }
          continue;
        } else if (value === ssr.closeFragment) {
          ssr.closeFragment();
          continue;
        } else if (value === ssr.closeComponent) {
          ssr.closeComponent();
          continue;
        } else if (value === ssr.closeProjection) {
          ssr.closeProjection();
          continue;
        } else if (value === Promise) {
          stack.pop().then(resolveValue, rejectDrain);
          break;
        }
      } else if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          for (let i = value.length - 1; i >= 0; --i) {
            stack.push(value[i]);
          }
          continue;
        }
      }
      processJSXNode(ssr, enqueue, value);
    }
    if (stack.length === 0) {
      resolveDrain();
    }
  };
  drain();
  return drained;
}

// TODO(misko): can we dedupe with `asyncWalkJSX`
export function syncWalkJSX(ssr: SSRContainer, value: any) {
  const stack: any[] = [value];
  const enqueue = (value: any, closingValue?: Function) => {
    if (closingValue != null) {
      stack.push(closingValue);
    }
    stack.push(value);
  };
  const drain = () => {
    while (stack.length) {
      const value = stack.pop();
      if (typeof value === 'function') {
        if (value === ssr.closeElement) {
          ssr.closeElement();
          continue;
        } else if (value === ssr.closeFragment) {
          ssr.closeFragment();
          continue;
        } else if (value === ssr.closeComponent) {
          ssr.closeComponent();
          continue;
        } else if (isQwikComponent(value)) {
          // don't expand components;
          continue;
        }
      } else if (typeof value === 'object' && value !== null) {
        if (isPromise(value)) {
          throw new Error('Promises not expected here.');
        } else if (Array.isArray(value)) {
          for (let i = value.length - 1; i >= 0; --i) {
            stack.push(value[i]);
          }
          continue;
        }
      }
      processJSXNode(ssr, enqueue, value);
    }
  };
  drain();
}

function processJSXNode(
  ssr: SSRContainer,
  enqueue: (value: any, closingValue?: Function) => void,
  value: any
) {
  // console.log('processJSXNode', value);
  if (value === null || value === undefined) {
    ssr.textNode('');
  } else if (typeof value === 'boolean') {
    ssr.textNode('');
  } else if (typeof value === 'number') {
    ssr.textNode(String(value));
  } else if (typeof value === 'string') {
    ssr.textNode(value);
  } else if (typeof value === 'object') {
    if (isSignal(value)) {
      const signal = value!;
      ssr.openFragment(EMPTY_ARRAY);
      const signalNode = ssr.getLastNode() as fixMeAny;
      // TODO(mhevery): It is unclear to me why we need to serialize host for SignalDerived.
      // const host = ssr.getComponentFrame(0)!.componentNode as fixMeAny;
      const host = signalNode;
      enqueue(
        trackSignal(value, [SubscriptionType.TEXT_MUTABLE, host, signal, signalNode]),
        ssr.closeFragment
      );
    } else if (isPromise(value)) {
      ssr.openFragment(EMPTY_ARRAY);
      enqueue(value, ssr.closeFragment);
    } else {
      const jsx = value as JSXNode;
      const type = jsx.type;
      if (typeof type === 'string') {
        ssr.openElement(type, toSsrAttrs(jsx.props, ssr.serializationCtx));
        enqueue(jsx.children, ssr.closeElement);
      } else if (typeof type === 'function') {
        if (type === Fragment) {
          ssr.openFragment(toSsrAttrs(jsx.props, ssr.serializationCtx));
          enqueue(jsx.children, ssr.closeFragment);
        } else if (type === Slot) {
          const currentFrame = ssr.getComponentFrame(0)!;
          const componentFrame = ssr.getComponentFrame(currentFrame.projectionDepth)!;
          ssr.openProjection([':', componentFrame.componentNode.id]);
          const node = ssr.getLastNode();
          const slotName = String(jsx.props.name || '');
          const slotDefaultChildren = (jsx.props.children || null) as JSXChildren | null;
          const slotChildren =
            componentFrame.consumeChildrenForSlot(node, slotName) || slotDefaultChildren;
          if (slotDefaultChildren && slotChildren !== slotDefaultChildren) {
            ssr.addUnclaimedProjection(node, '', slotDefaultChildren);
          }
          enqueue(slotChildren, ssr.closeProjection);
        } else if (isQwikComponent(type)) {
          ssr.openComponent([]);
          ssr.getComponentFrame(0)!.distributeChildrenIntoSlots(jsx.children);
          enqueue(applyQwikComponentBody(ssr, jsx, type), ssr.closeComponent);
        } else {
          enqueue(applyInlineComponent(type as FunctionComponent, jsx));
        }
      }
    }
  }
}

export function toSsrAttrs(
  record: Record<string, unknown>,
  serializationCtx: SerializationContext
): SsrAttrs {
  const ssrAttrs: SsrAttrs = [];
  for (const key in record) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      if (key.startsWith('on') && key.endsWith('$')) {
        let value: string | null = null;
        const qrls = record[key];
        if (Array.isArray(qrls)) {
          for (const qrl of qrls) {
            if (isQrl(qrl)) {
              value = qrlToString(qrl, serializationCtx.$addRoot$);
              break;
            }
          }
        } else if (isQrl(qrls)) {
          value = qrlToString(qrls, serializationCtx.$addRoot$);
        }
        const event = key.slice(2, -1).toLowerCase();
        value && ssrAttrs.push('on:' + event, value);
      } else {
        if (key !== 'children') {
          ssrAttrs.push(key, String(record[key]));
        }
      }
    }
  }
  return ssrAttrs;
}
