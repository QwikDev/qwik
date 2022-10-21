import { trigger } from './element-fixture';
import type { ElementFixture } from './element-fixture';
import { setTestPlatform } from './platform';
/**
 *
 * @alpha
 */
export const CreateMock = {
  triggerEvent: function (element: ElementFixture, selector: string) {
    setTestPlatform();
    return trigger(element.host, selector, 'click');
  },
};
