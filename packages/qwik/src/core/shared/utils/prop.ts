import { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import { EffectProperty } from '../../reactive-primitives/types';
import { trackSignalAndAssignHost } from '../../use/use-core';
import { JSXNodeImpl } from '../jsx/jsx-node';
import { type Props } from '../jsx/jsx-runtime';
import { createPropsProxy, directGetPropsProxyProp, type PropsProxy } from '../jsx/props-proxy';
import type { JSXNodeInternal } from '../jsx/types/jsx-node';
import type { Container, HostElement } from '../types';
import { _CONST_PROPS, _VAR_PROPS } from './constants';
import { NON_SERIALIZABLE_MARKER_PREFIX, QDefaultSlot } from './markers';

const _hasOwnProperty = Object.prototype.hasOwnProperty;

export function isSlotProp(prop: string): boolean {
  return !prop.startsWith('q:') && !prop.startsWith(NON_SERIALIZABLE_MARKER_PREFIX);
}

/** @internal */
export const _restProps = (props: PropsProxy, omit: string[] = [], target: Props = {}) => {
  let constPropsTarget: Props | null = null;
  const constProps = props[_CONST_PROPS];
  if (constProps) {
    for (const key in constProps) {
      if (!omit.includes(key)) {
        constPropsTarget ||= {};
        constPropsTarget[key] = constProps[key];
      }
    }
  }
  const varPropsTarget: Props = target;
  const varProps = props[_VAR_PROPS];
  for (const key in varProps) {
    if (!omit.includes(key)) {
      varPropsTarget[key] = varProps[key];
    }
  }

  return createPropsProxy(new JSXNodeImpl(null, varPropsTarget, constPropsTarget, null, 0, null));
};

export function resolveSlotName(
  host: HostElement | null,
  jsx: JSXNodeInternal,
  container: Container
): string {
  const constProps = jsx.constProps;
  if (constProps && typeof constProps == 'object' && _hasOwnProperty.call(constProps, 'name')) {
    const constValue = constProps.name;
    if (host && constValue instanceof WrappedSignalImpl) {
      return trackSignalAndAssignHost(constValue, host, EffectProperty.COMPONENT, container);
    }
  }
  return directGetPropsProxyProp(jsx, 'name') || QDefaultSlot;
}
