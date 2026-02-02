import { describe, it, expect } from 'vitest';
import { jsxEventToHtmlAttribute } from './event-names';

/**
 * Test cases for event conversion utilities.
 *
 * - Jsx: JSX event property name
 * - Html: HTML attribute name
 * - EventName: Event name extracted from the JSX event property
 */
const testCases = [
  // default scope
  { jsx: 'onClick$', html: 'q-e:click', eventName: 'click' },
  { jsx: 'onDblClick$', html: 'q-e:dblclick' },
  { jsx: 'on--CustomEvent$', html: 'q-e:---custom-event' },
  { jsx: 'on-Custom-Event$', html: 'q-e:-custom---event' },
  { jsx: 'on-custom-event$', html: 'q-e:custom--event' },
  { jsx: 'on-CustomEvent$', html: 'q-e:-custom-event' },
  { jsx: 'on-customEvent$', html: 'q-e:custom-event' },
  { jsx: 'onCustom-event$', html: 'q-e:custom--event' },
  { jsx: 'onCustom-Event$', html: 'q-e:custom--event' },
  // exception for DOMContentLoaded
  { jsx: 'onDOMContentLoaded$', html: 'q-e:-d-o-m-content-loaded' },
  // window scope
  { jsx: 'window:onLoad$', html: 'q-w:load' },
  { jsx: 'window:onUnload$', html: 'q-w:unload' },
  // document scope
  { jsx: 'document:onLoad$', html: 'q-d:load' },
  { jsx: 'document:onUnload$', html: 'q-d:unload' },
];

describe('Event conversion utilities', () => {
  describe.each(testCases)('jsxEventToHtmlAttribute', (test) => {
    it(`should convert ${test.jsx} to ${test.html}`, () => {
      expect(jsxEventToHtmlAttribute(test.jsx)).toBe(test.html);
    });
  });
});
