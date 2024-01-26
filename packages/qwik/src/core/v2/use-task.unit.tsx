import { describe, expect, it } from 'vitest';
import { component$ } from '../component/component.public';
import { useSignal } from '../use/use-signal';
import { useTask$ } from '../use/use-task';
import { ssrRenderToDom } from './ssr-render.unit';
import './vdom-diff.unit-util';

describe('useTask', () => {
  it.skip('should execute task on SSR', async () => {
    const Counter = component$(() => {
      const count = useSignal(0);
      useTask$(() => {
        count.value = 123;
      });
      return <span>{count.value}</span>;
    });

    const { vNode } = await ssrRenderToDom(<Counter />, {
      debug: true,
    });
    expect(vNode).toMatchVDOM(
      <>
        <span>123</span>
      </>
    );
  });
});
