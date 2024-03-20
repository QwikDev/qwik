/**
 * @file
 *
 *   These tests emulate the output of the optimizer. The optimizer does not run in unit tests, and so
 *   these tests call the internal JSX methods directly instead of relying on the JSX syntax.
 */

import { Fragment as Component } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { _IMMUTABLE, _jsxC, _jsxQ } from '../internal';
import { inlinedQrl } from '../qrl/qrl';
import { useLexicalScope } from '../use/use-lexical-scope.public';
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
      const log: string[] = [];
      const MyCmp = component$((props: { initial: number }) => {
        const count = useSignal(123);
        log.push('render');
        return _jsxQ(
          'button',
          null, // mutable props
          {
            // immutable props
            'data-text': 'TEXT',
            'data-idx': 3,
            class: ['abc', { xyz: true }],
            onClick$: inlinedQrl(
              () => {
                log.push('click');
                useLexicalScope()[0].value++;
              },
              's_click',
              [count]
            ),
          },
          count.value,
          3,
          null,
          {
            fileName: 'app.tsx',
            lineNumber: 4,
            columnNumber: 10,
          }
        );
      });

      const { vNode, document } = await render(<MyCmp initial={123} />, { debug });
      const button = document.querySelector('button')!;
      expect(log).toEqual(['render']);
      expect(button.getAttribute('data-text')).toEqual('TEXT');
      expect(button.getAttribute('data-idx')).toEqual('3');
      expect(button.getAttribute('class')).toEqual('abc xyz');
      expect(vNode).toMatchVDOM(
        <>
          <button>123</button>
        </>
      );
      log.length = 0;
      await trigger(document.body, 'button', 'click');
      expect(log).toEqual(['click', 'render']);
      expect(button.getAttribute('data-text')).toEqual('TEXT');
      expect(button.getAttribute('data-idx')).toEqual('3');
      expect(button.getAttribute('class')).toEqual('abc xyz');
      expect(vNode).toMatchVDOM(
        <>
          <button>124</button>
        </>
      );
    });
    it('should handle immutable props on component', async () => {
      const Child = component$<{ name: string; num: number }>((props) => (
        <b>
          {props.name}={props.num}
        </b>
      ));
      const MyCmp = component$(() => {
        return (
          <button>
            {_jsxC(
              Child as fixMeAny,
              { name: 'NAME', num: 123, [_IMMUTABLE]: { name: _IMMUTABLE, num: _IMMUTABLE } }, // mutable props
              3,
              null
            )}
          </button>
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
