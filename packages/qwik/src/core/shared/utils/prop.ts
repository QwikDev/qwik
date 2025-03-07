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
import { createEventName, parseEventNameFromIndex, isJsxPropertyAnEventName } from './event-names';
import { NON_SERIALIZABLE_MARKER_PREFIX, QDefaultSlot, Q_PREFIX } from './markers';

const propNameToId = new Map<string | symbol, NumericPropKey>();
export const idToPropName: (string | symbol)[] = [null!];
export type NumericPropKey = number & { __brand__: 'NumericPropKey' };

const colonOnLength = ':on'.length;

export const getPropId = (name: string | symbol): NumericPropKey => {
  let id = propNameToId.get(name);
  if (id) {
    return id;
  }
  id = idToPropName.length as NumericPropKey;
  if (typeof name === 'string' && isJsxPropertyAnEventName(name)) {
    name = normalizeEvent(name);
  }
  idToPropName.push(name);
  propNameToId.set(name, id);
  return id;
};

function normalizeEvent(name: string): string {
  const index = name.indexOf(':on');
  const scope = (name.substring(0, index) || undefined) as 'window' | 'document' | undefined;
  const eventName = parseEventNameFromIndex(name, index + colonOnLength);
  name = createEventName(eventName, scope) as KnownEventNames;
  return name;
}

export const getPropName = <T extends string>(id: NumericPropKey): T => {
  return idToPropName[id] as T;
};

export function isSlotProp(numericProp: NumericPropKey): boolean {
  const prop = idToPropName[numericProp] as string;
  return !prop.startsWith(Q_PREFIX) && !prop.startsWith(NON_SERIALIZABLE_MARKER_PREFIX);
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
