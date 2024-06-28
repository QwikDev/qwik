import { QSlotParent } from './markers';

export function isSlotProp(prop: string): boolean {
  return !prop.startsWith('q:');
}

export function isParentSlotProp(prop: string): boolean {
  return prop.startsWith(QSlotParent);
}
