import { trigger } from './element-fixture';
import { setTestPlatform } from './platform';

/**
 * convenience: events...
 * userEvent.click(#element)
 */
const userEvent = {
  click: function (element: Element) {
    const classListValue = element.classList.value
      .split(' ')
      .map((c) => `.${c}`)
      .join('');
    return trigger(element, `${element.tagName}${classListValue}`, 'click');
  },
  dbClick: function (element: Element) {
    const queueEvent = [];
  },
};

/**
 *
 * @alpha
 */
export const CreateMock = {
  userEvent,
  // userEvent.click(screen.getByRole('button'))
  setTestPlatform,
  triggerEvent: function (element: Element, selector: string) {
    return trigger(element, selector, 'click');
  },
};
