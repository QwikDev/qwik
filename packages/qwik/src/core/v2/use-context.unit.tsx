import {
  Fragment as Component,
  Fragment,
  Fragment as Projection,
} from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { createContextId, useContext, useContextProvider } from '../use/use-context';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';
import { Slot } from '../render/jsx/slot.public';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe(render.name + 'useContext', () => {
    it('should provide and retrieve a context', async () => {
      const contextId = createContextId<{ value: string }>('myTest');
      const Provider = component$(() => {
        useContextProvider(contextId, { value: 'CONTEXT_VALUE' });
        return <Consumer />;
      });
      const Consumer = component$(() => {
        const ctxValue = useContext(contextId);
        return <span>{ctxValue.value}</span>;
      });

      const { vNode } = await render(<Provider />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <span>CONTEXT_VALUE</span>
          </Component>
        </Component>
      );
    });
    it('should provide and retrieve a context on client change', async () => {
      const contextId = createContextId<{ value: string }>('myTest');
      const Provider = component$(() => {
        useContextProvider(contextId, { value: 'CONTEXT_VALUE' });
        const show = useSignal(false);
        return show.value ? (
          <Consumer />
        ) : (
          <button
            onClick$={inlinedQrl(() => (useLexicalScope()[0].value = true), 's_click', [show])}
          />
        );
      });
      const Consumer = component$(() => {
        const ctxValue = useContext(contextId);
        return <span>{ctxValue.value}</span>;
      });

      const { vNode, document } = await render(<Provider />, { debug });
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <span>CONTEXT_VALUE</span>
          </Component>
        </Component>
      );
    });
  });

  describe(render.name + 'regression', () => {
    it('#4038', async () => {
      interface MyStore {
        value: number;
      }
      const myContext = createContextId<MyStore>('mytitle');
      const useFn = () => {
        const state = useContext(myContext);

        return (val: number) => {
          return (state.value + val).toString();
        };
      };
      interface IMyComponent {
        val: string;
      }
      const MyComponent = component$((props: IMyComponent) => {
        const count = useSignal(0);
        const c = useFn();

        return (
          <>
            <p>{props.val}</p>
            <p>{c(count.value)}</p>
            <p>{count.value}</p>
            <button
              onClick$={inlinedQrl(
                () => {
                  const [count] = useLexicalScope();
                  count.value++;
                },
                's_onClick',
                [count]
              )}
            >
              Increment
            </button>
          </>
        );
      });

      const Parent = component$(() => {
        const c = useFn();

        return (
          <div>
            <MyComponent val={c(1)} />
          </div>
        );
      });

      const Layout = component$(() => {
        useContextProvider(myContext, {
          value: 0,
        });
        return <Slot />;
      });
      const { vNode, document } = await render(
        <Layout>
          <Parent />
        </Layout>,
        { debug }
      );
      expect(vNode).toMatchVDOM(
        <Component>
          <Projection>
            <Component>
              <div>
                <Component>
                  <Fragment>
                    <p>1</p>
                    <p>0</p>
                    <p>0</p>
                    <button>Increment</button>
                  </Fragment>
                </Component>
              </div>
            </Component>
          </Projection>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Projection>
            <Component>
              <div>
                <Component>
                  <Fragment>
                    <p>1</p>
                    <p>2</p>
                    <p>2</p>
                    <button>Increment</button>
                  </Fragment>
                </Component>
              </div>
            </Component>
          </Projection>
        </Component>
      );
    });
    it('#5270 - retrieve context on un-projected component', async () => {
      const Issue5270Context = createContextId<{ hi: string }>('5270');
      const ProviderParent = component$(() => {
        useContextProvider(Issue5270Context, { hi: 'hello' });
        const projectSlot = useSignal(false);
        return (
          <div>
            <button
              id="issue-5270-button"
              onClick$={inlinedQrl(
                () => {
                  const [projectSlot] = useLexicalScope();
                  projectSlot.value = !projectSlot.value;
                },
                's_click',
                [projectSlot]
              )}
            >
              toggle
            </button>
            <br />
            {projectSlot.value && <Slot />}
          </div>
        );
      });
      const ContextChild = component$(() => {
        // return <debug />;
        const t = useContext(Issue5270Context);
        return <div id="issue-5270-div">Ctx: {t.hi}</div>;
      });
      const Issue5270 = component$(() => {
        useContextProvider(Issue5270Context, { hi: 'wrong' });
        return (
          <ProviderParent>
            <ContextChild />
          </ProviderParent>
        );
      });
      const { vNode, document } = await render(<Issue5270 />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <div>
              <button id="issue-5270-button">toggle</button>
              <br></br>
              {'' /** Slot not projected */}
            </div>
          </Component>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <div>
              <button id="issue-5270-button">toggle</button>
              <br></br>
              <Projection>
                <Component>
                  <div id="issue-5270-div">
                    {'Ctx: '}
                    {'hello'}
                  </div>
                </Component>
              </Projection>
            </div>
          </Component>
        </Component>
      );
    });
  });
});
