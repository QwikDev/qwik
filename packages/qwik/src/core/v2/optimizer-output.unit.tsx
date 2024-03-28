/**
 * @file
 *
 *   These tests emulate the output of the optimizer. The optimizer does not run in unit tests, and so
 *   these tests call the internal JSX methods directly instead of relying on the JSX syntax.
 */

import { Fragment as Component, Fragment as Signal } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { _CONST_PROPS, _jsxC } from '../internal';
import { useSignal } from '../use/use-signal';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import type { fixMeAny } from './shared/types';
import './vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe(render.name + ': optimizer output', () => {
    it('should handle immutable props', async () => {
      (globalThis as any).log = [] as string[];
      const MyCmp = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        (globalThis as any).log.push('render');
        return (
          <button
            data-text="TEXT"
            data-idx={3}
            class={['abc', { xyz: true }]}
            onClick$={() => {
              (globalThis as any).log.push('click');
              count.value++;
            }}
          >
            {count.value}
          </button>
        );
      });

      const { vNode, document } = await render(<MyCmp initial={123} />, { debug });
      const button = document.querySelector('button')!;
      expect((globalThis as any).log).toEqual(['render']);
      expect(button.getAttribute('data-text')).toEqual('TEXT');
      expect(button.getAttribute('data-idx')).toEqual('3');
      expect(button.getAttribute('class')).toEqual('abc xyz');
      expect(vNode).toMatchVDOM(
        <Component>
          <button data-text="TEXT" data-idx="3" class="abc xyz">
            <Signal>123</Signal>
          </button>
        </Component>
      );
      (globalThis as any).log.length = 0;
      await trigger(document.body, 'button', 'click');
      expect((globalThis as any).log).toEqual(['click']);
      expect(button.getAttribute('data-text')).toEqual('TEXT');
      expect(button.getAttribute('data-idx')).toEqual('3');
      expect(button.getAttribute('class')).toEqual('abc xyz');
      expect(vNode).toMatchVDOM(
        <Component>
          <button data-text="TEXT" data-idx="3" class="abc xyz">
            <Signal>124</Signal>
          </button>
        </Component>
      );
      (globalThis as any).log.length = 0;
    });
    it('should handle immutable props on component', async () => {
      const Child = component$<{ name: string; num: number }>((props) => (
        <b>
          {props.name}={props.num}
        </b>
      ));
      const MyCmp = component$(() => {
        return (
          <button>{_jsxC(Child as fixMeAny, null, { name: 'NAME', num: 123 }, 3, null)}</button>
        );
      });

      const { vNode } = await render(<MyCmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Component>
              <b>
                {'NAME'}={'123'}
              </b>
            </Component>
          </button>
        </Component>
      );
    });
  });
});
