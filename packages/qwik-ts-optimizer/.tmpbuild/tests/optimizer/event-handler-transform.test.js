/**
 * Tests for event handler prop naming transformation.
 *
 * Verified against snapshot corpus:
 * - should_convert_jsx_events.snap
 * - example_jsx_listeners.snap
 * - should_convert_passive_jsx_events.snap
 */
import { describe, it, expect } from 'vitest';
import { transformEventPropName, isEventProp, isPassiveDirective, camelToKebab, collectPassiveDirectives, } from '../../src/optimizer/event-handler-transform.js';
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
            // custom$ stays as "custom$" key in constProps (passthrough, not event naming)
            expect(isEventProp('custom$')).toBe(false);
        });
        it('returns false for class', () => {
            expect(isEventProp('class')).toBe(false);
        });
        it('returns false for transparent$ (not on* prefix)', () => {
            // Actually custom$ is true (ends with $ and is a JSX event handler).
            // But transparent$ doesn't start with on and has no scope prefix.
            // Looking at snapshot: custom$ IS treated as an event handler.
            // The real rule is: ends with $ in JSX attribute context.
            // isEventProp should detect props that get event-style naming.
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
    describe('camelToKebab', () => {
        it('converts anotherCustom to another-custom', () => {
            expect(camelToKebab('anotherCustom')).toBe('another-custom');
        });
        it('converts cLick to c-lick', () => {
            expect(camelToKebab('cLick')).toBe('c-lick');
        });
        it('converts sCroll to s-croll', () => {
            // onDocument-sCroll$ => strip on, has dash -> "Document-sCroll" -> kebab
            expect(camelToKebab('sCroll')).toBe('s-croll');
        });
        it('keeps lowercase strings unchanged', () => {
            expect(camelToKebab('click')).toBe('click');
        });
        it('converts DblClick to dbl-click', () => {
            expect(camelToKebab('DblClick')).toBe('dbl-click');
        });
    });
    describe('transformEventPropName', () => {
        const noPassive = new Set();
        // EVT-01: onClick$ -> q-e:click
        it('transforms onClick$ to q-e:click', () => {
            expect(transformEventPropName('onClick$', noPassive)).toBe('q-e:click');
        });
        // onDblClick$ -> q-e:dblclick (lowercase, not kebab)
        it('transforms onDblClick$ to q-e:dblclick', () => {
            expect(transformEventPropName('onDblClick$', noPassive)).toBe('q-e:dblclick');
        });
        // EVT-02: document:onFocus$ -> q-d:focus
        it('transforms document:onFocus$ to q-d:focus', () => {
            expect(transformEventPropName('document:onFocus$', noPassive)).toBe('q-d:focus');
        });
        // EVT-03: window:onClick$ -> q-w:click
        it('transforms window:onClick$ to q-w:click', () => {
            expect(transformEventPropName('window:onClick$', noPassive)).toBe('q-w:click');
        });
        // EVT-04: on-anotherCustom$ -> q-e:another-custom (kebab-case)
        it('transforms on-anotherCustom$ to q-e:another-custom', () => {
            expect(transformEventPropName('on-anotherCustom$', noPassive)).toBe('q-e:another-custom');
        });
        // onDocument:keyup$ -> q-e:document:keyup (multi-scope)
        it('transforms onDocument:keyup$ to q-e:document:keyup', () => {
            expect(transformEventPropName('onDocument:keyup$', noPassive)).toBe('q-e:document:keyup');
        });
        // onWindow:keyup$ -> q-e:window:keyup (multi-scope)
        it('transforms onWindow:keyup$ to q-e:window:keyup', () => {
            expect(transformEventPropName('onWindow:keyup$', noPassive)).toBe('q-e:window:keyup');
        });
        // host:onClick$ -> passthrough (returns null to indicate no transform)
        it('returns null for host:onClick$ (passthrough)', () => {
            expect(transformEventPropName('host:onClick$', noPassive)).toBeNull();
        });
        // onDocumentScroll$ -> q-e:documentscroll (camelCase becomes lowercase)
        it('transforms onDocumentScroll$ to q-e:documentscroll', () => {
            expect(transformEventPropName('onDocumentScroll$', noPassive)).toBe('q-e:documentscroll');
        });
        // onDocument-sCroll$ -> q-e:document--scroll (dash preserved, kebab-case)
        it('transforms onDocument-sCroll$ to q-e:document--scroll', () => {
            expect(transformEventPropName('onDocument-sCroll$', noPassive)).toBe('q-e:document--scroll');
        });
        // on-cLick$ -> q-e:c-lick
        it('transforms on-cLick$ to q-e:c-lick', () => {
            expect(transformEventPropName('on-cLick$', noPassive)).toBe('q-e:c-lick');
        });
        // onBlur$ -> q-e:blur
        it('transforms onBlur$ to q-e:blur', () => {
            expect(transformEventPropName('onBlur$', noPassive)).toBe('q-e:blur');
        });
        // custom$ -> passes through as custom$ (not an on* handler)
        it('returns null for custom$ (non-event $ prop, passthrough)', () => {
            // Looking at the snapshot: custom$ stays as "custom$" prop key
            // But from the snap, it's actually kept as "custom$" in constProps
            // So transformEventPropName should return null (no transform needed)
            expect(transformEventPropName('custom$', noPassive)).toBeNull();
        });
        // EVT-05: Passive events
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
            const attrs = [
                { type: 'JSXAttribute', name: { type: 'JSXIdentifier', name: 'passive:click' }, value: null },
                { type: 'JSXAttribute', name: { type: 'JSXIdentifier', name: 'onClick$' }, value: {} },
            ];
            expect(collectPassiveDirectives(attrs)).toEqual(new Set(['click']));
        });
        it('collects multiple passive directives', () => {
            const attrs = [
                { type: 'JSXAttribute', name: { type: 'JSXIdentifier', name: 'passive:scroll' }, value: null },
                { type: 'JSXAttribute', name: { type: 'JSXIdentifier', name: 'passive:touchstart' }, value: null },
            ];
            expect(collectPassiveDirectives(attrs)).toEqual(new Set(['scroll', 'touchstart']));
        });
        it('returns empty set when no passive directives', () => {
            const attrs = [
                { type: 'JSXAttribute', name: { type: 'JSXIdentifier', name: 'onClick$' }, value: {} },
            ];
            expect(collectPassiveDirectives(attrs)).toEqual(new Set());
        });
    });
});
//# sourceMappingURL=event-handler-transform.test.js.map