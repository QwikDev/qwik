import { describe, it, expect } from 'vitest';
import { _jsxSorted } from './jsx-internal';
import type { QRL } from '../qrl/qrl.public';
import type { FunctionComponent } from './types/jsx-node';

const handler = () => (() => {}) as any as QRL;

describe('_jsxSorted', () => {
  describe('string tags with unconverted event props', () => {
    it('should convert onClick$ to q-e:click in varProps', () => {
      const node = _jsxSorted('button', { onClick$: handler() }, null, null, 0, null);
      expect(node.varProps['onClick$']).toBeUndefined();
      expect(node.varProps['q-e:click']).toBeDefined();
    });

    it('should convert onClick$ to q-e:click in constProps', () => {
      const node = _jsxSorted('button', null, { onClick$: handler() }, null, 0, null);
      expect(node.constProps?.['onClick$']).toBeUndefined();
      expect(node.constProps?.['q-e:click']).toBeDefined();
    });

    it('should convert window and document events', () => {
      const node = _jsxSorted(
        'button',
        { 'document:onTouchStart$': handler() },
        { 'window:onScroll$': handler() },
        null,
        0,
        null
      );
      expect(node.varProps['document:onTouchStart$']).toBeUndefined();
      expect(node.varProps['q-d:touchstart']).toBeDefined();
      expect(node.constProps?.['window:onScroll$']).toBeUndefined();
      expect(node.constProps?.['q-w:scroll']).toBeDefined();
    });

    it('should convert passive events and drop the passive marker', () => {
      const node = _jsxSorted(
        'button',
        { 'passive:click': true, onClick$: handler() },
        null,
        null,
        0,
        null
      );
      expect(node.varProps['onClick$']).toBeUndefined();
      expect(node.varProps['passive:click']).toBeUndefined();
      expect(node.varProps['q-ep:click']).toBeDefined();
    });

    it('should keep key, children and flags and flag the props for sorting', () => {
      const children = ['child'];
      const node = _jsxSorted('button', { onClick$: handler() }, null, children, 3, 'my-key');
      expect(node.key).toBe('my-key');
      expect(node.children).toBe(children);
      expect(node.flags).toBe(3);
      expect(node.toSort).toBe(true);
    });
  });

  describe('props without event conversion', () => {
    it('should pass already converted string tag props through untouched', () => {
      const varProps = { class: 'a', 'q-e:click': handler() };
      const constProps = { id: 'b' };
      const node = _jsxSorted('button', varProps, constProps, null, 0, null);
      expect(node.varProps).toBe(varProps);
      expect(node.constProps).toBe(constProps);
      expect(node.toSort).toBe(false);
    });

    it('should leave onClick$ untouched on components', () => {
      const Cmp: FunctionComponent<any> = () => null;
      const varHandler = handler();
      const constHandler = handler();
      const node = _jsxSorted(
        Cmp,
        { onClick$: varHandler },
        { 'window:onScroll$': constHandler },
        null,
        0,
        null
      );
      expect(node.varProps['onClick$']).toBe(varHandler);
      expect(node.varProps['q-e:click']).toBeUndefined();
      expect(node.constProps?.['window:onScroll$']).toBe(constHandler);
      expect(node.constProps?.['q-w:scroll']).toBeUndefined();
    });
  });
});
