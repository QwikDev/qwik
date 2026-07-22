
import { describe, it, expect } from 'vitest';
import type { JSXAttribute } from '../../../src/ast-types.js';
import {
  transformEventPropName,
  eventHandlerPropName,
  isEventProp,
  isPassiveDirective,
  collectPassiveDirectives,
} from '../../../src/optimizer/jsx/event-handlers.js';

function jsxAttr(name: string): JSXAttribute {
  return {
    type: 'JSXAttribute',
    name: { type: 'JSXIdentifier', name, start: 0, end: 0 },
    value: null,
    start: 0,
    end: 0,
  };
}

describe('event-handler-transform', () => {
  describe('isEventProp', () => {
    it('returns true for onClick$', () => {
      expect(isEventProp('onClick$')).toBe(true);
    });

    it('returns true for onDblClick$', () => {
      expect(isEventProp('onDblClick$')).toBe(true);
    });

    it('returns true for document:onFocus$', () => {
      expect(isEventProp('document:onFocus$')).toBe(true);
    });

    it('returns true for window:onClick$', () => {
      expect(isEventProp('window:onClick$')).toBe(true);
    });

    it('returns true for host:onClick$', () => {
      expect(isEventProp('host:onClick$')).toBe(true);
    });

    it('returns true for on-anotherCustom$', () => {
      expect(isEventProp('on-anotherCustom$')).toBe(true);
    });

    it('returns false for custom$ (not an on* event handler)', () => {
      expect(isEventProp('custom$')).toBe(false);
    });

    it('returns false for class', () => {
      expect(isEventProp('class')).toBe(false);
    });

    it('returns false for transparent$ (not on* prefix)', () => {
      expect(isEventProp('transparent$')).toBe(false);
    });

    it('returns false for regular prop without $', () => {
      expect(isEventProp('value')).toBe(false);
    });
  });

  describe('isPassiveDirective', () => {
    it('returns true for passive:click', () => {
      expect(isPassiveDirective('passive:click')).toBe(true);
    });

    it('returns true for passive:scroll', () => {
      expect(isPassiveDirective('passive:scroll')).toBe(true);
    });

    it('returns false for onClick$', () => {
      expect(isPassiveDirective('onClick$')).toBe(false);
    });

    it('returns false for class', () => {
      expect(isPassiveDirective('class')).toBe(false);
    });
  });

  describe('transformEventPropName', () => {
    const noPassive = new Set<string>();

    it('transforms onClick$ to q-e:click', () => {
      expect(transformEventPropName('onClick$', noPassive)).toBe('q-e:click');
    });

    it('transforms onDblClick$ to q-e:dblclick', () => {
      expect(transformEventPropName('onDblClick$', noPassive)).toBe('q-e:dblclick');
    });

    it('transforms document:onFocus$ to q-d:focus', () => {
      expect(transformEventPropName('document:onFocus$', noPassive)).toBe('q-d:focus');
    });

    it('transforms window:onClick$ to q-w:click', () => {
      expect(transformEventPropName('window:onClick$', noPassive)).toBe('q-w:click');
    });

    it('transforms on-anotherCustom$ to q-e:another-custom', () => {
      expect(transformEventPropName('on-anotherCustom$', noPassive)).toBe('q-e:another-custom');
    });

    it('transforms onDocument:keyup$ to q-e:document:keyup', () => {
      expect(transformEventPropName('onDocument:keyup$', noPassive)).toBe('q-e:document:keyup');
    });

    it('transforms onWindow:keyup$ to q-e:window:keyup', () => {
      expect(transformEventPropName('onWindow:keyup$', noPassive)).toBe('q-e:window:keyup');
    });

    it('returns null for host:onClick$ (passthrough)', () => {
      expect(transformEventPropName('host:onClick$', noPassive)).toBeNull();
    });

    it('transforms onDocumentScroll$ to q-e:documentscroll', () => {
      expect(transformEventPropName('onDocumentScroll$', noPassive)).toBe('q-e:documentscroll');
    });

    it('transforms onDocument-sCroll$ to q-e:document--scroll', () => {
      expect(transformEventPropName('onDocument-sCroll$', noPassive)).toBe('q-e:document--scroll');
    });

    it('transforms on-cLick$ to q-e:c-lick', () => {
      expect(transformEventPropName('on-cLick$', noPassive)).toBe('q-e:c-lick');
    });

    it('transforms onBlur$ to q-e:blur', () => {
      expect(transformEventPropName('onBlur$', noPassive)).toBe('q-e:blur');
    });

    it('returns null for custom$ (non-event $ prop, passthrough)', () => {
      expect(transformEventPropName('custom$', noPassive)).toBeNull();
    });

    it('transforms onClick$ with passive:click to q-ep:click', () => {
      const passive = new Set(['click']);
      expect(transformEventPropName('onClick$', passive)).toBe('q-ep:click');
    });

    it('transforms window:onScroll$ with passive:scroll to q-wp:scroll', () => {
      const passive = new Set(['scroll']);
      expect(transformEventPropName('window:onScroll$', passive)).toBe('q-wp:scroll');
    });

    it('transforms document:onTouchStart$ with passive:touchstart to q-dp:touchstart', () => {
      const passive = new Set(['touchstart']);
      expect(transformEventPropName('document:onTouchStart$', passive)).toBe('q-dp:touchstart');
    });
  });

  describe('collectPassiveDirectives', () => {
    it('collects passive:click from attributes', () => {
      const attrs = [jsxAttr('passive:click'), jsxAttr('onClick$')];
      expect(collectPassiveDirectives(attrs)).toEqual(new Set(['click']));
    });

    it('collects multiple passive directives', () => {
      const attrs = [jsxAttr('passive:scroll'), jsxAttr('passive:touchstart')];
      expect(collectPassiveDirectives(attrs)).toEqual(new Set(['scroll', 'touchstart']));
    });

    it('returns empty set when no passive directives', () => {
      const attrs = [jsxAttr('onClick$')];
      expect(collectPassiveDirectives(attrs)).toEqual(new Set());
    });
  });

  describe('eventHandlerPropName', () => {
    it('keeps the author-form name for component-element events', () => {
      expect(eventHandlerPropName('onClick$', true, new Set())).toBe('onClick$');
    });

    it('serializes HTML-element events to the q-*: form', () => {
      expect(eventHandlerPropName('onClick$', false, new Set())).toBe('q-e:click');
    });

    it('applies the passive prefix variant from the passive set', () => {
      expect(eventHandlerPropName('onScroll$', false, new Set(['scroll']))).toBe('q-ep:scroll');
    });

    it('falls back to the raw name when the transform declines', () => {
      expect(eventHandlerPropName('host:onClick$', false, new Set())).toBe('host:onClick$');
    });
  });
});
