import { Fragment as Component, Fragment, Fragment as Signal } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import type { JSXOutput } from '../render/jsx/types/jsx-node';
import { useSignal } from '../use/use-signal';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';
import { useStore } from '../use/use-store.public';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: component', ({ render }) => {
  it('should render component', async () => {
    const MyComp = component$(() => {
      return <>Hello World!</>;
    });

    const { vNode } = await render(<MyComp />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <>Hello World!</>
      </>
    );
  });

  it('should render nested component', async () => {
    const Child = component$((props: { name: string }) => {
      return <>{props.name}</>;
    });

    const Parent = component$((props: { salutation: string; name: string }) => {
      return (
        <>
          {props.salutation} <Child name={props.name} />
        </>
      );
    });

    const { vNode } = await render(<Parent salutation="Hello" name="World" />, {
      debug,
    });
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

  it('should handle null as empty string', async () => {
    const MyComp = component$(() => {
      return (
        <div>
          <span>Hello world</span>
          {null}
        </div>
      );
    });

    const { vNode } = await render(<MyComp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <span>Hello world</span>
          {''}
        </div>
      </Component>
    );
  });

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
              onClick$={() => {
                showChild.value = !showChild.value;
              }}
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
    const Component1 = component$(() => {
      const signal1 = useSignal(1);
      return (
        <div>
          <span>Component 1</span>
          {signal1.value}
        </div>
      );
    });
    const Component2 = component$(() => {
      const signal2 = useSignal(2);
      return (
        <div>
          <span>Component 2</span>
          {signal2.value}
        </div>
      );
    });
    const Parent = component$(() => {
      const show = useSignal(true);
      return (
        <main class="parent" onClick$={() => (show.value = false)}>
          {show.value && <Component1 />}
          {show.value && <Component1 />}
          <Component2 />
        </main>
      );
    });
    const { vNode, container } = await render(<Parent />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <main class="parent">
          <Component>
            <div>
              <span>Component 1</span>
              <Signal>1</Signal>
            </div>
          </Component>
          <Component>
            <div>
              <span>Component 1</span>
              <Signal>1</Signal>
            </div>
          </Component>
          <Component>
            <div>
              <span>Component 2</span>
              <Signal>2</Signal>
            </div>
          </Component>
        </main>
      </>
    );
    await trigger(container.element, 'main.parent', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <main class="parent">
          {''}
          {''}
          <Component>
            <div>
              <span>Component 2</span>
              <Signal>2</Signal>
            </div>
          </Component>
        </main>
      </>
    );
  });

  it('should remove children from component$', async () => {
    const log: string[] = [];
    const MyComp = component$((props: any) => {
      log.push('children' in props ? 'children' : 'no children');
      return <span>Hello world</span>;
    });

    const { vNode } = await render(<MyComp>CHILDREN</MyComp>, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <span>Hello world</span>
      </Component>
    );
    expect(log).toEqual(['no children']);
  });

  it('should NOT remove children from inline component', async () => {
    const log: string[] = [];
    const MyComp = (props: any) => {
      log.push('children' in props ? 'has children' : 'no children');
      return <span>Hello world</span>;
    };

    const { vNode } = await render(<MyComp>CHILDREN</MyComp>, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <span>Hello world</span>
      </Component>
    );
    expect(log).toEqual(['has children']);
  });

  it('should render correctly text node in the middle', async () => {
    const Cmp = component$(() => {
      const signal = useSignal<number>(0);
      return (
        <p onClick$={() => (signal.value = 123)}>
          <b>Test</b>xx<span>{signal.value}</span>
        </p>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    // console.log(document.body.innerHTML);
    await trigger(document.body, 'p', 'click');
    // console.log(document.body.innerHTML);
    expect(vNode).toMatchVDOM(
      <Component>
        <p>
          <b>Test</b>
          {'xx'}
          <span>
            <Signal>123</Signal>
          </span>
        </p>
      </Component>
    );
    // await expect(document.body.firstChild).toMatchDOM(
    //   <p>
    //     <b>Test</b>xx<span>123</span>
    //   </p>
    // );
    expect((document.body.firstChild as HTMLElement).innerHTML).toEqual(
      '<b>Test</b>xx<span>123</span>'
    );
  });

  describe('svg', () => {
    it('should render svg', async () => {
      const SvgComp = component$(() => {
        return (
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="ka">
            <feGaussianBlur></feGaussianBlur>
            <circle cx="50" cy="50" r="50" />
          </svg>
        );
      });
      const { vNode, container } = await render(<SvgComp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <feGaussianBlur></feGaussianBlur>
            <circle cx="50" cy="50" r="50" />
          </svg>
        </Component>
      );
      await expect(container.document.body.firstChild).toMatchDOM(
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="ka">
          <fegaussianblur></fegaussianblur>
          <circle cx="50" cy="50" r="50"></circle>
        </svg>
      );
    });
    it('should write attributes to svg', async () => {
      const SvgComp = component$((props: { cx: string; cy: string }) => {
        return (
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="0">
            {/* <circle cx={props.cx} cy={props.cy} r="50" /> */}
            <circle {...props} r="50" />
          </svg>
        );
      });
      const { vNode, container } = await render(<SvgComp cx="10" cy="10" />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="50" />
          </svg>
        </Component>
      );
      await expect(container.document.querySelector('svg')).toMatchDOM(
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="0">
          <circle cx="10" cy="10" r="50"></circle>
        </svg>
      );
    });
    it('should rerender svg', async () => {
      const SvgComp = component$((props: { cx: string; cy: string }) => {
        return (
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="0">
            <circle cx={props.cx} cy={props.cy} r="50" />
          </svg>
        );
      });
      const Parent = component$(() => {
        const show = useSignal(false);
        return (
          <button onClick$={() => (show.value = !show.value)}>
            {show.value && <SvgComp cx="10" cy="10" />}
          </button>
        );
      });
      const { vNode, container } = await render(<Parent />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>{''}</button>
        </Component>
      );

      await expect(container.document.querySelector('button')).toMatchDOM(<button></button>);
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Component>
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="0">
                <circle cx="10" cy="10" r="50" />
              </svg>
            </Component>
          </button>
        </Component>
      );

      await expect(container.document.querySelector('svg')).toMatchDOM(
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="0">
          <circle r="50" cx="10" cy="10"></circle>
        </svg>
      );

      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>{''}</button>
        </Component>
      );

      await expect(container.document.body.querySelector('button')).toMatchDOM(<button></button>);
    });
    it('should rerender svg child elements', async () => {
      const SvgComp = component$((props: { child: JSXOutput }) => {
        return (
          <svg key="hi" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <circle cx="15" cy="15" r="50" />
            {props.child}
          </svg>
        );
      });
      const Parent = component$(() => {
        const show = useSignal(false);
        return (
          <button onClick$={() => (show.value = !show.value)}>
            <SvgComp
              child={
                show.value ? <line x1="0" y1="80" x2="100" y2="20" stroke="black" key="1" /> : <></>
              }
            />
          </button>
        );
      });
      const { vNode, container } = await render(<Parent />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Component>
              <svg key="hi" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="15" cy="15" r="50"></circle>
                <Fragment></Fragment>
              </svg>
            </Component>
          </button>
        </Component>
      );
      await expect(container.document.querySelector('svg')).toMatchDOM(
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="hi">
          <circle cx="15" cy="15" r="50"></circle>
        </svg>
      );

      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Component>
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="15" cy="15" r="50"></circle>
                <line x1="0" y1="80" x2="100" y2="20" stroke="black" key="1"></line>
              </svg>
            </Component>
          </button>
        </Component>
      );

      await expect(container.document.querySelector('svg')).toMatchDOM(
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="hi">
          <circle cx="15" cy="15" r="50"></circle>
          <line x1="0" y1="80" x2="100" y2="20" stroke="black" key="1"></line>
        </svg>
      );

      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Component>
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                <circle cx="15" cy="15" r="50"></circle>
                <Fragment></Fragment>
              </svg>
            </Component>
          </button>
        </Component>
      );
      await expect(container.document.querySelector('svg')).toMatchDOM(
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" key="hi">
          <circle cx="15" cy="15" r="50"></circle>
        </svg>
      );
    });
  });

  describe('attributes', () => {
    it('should render boolean and number attributes', async () => {
      const AttrComp = component$(() => {
        const required = useSignal(false);
        const state = useStore({
          dataAria: true,
        });

        return (
          <>
            <button id="req" onClick$={() => (required.value = !required.value)}></button>
            <input
              id="input"
              required={required.value}
              aria-hidden={state.dataAria}
              aria-required="false"
              draggable={required.value}
              spellcheck={required.value}
              tabIndex={-1}
            />
          </>
        );
      });

      const { vNode, document } = await render(<AttrComp />, { debug });

      await expect(document.body.querySelector('input')).toMatchDOM(
        <input
          id="input"
          aria-hidden="true"
          aria-required="false"
          draggable={false}
          spellcheck={false}
          tabIndex={-1}
        />
      );
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button id="req"></button>
            <input
              id="input"
              aria-hidden="true"
              aria-required="false"
              draggable={false}
              spellcheck={false}
              tabIndex={-1}
            />
          </Fragment>
        </Component>
      );

      await trigger(document.body, '#req', 'click');

      await expect(document.body.querySelector('input')).toMatchDOM(
        <input
          id="input"
          required={true}
          aria-hidden="true"
          aria-required="false"
          draggable={true}
          spellcheck={true}
          tabIndex={-1}
        />
      );
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button id="req"></button>
            <input
              id="input"
              required={true}
              aria-hidden="true"
              aria-required="false"
              draggable={true}
              spellcheck={true}
              tabIndex={-1}
            />
          </Fragment>
        </Component>
      );

      await trigger(document.body, '#req', 'click');

      await expect(document.body.querySelector('input')).toMatchDOM(
        <input
          id="input"
          aria-hidden="true"
          aria-required="false"
          draggable={false}
          spellcheck={false}
          tabIndex={-1}
        />
      );
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button id="req"></button>
            <input
              id="input"
              aria-hidden="true"
              aria-required="false"
              draggable={false}
              spellcheck={false}
              tabIndex={-1}
            />
          </Fragment>
        </Component>
      );
    });

    it('should bind checked attribute', async () => {
      const BindCmp = component$(() => {
        const show = useSignal(false);
        return (
          <>
            <label for="toggle">
              <input type="checkbox" bind:checked={show} />
              Show conditional
            </label>
            <div>{show.value.toString()}</div>
          </>
        );
      });

      const { vNode, document } = await render(<BindCmp />, { debug });

      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <label for="toggle">
              <input type="checkbox" checked={false} />
              {'Show conditional'}
            </label>
            <div>false</div>
          </Fragment>
        </Component>
      );

      // simulate checkbox click
      const input = document.querySelector('input')!;
      input.checked = true;
      await trigger(document.body, 'input', 'input');

      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <label for="toggle">
              <input type="checkbox" checked={true} />
              {'Show conditional'}
            </label>
            <div>true</div>
          </Fragment>
        </Component>
      );
    });
  });

  describe('regression', () => {
    it('#5647', async () => {
      const ChildNested = component$(() => {
        return <div>Nested</div>;
      });
      const Child1 = component$<{ refId: string; ele: JSXOutput }>((props) => {
        const isShow = useSignal(true);
        return (
          <div>
            {isShow.value && props.ele}
            <p>isShow value: {`${isShow.value}`}</p>
            <button
              id={props.refId}
              onClick$={() => {
                isShow.value = !isShow.value;
              }}
            >
              Toggle
            </button>
          </div>
        );
      });
      const Issue5647 = component$(() => {
        return (
          <>
            <Child1 refId="first" ele={<span>Hi, this doesn't work...</span>} />
            <Child1 refId="second" ele={<ChildNested />} />
          </>
        );
      });
      const { vNode, container } = await render(<Issue5647 />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <Component>
              <div>
                <span>Hi, this doesn't work...</span>
                <p>
                  {'isShow value: '}
                  <Signal>{'true'}</Signal>
                </p>
                <button id="first">Toggle</button>
              </div>
            </Component>
            <Component>
              <div>
                <Component>
                  <div>Nested</div>
                </Component>
                <p>
                  {'isShow value: '}
                  <Signal>{'true'}</Signal>
                </p>
                <button id="second">Toggle</button>
              </div>
            </Component>
          </Fragment>
        </Component>
      );
      await trigger(container.element, 'button#first', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <Component>
              <div>
                {''}
                <p>
                  {'isShow value: '}
                  <Signal>{'false'}</Signal>
                </p>
                <button id="first">Toggle</button>
              </div>
            </Component>
            <Component>
              <div>
                <Component>
                  <div>Nested</div>
                </Component>
                <p>
                  {'isShow value: '}
                  <Signal>{'true'}</Signal>
                </p>
                <button id="second">Toggle</button>
              </div>
            </Component>
          </Fragment>
        </Component>
      );
      await trigger(container.element, 'button#second', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <Component>
              <div>
                {''}
                <p>
                  {'isShow value: '}
                  <Signal>{'false'}</Signal>
                </p>
                <button id="first">Toggle</button>
              </div>
            </Component>
            <Component>
              <div>
                {''}
                <p>
                  {'isShow value: '}
                  <Signal>{'false'}</Signal>
                </p>
                <button id="second">Toggle</button>
              </div>
            </Component>
          </Fragment>
        </Component>
      );
      await trigger(container.element, 'button#first', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <Component>
              <div>
                <span>Hi, this doesn't work...</span>
                <p>
                  {'isShow value: '}
                  <Signal>{'true'}</Signal>
                </p>
                <button id="first">Toggle</button>
              </div>
            </Component>
            <Component>
              <div>
                {''}
                <p>
                  {'isShow value: '}
                  <Signal>{'false'}</Signal>
                </p>
                <button id="second">Toggle</button>
              </div>
            </Component>
          </Fragment>
        </Component>
      );
    });
  });
});
