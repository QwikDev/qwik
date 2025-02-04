import { processDirectProps, type PropsProxy } from '../jsx/jsx-runtime';
import { _CONST_PROPS, _VAR_PROPS } from './constants';
import { NON_SERIALIZABLE_MARKER_PREFIX, QSlotParent } from './markers';

export function isSlotProp(prop: string): boolean {
  return !prop.startsWith('q:') && !prop.startsWith(NON_SERIALIZABLE_MARKER_PREFIX);
}

export function isParentSlotProp(prop: string): boolean {
  return prop.startsWith(QSlotParent);
}

/** @internal */
export const _restProps = (props: PropsProxy, omit: string[], target = {}) => {
  processDirectProps(props, (key, value) => {
    if (!omit.includes(key)) {
      (target as any)[key] = value;
    }
  });
  return target;
};
