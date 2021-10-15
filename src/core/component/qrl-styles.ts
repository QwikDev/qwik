import type { QRL } from '../import/qrl';
import { toDevModeQRL } from '../import/qrl-test';
import { AttributeMarker } from '../util/markers';
import { qTest } from '../util/qdev';
import type { QComponent } from './q-component.public';

/**
 * @public
 */
export interface QrlStyles<COMP extends QComponent> extends QRL<COMP> {
  __brand__qrl__styles__: 'QrlStyles';
  __types__: COMP;
}

/**
 * @public
 */
// TODO(misko): Rename to qrlComponentStyles to be consistent with qrlOnRender????
export function qrlStyles<COMP extends QComponent>(styles: string): QrlStyles<COMP> {
  if (qTest) {
    return String(toDevModeQRL(styles, new Error())) as any;
  }
  return styles as unknown as QrlStyles<COMP>;
}

/**
 * @public
 */
export function styleKey(qrl: QrlStyles<any> | undefined): string | undefined {
  return qrl && String(qrl).split('#')[1];
}

/**
 * @public
 */
export function styleHost(qrl: QrlStyles<any>): string;
export function styleHost(qrl: QrlStyles<any> | undefined): string | undefined;
export function styleHost(qrl: QrlStyles<any> | undefined): string | undefined {
  return qrl && AttributeMarker.ComponentStylesPrefixHost + styleKey(qrl);
}

/**
 * @public
 */
export function styleContent(qrl: QrlStyles<any>): string;
export function styleContent(qrl: QrlStyles<any> | undefined): string | undefined;
export function styleContent(qrl: QrlStyles<any> | undefined): string | undefined {
  return qrl && AttributeMarker.ComponentStylesPrefixContent + styleKey(qrl);
}
