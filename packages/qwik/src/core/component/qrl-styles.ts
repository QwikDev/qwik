import type { QRLInternal } from '../import/qrl-class';
import { ComponentStylesPrefixContent, ComponentStylesPrefixHost } from '../util/markers';
import { hashCode } from '../util/hash_code';

/**
 * @public
 */
export function styleKey(qStyles: QRLInternal<string>, index: number): string {
  return `${hashCode(qStyles.getCanonicalSymbol())}-${index}`;
}

/**
 * @public
 */
export function styleHost(styleId: string): string {
  return ComponentStylesPrefixHost + styleId;
}

/**
 * @public
 */
export function styleContent(styleId: string): string {
  return ComponentStylesPrefixContent + styleId;
}
