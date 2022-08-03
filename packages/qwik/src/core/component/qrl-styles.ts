import { ComponentStylesPrefixContent } from '../util/markers';
import { hashCode } from '../util/hash_code';
import type { QRL } from '../import/qrl.public';

export const styleKey = (qStyles: QRL<string>, index: number): string => {
  return `${hashCode(qStyles.getHash())}-${index}`;
};

export const styleHost = (styleId: string): string => {
  return styleId;
};

export const styleContent = (styleId: string): string => {
  return ComponentStylesPrefixContent + styleId;
};

export const serializeSStyle = (scopeIds: string[]) => {
  return scopeIds.join(' ');
};
