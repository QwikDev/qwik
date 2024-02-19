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
import type { ValueOrPromise } from '../../util/types';
import { throwErrorAndStop } from '../../util/log';
import {
  convertEventNameFromJsxPropToHtmlAttr,
  isJsxPropertyAnEventName,
} from '../shared/event-names';

/**
 * We support Promises in JSX but we don't expose this in the public API because it breaks signal
 * tracking after the first await.
 */
type JSXValue = ValueOrPromise<JSXOutput>;
export async function ssrRenderToContainer(ssr: SSRContainer, jsx: JSXValue) {
  ssr.openContainer();
  await asyncWalkJSX(ssr, jsx);
  ssr.closeContainer();
}

type StackFn = () => void | Promise<void>;
type StackValue = JSXValue | StackFn | typeof Promise;
export function asyncWalkJSX(
  ssr: SSRContainer,
  value: JSXValue,
  sync?: never | false
): Promise<void>;
export function asyncWalkJSX(ssr: SSRContainer, value: JSXOutput, sync?: true): false;
export function asyncWalkJSX(
  ssr: SSRContainer,
  value: JSXValue,
  sync?: boolean
): Promise<void> | false {
  const stack: StackValue[] = [value];
  let resolveDrain: () => void;
  let rejectDrain: (reason: any) => void;
  const drained =
    !sync &&
    new Promise<void>((res, rej) => {
      resolveDrain = res;
      rejectDrain = rej;
    });
  const enqueue = (value: JSXValue, closingValue?: StackFn) => {
    if (closingValue != null) {
      stack.push(closingValue);
    }
    stack.push(value);
    if (isPromise(value)) {
      stack.push(Promise);
    }
  };
  const resolveValue = (value: JSXOutput) => {
    stack.push(value);
    drain();
  };
  const drain = (): void => {
    while (stack.length) {
      const value = stack.pop();
      if (typeof value === 'function') {
        if (value === Promise) {
          if (sync) {
            return throwErrorAndStop('Promises not expected here.');
          }
          (stack.pop() as Promise<JSXOutput>).then(resolveValue, rejectDrain);
          return;
        }
        if (sync && (isQwikComponent(value) || value === ssr.closeProjection)) {
          // don't expand components because they might return Promise values
          // don't close projections QUESTION @mhevery why?
          continue;
        }
        const waitOn = (value as StackFn).apply(ssr);
        if (waitOn) {
          if (sync) {
            return throwErrorAndStop('Promises not expected here.');
          }
          waitOn.then(drain, rejectDrain);
          return;
        }
        continue;
      } else if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          // push in reverse order so we process in the original order
          for (let i = value.length - 1; i >= 0; --i) {
            stack.push(value[i]);
          }
          continue;
        }
      }
      processJSXNode(ssr, enqueue, value);
    }
    if (stack.length === 0 && !sync) {
      resolveDrain();
    }
  };
  drain();
  return drained;
}

export const syncWalkJSX = (ssr: SSRContainer, value: JSXOutput) => asyncWalkJSX(ssr, value, true);

function processJSXNode(
  ssr: SSRContainer,
  enqueue: (value: JSXValue, closingValue?: StackFn) => void,
  value: JSXValue
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
      ssr.openFragment(EMPTY_ARRAY);
      const signalNode = ssr.getLastNode() as fixMeAny;
      // TODO(mhevery): It is unclear to me why we need to serialize host for SignalDerived.
      // const host = ssr.getComponentFrame(0)!.componentNode as fixMeAny;
      const host = signalNode;
      enqueue(
        trackSignal(value, [SubscriptionType.TEXT_MUTABLE, host, value, signalNode]),
        ssr.closeFragment
      );
    } else if (isPromise(value)) {
      ssr.openFragment(EMPTY_ARRAY);
      enqueue(value, ssr.closeFragment);
    } else {
      const jsx = value as JSXNode;
      const type = jsx.type;
      // Below, JSXChildren allows functions and regexes, but we assume the dev only uses those as appropriate.
      if (typeof type === 'string') {
        ssr.openElement(type, toSsrAttrs(jsx.props, ssr.serializationCtx));
        enqueue(jsx.children as JSXOutput, ssr.closeElement);
      } else if (typeof type === 'function') {
        if (type === Fragment) {
          ssr.openFragment(toSsrAttrs(jsx.props, ssr.serializationCtx));
          // In theory we could get functions or regexes, but we assume all is well
          enqueue(jsx.children as JSXOutput, ssr.closeFragment);
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
          enqueue(slotChildren as JSXOutput, ssr.closeProjection);
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
      if (isJsxPropertyAnEventName(key)) {
        let value: string | null = null;
        const qrls = record[key];
        if (Array.isArray(qrls)) {
          for (let i = 0; i <= qrls.length; i++) {
            const qrl = qrls[i];
            if (isQrl(qrl)) {
              const first = i === 0;
              value = (first ? '' : value + '\n') + qrlToString(qrl, serializationCtx.$addRoot$);
            }
          }
        } else if (isQrl(qrls)) {
          value = qrlToString(qrls, serializationCtx.$addRoot$);
        }
        if (isJsxPropertyAnEventName(key)) {
          value && ssrAttrs.push(convertEventNameFromJsxPropToHtmlAttr(key), value);
        }
      } else {
        if (key !== 'children') {
          ssrAttrs.push(key, String(record[key]));
        }
      }
    }
  }
  return ssrAttrs;
}
