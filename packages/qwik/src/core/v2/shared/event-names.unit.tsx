import { describe, it, expect } from 'vitest';
import {
  convertEventNameFromHtmlAttrToJsxProp,
  convertEventNameFromJsxPropToHtmlAttr,
  getEventNameFromHtmlAttr,
  getEventNameFromJsxProp,
} from './event-names';

describe('event-names', () => {
  describe('getEventNameFromHtmlAttr', () => {
    it('1', () => expect(getEventNameFromHtmlAttr('on:--click')).toEqual('-click'));
    it('2', () => expect(getEventNameFromHtmlAttr('on:-dblclick')).toEqual('Dblclick'));
  });
  describe('getEventNameFromJsxProp', () => {
    it('1', () => expect(getEventNameFromJsxProp('on--click$')).toEqual('-click'));
    it('2', () => expect(getEventNameFromJsxProp('on-Dblclick$')).toEqual('Dblclick'));
  });
  describe('convertEventNameFromHtmlAttrToJsxProp', () => {
    it('1', () =>
      expect(convertEventNameFromJsxPropToHtmlAttr('on---click$')).toEqual('on:---click'));
    it('2', () =>
      expect(convertEventNameFromJsxPropToHtmlAttr('on-Dblclick$')).toEqual('on:-dblclick'));
  });
  describe('convertEventNameFromJsxPropToHtmlAttr', () => {
    it('1', () =>
      expect(convertEventNameFromHtmlAttrToJsxProp('on:-dblclick')).toEqual('on-Dblclick$'));
  });
  // it.only('test', () => {
  //   expectMatch('on--click$', 'on:--click', '-click');
  // });

  it('should convert prefix', () => {
    expectMatch('onClick$', 'on:click', 'click');
    expectMatch('window:onClick$', 'on-window:click', 'click');
    expectMatch('document:onClick$', 'on-document:click', 'click');
  });
  describe('v1 behavior', () => {
    it('should match one word', () => {
      expectMatch('onClick$', 'on:click', 'click');
      expectMatch('onclick$', 'on:click', 'click');
      expectMatch('on-click$', 'on:click', 'click');

      // DIVERGENCE:
      // expectMatch('on--click$', 'on:-click', 'Click'); // v1 behavior
      expectMatch('on--click$', 'on:--click', '-click'); // v2 behavior

      // DIVERGENCE:
      // expectMatch('on---click$', 'on:--click', '-click'); // v1 behavior
      expectMatch('on---click$', 'on:---click', '-Click'); // v2 behavior

      expectMatch('on--Click$', 'on:--click', '-click');
      expectMatch('on---Click$', 'on:---click', '-Click');
    });
    it('should match two words', () => {
      expectMatch('onDblClick$', 'on:dblclick', 'dblclick');
      expectMatch('ondblclick$', 'on:dblclick', 'dblclick');
      expectMatch('on-dblclick$', 'on:dblclick', 'dblclick');
      expectMatch('on-Dblclick$', 'on:-dblclick', 'Dblclick');
      expectMatch('on-DblClick$', 'on:-dbl-click', 'DblClick');
      expectMatch('on-Dbl-Click$', 'on:-dbl-click', 'DblClick');
      expectMatch('on-Dbl-click$', 'on:-dbl-click', 'DblClick');
      expectMatch('on-Dbl--Click$', 'on:-dbl---click', 'Dbl-Click');
      expectMatch('onDbl-Click$', 'on:dbl-click', 'dblClick');
    });
  });
  it('should convert case', () => {
    expectMatch('onHello$', 'on:hello', 'hello');
    expectMatch('onHelloWorld$', 'on:helloworld', 'helloworld');
    expectMatch('on-HelloWorld$', 'on:-hello-world', 'HelloWorld');
    expectMatch('on-HelloWorld$', 'on:-hello-world', 'HelloWorld');
    expectMatch('on-hello-world$', 'on:hello-world', 'helloWorld');
    expectMatch('on-hello-World$', 'on:hello-world', 'helloWorld');
  });
});
function expectMatch(jsxProp: string, htmlAttr: string, eventName: string) {
  expect(getEventNameFromJsxProp(jsxProp)).toEqual(eventName);
  expect(getEventNameFromHtmlAttr(convertEventNameFromJsxPropToHtmlAttr(jsxProp)!)).toEqual(
    eventName
  );
  expect(getEventNameFromJsxProp(convertEventNameFromHtmlAttrToJsxProp(htmlAttr)!)).toEqual(
    eventName
  );
}
