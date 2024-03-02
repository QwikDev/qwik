import { Fragment as Component, Fragment } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$, componentQrl } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe('useSequentialScope', () => {
  it('should render component', async () => {
    const MyComp = component$(() => {
      return <>Hello World!</>;
    });

    const { vNode, container } = await ssrRenderToDom(<MyComp />, { debug });
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <>Hello World!</>
      </>
    );
  });
  it('should render nested component', async () => {
    const Parent = component$((props: { salutation: string; name: string }) => {
      return (
        <>
          {props.salutation} <Child name={props.name} />
        </>
      );
    });

    const Child = component$((props: { name: string }) => {
      return <>{props.name}</>;
    });

    const { vNode, container } = await ssrRenderToDom(<Parent salutation="Hello" name="World" />, {
      // debug: true,
    });
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          {'Hello'}{' '}
          <Component>
            <Fragment>World</Fragment>
          </Component>
        </Fragment>
      </Component>
    );
  });
  [
    ssrRenderToDom, //
    domRender, //
  ].forEach((render) => {
    describe(`render: ${render.name}`, () => {
      it('should show Child Component', async () => {
        const Child = component$(() => {
          return <div>Child</div>;
        });
        const Parent = component$(() => {
          const showChild = useSignal(false);
          return (
            <>
              <div>Parent</div>
              <div>
                <button
                  onClick$={inlinedQrl(
                    () => {
                      const [showChild] = useLexicalScope();
                      showChild.value = !showChild.value;
                    },
                    's_onClick',
                    [showChild]
                  )}
                >
                  Show child
                </button>
                {showChild.value && <Child />}
              </div>
            </>
          );
        });

        const { vNode, document } = await render(<Parent />, { debug });
        expect(vNode).toMatchVDOM(
          <Component>
            <Fragment>
              <div>Parent</div>
              <div>
                <button>Show child</button>
                {''}
              </div>
            </Fragment>
          </Component>
        );
        await trigger(document.body, 'button', 'click');
        expect(vNode).toMatchVDOM(
          <Component>
            <Fragment>
              <div>Parent</div>
              <div>
                <button>Show child</button>
                <Component>
                  <div>Child</div>
                </Component>
              </div>
            </Fragment>
          </Component>
        );
      });

      it('should rerender components correctly', async () => {
        const Component1 = componentQrl(
          inlinedQrl(() => {
            const signal1 = useSignal(1);
            return (
              <div>
                <span>Component 1</span>
                {signal1.value}
              </div>
            );
          }, 's_cmp1')
        );
        const Component2 = componentQrl(
          inlinedQrl(() => {
            const signal2 = useSignal(2);
            return (
              <div>
                <span>Component 2</span>
                {signal2.value}
              </div>
            );
          }, 's_cmp2')
        );
        const Parent = componentQrl(
          inlinedQrl(() => {
            const show = useSignal(true);
            return (
              <button
                onClick$={inlinedQrl(() => (useLexicalScope()[0].value = false), 's_onClick', [
                  show,
                ])}
              >
                {show.value && <Component1 />}
                <Component2 />
              </button>
            );
          }, 's_parent')
        );
        const { vNode, container } = await render(<Parent />, { debug });
        expect(vNode).toMatchVDOM(
          <>
            <button>
              <Component>
                <div>
                  <span>Component 1</span>2
                </div>
              </Component>
              <Component>
                <div>
                  <span>Component 2</span>2
                </div>
              </Component>
            </button>
          </>
        );
        await trigger(container.element, 'button', 'click');
        expect(vNode).toMatchVDOM(
          <>
            <button>
              {''}
              <Fragment>
                <div>
                  <span>Component 2</span>2
                </div>
              </Fragment>
            </button>
          </>
        );
      });
    });
  });
});
