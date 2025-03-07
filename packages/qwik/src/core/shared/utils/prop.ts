import { EffectProperty, WrappedSignal } from '../../signal/signal';
import { trackSignalAndAssignHost } from '../../use/use-core';
import {
  createPropsProxy,
  directGetPropsProxyProp,
  type Props,
  type PropsProxy,
} from '../jsx/jsx-runtime';
import type { JSXNodeInternal } from '../jsx/types/jsx-node';
import type { KnownEventNames } from '../jsx/types/jsx-qwik-events';
import type { Container, HostElement } from '../types';
import { _CONST_PROPS, _VAR_PROPS } from './constants';
import {
  createEventName,
  parseEventNameFromIndex,
  isJsxPropertyAnEventName,
  isHtmlAttributeAnEventName,
} from './event-names';
import {
  ELEMENT_ID,
  ELEMENT_KEY,
  ELEMENT_PROPS,
  HANDLER_PREFIX,
  NON_SERIALIZABLE_MARKER_PREFIX,
  OnRenderProp,
  QDefaultSlot,
  Q_PREFIX,
  dangerouslySetInnerHTML,
  refAttr,
} from './markers';

const propNameToId = new Map<string | symbol, NumericPropKey>();
const idToPropName: (string | symbol)[] = [];
export type NumericPropKey = number & { __brand__: 'NumericPropKey' };

const colonOnLength = ':on'.length;

export const enum NumericPropKeyFlags {
  EVENT = 1,
  Q_PREFIX = 2,
  HANDLER_PREFIX = 4,
  SLOT = 8,
}

export const NumericFlagsShift = 4;

export const getPropId = (name: string | symbol): NumericPropKey => {
  let id = propNameToId.get(name);
  if (id != null) {
    return id;
  }
  id = (idToPropName.length << NumericFlagsShift) as NumericPropKey;
  if (typeof name === 'string') {
    if (isJsxPropertyAnEventName(name)) {
      name = normalizeEvent(name);
      (id as number) |= NumericPropKeyFlags.EVENT;
    } else if (isHtmlAttributeAnEventName(name)) {
      (id as number) |= NumericPropKeyFlags.EVENT;
    } else if (name.startsWith(Q_PREFIX)) {
      (id as number) |= NumericPropKeyFlags.Q_PREFIX;
    } else if (name.startsWith(HANDLER_PREFIX)) {
      (id as number) |= NumericPropKeyFlags.HANDLER_PREFIX;
    }

    if (!name.startsWith(Q_PREFIX) && !name.startsWith(NON_SERIALIZABLE_MARKER_PREFIX)) {
      (id as number) |= NumericPropKeyFlags.SLOT;
    }
  }
  idToPropName.push(name);
  propNameToId.set(name, id);
  return id;
};

export const StaticPropId = {
  // ELEMENT_KEY should be always first, because of `getKey` in vnode_diff.ts
  ELEMENT_KEY: getPropId(ELEMENT_KEY),
  ELEMENT_ID: getPropId(ELEMENT_ID),
  ELEMENT_PROPS: getPropId(ELEMENT_PROPS),
  REF: getPropId(refAttr),
  INNERHTML: getPropId(dangerouslySetInnerHTML),
  VALUE: getPropId('value'),
  ON_RENDER: getPropId(OnRenderProp),
  CLASS: getPropId('class'),
  CLASS_NAME: getPropId('classname'),
};

export const getPropName = <T extends string>(id: NumericPropKey): T => {
  return idToPropName[id >> NumericFlagsShift] as T;
};

function normalizeEvent(name: string): string {
  const index = name.indexOf(':on');
  const scope = (name.substring(0, index) || undefined) as 'window' | 'document' | undefined;
  const eventName = parseEventNameFromIndex(name, index + colonOnLength);
  name = createEventName(eventName, scope) as KnownEventNames;
  return name;
}

function getFlags(id: number) {
  return ((1 << NumericFlagsShift) - 1) & (id >> 0);
}

export function isEventProp(numericProp: NumericPropKey): boolean {
  return (getFlags(numericProp) & NumericPropKeyFlags.EVENT) !== 0;
}

export function isQProp(numericProp: NumericPropKey): boolean {
  return (getFlags(numericProp) & NumericPropKeyFlags.Q_PREFIX) !== 0;
}

export function isHandlerProp(numericProp: NumericPropKey): boolean {
  return (getFlags(numericProp) & NumericPropKeyFlags.HANDLER_PREFIX) !== 0;
}

export function isSlotProp(numericProp: NumericPropKey): boolean {
  return (getFlags(numericProp) & NumericPropKeyFlags.SLOT) !== 0;
}

export function getSlotName(
  host: HostElement | null,
  jsx: JSXNodeInternal,
  container: Container
): string {
  const constProps = jsx.constProps;
  const nameId = getPropId('name');
  if (host && constProps && typeof constProps === 'object' && nameId in constProps) {
    const constValue = constProps[nameId];
    if (constValue instanceof WrappedSignal) {
      return trackSignalAndAssignHost(constValue, host, EffectProperty.COMPONENT, container);
    }
  }
  return directGetPropsProxyProp(jsx, 'name') || QDefaultSlot;
}

/** @internal */
export const _restProps = (props: PropsProxy, omit: string[], target: Props = {}) => {
  let constPropsTarget: Props | null = null;
  const constProps = props[_CONST_PROPS];
  if (constProps) {
    for (const key in constProps) {
      if (!omit.includes(getPropName(key as unknown as NumericPropKey))) {
        constPropsTarget ||= {};
        constPropsTarget[key] = constProps[key];
      }
    }
  }
  const varPropsTarget: Props = target;
  const varProps = props[_VAR_PROPS];
  for (const key in varProps) {
    if (!omit.includes(getPropName(key as unknown as NumericPropKey))) {
      varPropsTarget[key] = varProps[key];
    }
  }

  return createPropsProxy(varPropsTarget, constPropsTarget);
};

export const __testing__ = {
  propNameToId,
  idToPropName,
};
