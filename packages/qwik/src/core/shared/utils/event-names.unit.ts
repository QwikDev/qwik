import { describe, it, expect } from 'vitest';
import {
  jsxEventToHtmlAttribute,
  htmlAttributeToJsxEvent,
  getEventNameFromJsxEvent,
  getEventNameFromHtmlAttribute,
} from './event-names';

/**
 * Test cases for event conversion utilities.
 *
 * - Jsx: JSX event property name
 * - Html: HTML attribute name
 * - EventName: Event name extracted from the JSX event property
 * - JsxFromHtml: JSX event property name extracted from the HTML attribute, because sometimes we are
 *   unable to convert it back to the original JSX event property name
 */
const testCases = [
  // default scope
  { jsx: 'onClick$', html: 'on:click', eventName: 'click' },
  { jsx: 'onDblClick$', html: 'on:dblclick', eventName: 'dblclick', jsxFromHtml: 'onDblclick$' },
  {
    jsx: 'on-customEvent$',
    html: 'on:custom-event',
    eventName: 'customEvent',
    jsxFromHtml: 'onCustomEvent$',
  },
  { jsx: 'on-CustomEvent$', html: 'on:-custom-event', eventName: 'CustomEvent' },
  {
    jsx: 'onCustom-Event$',
    html: 'on:custom--event',
    eventName: 'custom-event',
    jsxFromHtml: 'onCustom-event$',
  },
  { jsx: 'on-Custom-Event$', html: 'on:-custom---event', eventName: 'Custom-Event' },
  { jsx: 'on-Custom-event$', html: 'on:-custom--event', eventName: 'Custom-event' },
  { jsx: 'onCustom-event$', html: 'on:custom--event', eventName: 'custom-event' },
  {
    jsx: 'on-custom-event$',
    html: 'on:custom--event',
    eventName: 'custom-event',
    jsxFromHtml: 'onCustom-event$',
  },
  { jsx: 'on--CustomEvent$', html: 'on:---custom-event', eventName: '-CustomEvent' },
  // exception for DOMContentLoaded
  { jsx: 'onDOMContentLoaded$', html: 'on:-d-o-m-content-loaded', eventName: 'DOMContentLoaded' },
  // window scope
  { jsx: 'window:onLoad$', html: 'on-window:load', eventName: 'load' },
  { jsx: 'window:onUnload$', html: 'on-window:unload', eventName: 'unload' },
  // document scope
  { jsx: 'document:onLoad$', html: 'on-document:load', eventName: 'load' },
  { jsx: 'document:onUnload$', html: 'on-document:unload', eventName: 'unload' },
];

describe('Event conversion utilities', () => {
  describe.each(testCases)('jsxEventToHtmlAttribute', (test) => {
    it(`should convert ${test.jsx} to ${test.html}`, () => {
      expect(jsxEventToHtmlAttribute(test.jsx)).toBe(test.html);
    });
  });

  describe.each(testCases)('htmlAttributeToJsxEvent', (test) => {
    it(`should convert ${test.html} to ${test.jsxFromHtml || test.jsx}`, () => {
      expect(htmlAttributeToJsxEvent(test.html)).toBe(test.jsxFromHtml || test.jsx);
    });
  });

  describe.each(testCases)('getEventNameFromJsxEvent', (test) => {
    it(`should extract "${test.eventName}" from ${test.jsx}`, () => {
      expect(getEventNameFromJsxEvent(test.jsx)).toBe(test.eventName);
    });
  });

  describe.each(testCases)('getEventNameFromHtmlAttribute', (test) => {
    it(`should extract "${test.eventName}" from ${test.html}`, () => {
      expect(getEventNameFromHtmlAttribute(test.html)).toBe(test.eventName);
    });
  });
});
