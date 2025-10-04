import { createPropsProxy, type Props, type PropsProxy } from '../jsx/jsx-runtime';
import { _CONST_PROPS, _VAR_PROPS } from './constants';
import { NON_SERIALIZABLE_MARKER_PREFIX } from './markers';

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

  return createPropsProxy(varPropsTarget, constPropsTarget);
};
