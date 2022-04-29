import type { QRLInternal } from '../import/qrl-class';
import { ComponentStylesPrefixContent, ComponentStylesPrefixHost } from '../util/markers';
import { hashCode } from '../util/hash_code';

/**
 * @public
 */
export function styleKey(qStyles: QRLInternal<string>): string;
export function styleKey(qStyles: QRLInternal<string> | null): string | null;
export function styleKey(qStyles: QRLInternal<string> | null): string | null {
  return qStyles && String(hashCode(qStyles.symbol));
}

/**
 * @public
 */
export function styleHost(styleId: string): string;
export function styleHost(styleId: string | undefined): string | undefined;
export function styleHost(styleId: string | undefined): string | undefined {
  return styleId && ComponentStylesPrefixHost + styleId;
}

/**
 * @public
 */
export function styleContent(styleId: string): string;
export function styleContent(styleId: string | undefined): string | undefined;
export function styleContent(styleId: string | undefined): string | undefined {
  return styleId && ComponentStylesPrefixContent + styleId;
}
