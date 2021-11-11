import type { QRL } from '../import/qrl';
import { toDevModeQRL } from '../import/qrl-test';
import { AttributeMarker } from '../util/markers';
import { qTest } from '../util/qdev';
import { hashCode } from '../util/hash_code';
import type { QComponent } from './q-component.public';

/**
 * @public
 */
export interface QStyles<COMP extends QComponent> extends QRL<COMP> {
  __brand__qrl__styles__: 'QrlStyles';
  __types__: COMP;
}

/**
 * @public
 */
export function qStyles<COMP extends QComponent>(styles: string): QStyles<COMP> {
  if (qTest) {
    return String(toDevModeQRL(styles, new Error())) as any;
  }
  return styles as unknown as QStyles<COMP>;
}

/**
 * @public
 */
export function styleKey(qStyles: QStyles<any> | undefined): string | undefined {
  return qStyles && String(hashCode(String(qStyles)));
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
