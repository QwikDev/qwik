import { NON_SERIALIZABLE_MARKER_PREFIX, QSlotParent } from './markers';

export function isSlotProp(prop: string): boolean {
  return !prop.startsWith('q:') && !prop.startsWith(NON_SERIALIZABLE_MARKER_PREFIX);
}

export function isParentSlotProp(prop: string): boolean {
  return prop.startsWith(QSlotParent);
}

/** @internal */
export const _restProps = (props: Record<string, any>, omit: string[], target = {}) => {
  for (const key in props) {
    if (!omit.includes(key)) {
      (target as any)[key] = props[key];
    }
  }
  return target;
};
