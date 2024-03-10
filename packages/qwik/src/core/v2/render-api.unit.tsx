import { describe, it, expect, expectTypeOf, beforeEach } from 'vitest';
import { render2 } from './client/dom-render';
import { render } from '../render/dom/render.public';
import { renderToStream, renderToString } from '@builder.io/qwik/server';
import { renderToStream2, renderToString2 } from './ssr/ssr-render2';
import { component$, componentQrl } from '../component/component.public';
import { useSignal } from '../use/use-signal';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { inlinedQrl } from '../qrl/qrl';
import { createDocument } from '@builder.io/qwik-dom';
import { getDomContainer } from './client/dom-container';
import { vnode_getFirstChild } from './client/vnode';
import { Fragment as Component } from '@builder.io/qwik/jsx-runtime';
import './vdom-diff.unit-util';
import { trigger } from '../../testing/element-fixture';
import { useServerData } from '../use/use-env-data';
import { useTask$ } from '../use/use-task';
import { getPlatform, setPlatform } from '../platform/platform';
import { getTestPlatform } from '../../testing/platform';

describe('render api', () => {
  let document: Document;
  beforeEach(() => {
    document = createDocument();
  });

  const Greeter = componentQrl<{ salutation?: string; name?: string }>(
    inlinedQrl(({ salutation, name }) => {
      return (
        <span>
          {salutation || 'Hello'} {name || 'World'}!
        </span>
      );
    }, 's_greeter')
  );

  const Counter = componentQrl(
    inlinedQrl(() => {
      const count = useSignal(123);
      return (
        <button
          onClick$={inlinedQrl(
            () => {
              useLexicalScope()[0].value++;
            },
            's_click',
            [count]
          )}
        >
          {count.value}
        </button>
      );
    }, 's_counter')
  );

  describe('types', () => {
    it('should have same type signature()', () => {
      expectTypeOf(render2).toEqualTypeOf(render);
      expectTypeOf(renderToString2).toEqualTypeOf(renderToString);
      expectTypeOf(renderToStream2).toEqualTypeOf(renderToStream);
    });
  });
  describe('render()', () => {
    it('should render counter', async () => {
      await render2(document.body, <Counter />);
      await getTestPlatform().flush();
      const container = getDomContainer(document.body);
      const vNode = vnode_getFirstChild(container.rootVNode);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>123</button>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>124</button>
        </Component>
      );
    });
    it('should pass serverData', async () => {
      const TestCmp = component$(() => {
        const myKey = useServerData<string>('my-key');
        const defaultKey = useServerData<string>('other-key', 'default-value');
        return (
          <span>
            {myKey}/{defaultKey}
          </span>
        );
      });
      await render2(document.body, <TestCmp />, { serverData: { 'my-key': 'my-value' } });
      await getTestPlatform().flush();
      const container = getDomContainer(document.body);
      const vNode = vnode_getFirstChild(container.rootVNode);
      expect(vNode).toMatchVDOM(
        <Component>
          <span>
            {'my-value'}/{'default-value'}
          </span>
        </Component>
      );
    });
    it('should cleanup', async () => {
      const log: string[] = [];
      const TestCmp = component$(() => {
        useTask$(() => {
          log.push('task');
          return () => {
            log.push('cleanup');
          };
        });
        return <span />;
      });
      const { cleanup } = await render2(document.body, <TestCmp />, {
        serverData: { 'my-key': 'my-value' },
      });
      await getTestPlatform().flush();
      expect(log).toEqual(['task']);
      cleanup();
      expect(log).toEqual(['task', 'cleanup']);
    });
  });
  describe('renderToString()', () => {
    it('should renderToString', async () => {
      const TestCmp = component$(() => {
        const count = useSignal(123);
        return (
          <button
            onClick$={inlinedQrl(
              () => {
                useLexicalScope()[0].value++;
              },
              's_click',
              [count]
            )}
          >
            {count.value}
          </button>
        );
      });
      const platform = getPlatform();
      try {
        const result = await renderToString2(<TestCmp />, {
          containerTagName: 'div',
        });
        document = createDocument(result.html);
      } finally {
        setPlatform(platform);
      }
      const container = getDomContainer(document.body.firstChild as HTMLElement);
      const vNode = vnode_getFirstChild(container.rootVNode);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>123</button>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>124</button>
        </Component>
      );
    });
    describe('render result', () => {
      it.todo('should render', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
        });
        console.log('result', result.html);
        expect(result).toMatchObject({
          isStatic: true,
          prefetchResources: [],
          timing: expect.any(Object),
          manifest: expect.any(Object),
          snapshotResult: expect.any(Object),
          html: expect.any(String),
        });
      });

      it('should have timings greater than 0', async () => {
        const result = await renderToString2(<Counter />, {
          containerTagName: 'div',
        });
        const timing = result.timing;
        expect(timing).toMatchObject({
          firstFlush: expect.any(Number),
          render: expect.any(Number),
          snapshot: expect.any(Number),
        });
        expect(timing.render).toBeGreaterThan(0);
        expect(timing.snapshot).toBeGreaterThan(0);
      })
    });
    describe('version', () => {
      it.todo('should render', async () => {});
    });
    describe('base', () => {
      it.todo('should render', async () => {});
    });
    describe('locale', () => {
      it.todo('should render', async () => {});
    });
    describe('qwikLoader', () => {
      it.todo('should render', async () => {});
    });
    describe('qwikPrefetchServiceWorker', () => {
      it.todo('should render', async () => {});
    });
    describe('prefetchStrategy', () => {
      it.todo('should render', async () => {});
    });
    describe('containerTagName/containerAttributes', () => {
      it.todo('should render', async () => {});
    });
    describe('serverData', () => {
      it.todo('should render', async () => {});
    });
    describe('manifest/symbolMapper', () => {
      it.todo('should render', async () => {});
    });
    describe('debug', () => {
      it.todo('should render', async () => {});
    });
  });
  describe('renderToStream()', () => {
    describe('render result', () => {
      it.todo('should render', async () => {});
    });
    describe('stream', () => {
      it.todo('should render');
    });
    describe('streaming', () => {
      it.todo('should render');
    });
  });
});
