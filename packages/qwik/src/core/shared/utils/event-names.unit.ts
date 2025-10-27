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
  { jsx: 'onClick$', html: 'on:click', eventName: 'click' },
  { jsx: 'onDblClick$', html: 'on:dblclick' },
  { jsx: 'on--CustomEvent$', html: 'on:---custom-event' },
  { jsx: 'on-Custom-Event$', html: 'on:-custom---event' },
  { jsx: 'on-custom-event$', html: 'on:custom--event' },
  { jsx: 'on-CustomEvent$', html: 'on:-custom-event' },
  { jsx: 'on-customEvent$', html: 'on:custom-event' },
  { jsx: 'onCustom-event$', html: 'on:custom--event' },
  { jsx: 'onCustom-Event$', html: 'on:custom--event' },
  // exception for DOMContentLoaded
  { jsx: 'onDOMContentLoaded$', html: 'on:-d-o-m-content-loaded' },
  // window scope
  { jsx: 'window:onLoad$', html: 'on-window:load' },
  { jsx: 'window:onUnload$', html: 'on-window:unload' },
  // document scope
  { jsx: 'document:onLoad$', html: 'on-document:load' },
  { jsx: 'document:onUnload$', html: 'on-document:unload' },
];

describe('Event conversion utilities', () => {
  describe.each(testCases)('jsxEventToHtmlAttribute', (test) => {
    it(`should convert ${test.jsx} to ${test.html}`, () => {
      expect(jsxEventToHtmlAttribute(test.jsx)).toBe(test.html);
    });
  });
});
