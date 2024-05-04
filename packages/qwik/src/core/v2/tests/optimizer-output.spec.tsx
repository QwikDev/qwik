/**
 * @file
 *
 *   These tests emulate the output of the optimizer. The optimizer does not run in unit tests, and so
 *   these tests call the internal JSX methods directly instead of relying on the JSX syntax.
 */

import { Fragment as Component, Fragment as Signal } from '@builder.io/qwik';
import { domRender, ssrRenderToDom } from '@builder.io/qwik/testing';
import { describe, expect, it } from 'vitest';
import { trigger } from '../../../testing/element-fixture';
import '../../../testing/vdom-diff.unit-util';
import { component$ } from '../../component/component.public';
import { _jsxC } from '../../internal';
import { useSignal } from '../../use/use-signal';
import type { fixMeAny } from '../shared/types';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: optimizer output', ({ render }) => {
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
      return <button>{_jsxC(Child as fixMeAny, null, { name: 'NAME', num: 123 }, 3, null)}</button>;
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
  describe('key', () => {
    const KeyTest = component$<{ keyTrue: string | null; keyFalse: string | null }>(
      function self(props) {
        const toggle = useSignal(false);
        // console.log(self.toString());
        return (
          <button onClick$={() => (toggle.value = !toggle.value)}>
            {toggle.value ? (
              <b key={props.keyTrue} class="true">
                true
              </b>
            ) : (
              <b key={props.keyFalse} class="false">
                false
              </b>
            )}
          </button>
        );
      }
    );
    it('should reuse if no key', async () => {
      const { vNode, document } = await render(<KeyTest keyFalse={null} keyTrue={null} />, {
        debug,
      });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <b class="false">false</b>
          </button>
        </Component>
      );
      const bElement = document.querySelector('b');
      await trigger(document.body, 'button', 'click');
      const bElement2 = document.querySelector('b');
      expect(bElement2).toBe(bElement);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            {/* we would expect `class=true` but because it is immutable the system ignores
             * it and ends up with a wrong value. This is intentional.
             */}
            <b class="false">true</b>
          </button>
        </Component>
      );
    });
    it('should not reuse if different key', async () => {
      const { vNode, document } = await render(<KeyTest keyFalse={'A'} keyTrue={'B'} />, {
        debug,
      });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <b class="false" key="A">
              false
            </b>
          </button>
        </Component>
      );
      document.querySelector('b')!.setAttribute('mark', 'existing');
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <b class="true" key="B">
              true
            </b>
          </button>
        </Component>
      );
      expect(document.querySelector('b')!.hasAttribute('mark')).toBeFalsy();
    });
    it('should not reuse if different key and null', async () => {
      const { vNode, document } = await render(<KeyTest keyFalse={'A'} keyTrue={null} />, {
        debug,
      });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <b class="false" key="A">
              false
            </b>
          </button>
        </Component>
      );
      document.querySelector('b')!.setAttribute('mark', 'existing');
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <b class="true">true</b>
          </button>
        </Component>
      );
      expect(document.querySelector('b')!.hasAttribute('mark')).toBeFalsy();
    });
  });
});
