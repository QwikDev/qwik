import { NON_SERIALIZABLE_MARKER_PREFIX, QSlotParent } from './markers';

export function isSlotProp(prop: string): boolean {
  return !prop.startsWith('q:') && !prop.startsWith(NON_SERIALIZABLE_MARKER_PREFIX);
}

export function isParentSlotProp(prop: string): boolean {
  return prop.startsWith(QSlotParent);
}
