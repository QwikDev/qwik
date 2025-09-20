import type { Props } from '../jsx/jsx-runtime';
import { ComponentStylesPrefixContent } from './markers';

export const styleContent = (styleId: string): string => {
  return ComponentStylesPrefixContent + styleId;
};

export function hasClassAttr(props: Props): boolean {
  return 'class' in props || 'className' in props;
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

export const addComponentStylePrefix = (styleId?: string | null): string | null => {
  if (styleId) {
    let idx = 0;
    do {
      styleId = styleId.substring(0, idx) + styleContent(styleId.substring(idx));
    } while ((idx = styleId.indexOf(' ', idx) + 1) !== 0);
  }
  return styleId || null;
};
