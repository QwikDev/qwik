import { EffectProperty, WrappedSignal } from '../../signal/signal';
import { trackSignalAndAssignHost } from '../../use/use-core';
import {
  createPropsProxy,
  directGetPropsProxyProp,
  type Props,
  type PropsProxy,
} from '../jsx/jsx-runtime';
import type { JSXNodeInternal } from '../jsx/types/jsx-node';
import type { Container, HostElement } from '../types';
import { _CONST_PROPS, _VAR_PROPS } from './constants';
import { QDefaultSlot } from './markers';
import {
  NumericFlagsShift,
  NumericPropKeyFlags,
  getPropId,
  getPropName,
  type NumericPropKey,
} from './numeric-prop-key';

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
