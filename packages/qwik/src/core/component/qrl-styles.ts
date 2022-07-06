import { ComponentStylesPrefixContent, ComponentStylesPrefixHost } from '../util/markers';
import { hashCode } from '../util/hash_code';
import type { QRL } from '../import/qrl.public';

/**
 * @public
 */
export const styleKey = (qStyles: QRL<string>, index: number): string => {
  return `${hashCode(qStyles.getHash())}-${index}`;
};

/**
 * @public
 */
export const styleHost = (styleId: string): string => {
  return ComponentStylesPrefixHost + styleId;
};

/**
 * @public
 */
export const styleContent = (styleId: string): string => {
  return ComponentStylesPrefixContent + styleId;
};
