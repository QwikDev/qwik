import type { Props } from '../../render/jsx/jsx-runtime';
import { styleContent } from '../../style/qrl-styles';

export function hasClassAttr(props: Props): boolean {
  for (const key in props) {
    if (Object.prototype.hasOwnProperty.call(props, key) && isClassAttr(key)) {
      return true;
    }
  }
  return false;
}

export function isClassAttr(key: string): boolean {
  return key === 'class' || key === 'className';
}

export function getScopedStyleIdsAsPrefix(scopedStyleIds: Set<string>): string {
  return Array.from(scopedStyleIds)
    .map((styleId) => styleContent(styleId))
    .join(' ');
}

export function convertScopedStyleIdsToArray(scopedStyleIds?: string | null): Array<string> | null {
  return scopedStyleIds?.split(' ') ?? null;
}

export function convertStyleIdsToString(scopedStyleIds: Set<string>): string {
  return Array.from(scopedStyleIds).join(' ');
}

export function addPrefixForScopedStyleIdsString(scopedStyleId: string): string {
  return scopedStyleId.split(' ').map(styleContent).join(' ');
}
