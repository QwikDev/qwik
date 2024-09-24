import { QSlotParent } from './markers';

export function isSlotProp(prop: string): boolean {
  return !prop.startsWith('q:');
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
