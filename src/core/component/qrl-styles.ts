import type { QRL } from '../import/qrl';
import { AttributeMarker } from '../util/markers';
import { hashCode } from '../util/hash_code';

/**
 * @public
 */
export function styleKey(qStyles: QRL<string>): string;
export function styleKey(qStyles: QRL<string> | null): string | null;
export function styleKey(qStyles: QRL<string> | null): string | null {
  return qStyles && String(hashCode(qStyles.symbol));
}

/**
 * @public
 */
export function styleHost(styleId: string): string;
export function styleHost(styleId: string | undefined): string | undefined;
export function styleHost(styleId: string | undefined): string | undefined {
  return styleId && AttributeMarker.ComponentStylesPrefixHost + styleId;
}

/**
 * @public
 */
export function styleContent(styleId: string): string;
export function styleContent(styleId: string | undefined): string | undefined;
export function styleContent(styleId: string | undefined): string | undefined {
  return styleId && AttributeMarker.ComponentStylesPrefixContent + styleId;
}
