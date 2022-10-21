import { trigger } from './element-fixture';
import { setTestPlatform } from './platform';
/**
 *
 * @alpha
 */
export const CreateMock = {
  setTestPlatform,
  triggerEvent: function (element: Element, selector: string) {
    return trigger(element, selector, 'click');
  },
};
