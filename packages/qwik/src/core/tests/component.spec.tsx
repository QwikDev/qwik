import {
  $,
  Fragment as Component,
  Fragment,
  Fragment as InlineComponent,
  Fragment as Projection,
  SSRComment,
  Fragment as Signal,
  SkipRender,
  Slot,
  _jsxSorted,
  component$,
  h,
  jsx,
  useComputed$,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
  type JSXOutput,
  type PropsOf,
  type Signal as SignalType,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { cleanupAttrs } from '../../testing/element-fixture';
import { delay } from '../shared/utils/promises';
import { QError } from '../shared/error/error';
import { ErrorProvider } from '../../testing/rendering.unit-util';
import * as qError from '../shared/error/error';
import { QContainerValue } from '../shared/types';
import { OnRenderProp, QContainerAttr } from '../shared/utils/markers';
import { vnode_locate } from '../client/vnode';

const debug = false; //true;
Error.stackTraceLimit = 100;

function Hola(props: any) {
  return <div {...props}></div>;
}

const globalObj = ['foo', 'bar'];

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

  it('should render component with key', async () => {
    (globalThis as any).componentExecuted = [];
    const Cmp = component$(() => {
      (globalThis as any).componentExecuted.push('Cmp');
      return <div></div>;
    });

    const Parent = component$(() => {
      const counter = useSignal(0);
      return (
        <>
          <Cmp key={counter.value} />
          <button id="counter" onClick$={() => counter.value++}></button>
        </>
      );
    });

    const { vNode, document } = await render(<Parent />, { debug });
    expect((globalThis as any).componentExecuted).toEqual(['Cmp']);
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component>
            <div></div>
          </Component>
          <button id="counter"></button>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect((globalThis as any).componentExecuted).toEqual(['Cmp', 'Cmp']);
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component>
            <div></div>
          </Component>
          <button id="counter"></button>
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
      <Component ssr-required>
        <Fragment ssr-required>
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
      <Component ssr-required>
        <Fragment ssr-required>
          <div>Parent</div>
          <div>
            <button>Show child</button>
            <Component ssr-required>
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
      <Component ssr-required>
        <main class="parent">
          <Component ssr-required>
            <div>
              <span>Component 1</span>
              <Signal ssr-required>1</Signal>
            </div>
          </Component>
          <Component ssr-required>
            <div>
              <span>Component 1</span>
              <Signal ssr-required>1</Signal>
            </div>
          </Component>
          <Component ssr-required>
            <div>
              <span>Component 2</span>
              <Signal ssr-required>2</Signal>
            </div>
          </Component>
        </main>
      </Component>
    );
    await trigger(container.element, 'main.parent', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <main class="parent">
          {''}
          {''}
          <Component ssr-required>
            <div>
              <span>Component 2</span>
              <Signal ssr-required>2</Signal>
            </div>
          </Component>
        </main>
      </Component>
    );
  });

  it('should not rerender not changed component', async () => {
    (globalThis as any).componentExecuted = [];
    const Component1 = component$(() => {
      (globalThis as any).componentExecuted.push('Component1');
      const signal1 = useSignal(1);
      return (
        <div>
          <span>Component 1</span>
          {signal1.value}
        </div>
      );
    });
    const Component2 = component$(() => {
      (globalThis as any).componentExecuted.push('Component2');
      const signal2 = useSignal(2);
      return (
        <div>
          <span>Component 2</span>
          {signal2.value}
        </div>
      );
    });
    const Parent = component$(() => {
      (globalThis as any).componentExecuted.push('Parent');
      const show = useSignal(true);
      return (
        <main class="parent" onClick$={() => (show.value = false)}>
          {show.value && <Component1 />}
          <Component2 />
        </main>
      );
    });
    const { vNode, container } = await render(<Parent />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <main class="parent">
          <Component ssr-required>
            <div>
              <span>Component 1</span>
              <Signal ssr-required>1</Signal>
            </div>
          </Component>
          <Component ssr-required>
            <div>
              <span>Component 2</span>
              <Signal ssr-required>2</Signal>
            </div>
          </Component>
        </main>
      </Component>
    );
    expect((globalThis as any).componentExecuted).toEqual(['Parent', 'Component1', 'Component2']);
    await trigger(container.element, 'main.parent', 'click');
    expect((globalThis as any).componentExecuted).toEqual([
      'Parent',
      'Component1',
      'Component2',
      'Parent',
    ]);
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <main class="parent">
          {''}
          <Component ssr-required>
            <div>
              <span>Component 2</span>
              <Signal ssr-required>2</Signal>
            </div>
          </Component>
        </main>
      </Component>
    );
  });

  it('should not rerender component with empty props', async () => {
    (globalThis as any).componentExecuted = [];
    const Component1 = component$<PropsOf<any>>(() => {
      (globalThis as any).componentExecuted.push('Component1');
      return <div></div>;
    });
    const Parent = component$(() => {
      (globalThis as any).componentExecuted.push('Parent');
      const show = useSignal(true);
      return (
        <main class="parent" onClick$={() => (show.value = !show.value)}>
          {show.value && <Component1 />}
          <Component1 />
        </main>
      );
    });
    const { vNode, container } = await render(<Parent />, { debug });
    expect((globalThis as any).componentExecuted).toEqual(['Parent', 'Component1', 'Component1']);
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <main class="parent">
          <Component ssr-required>
            <div></div>
          </Component>
          <Component ssr-required>
            <div></div>
          </Component>
        </main>
      </Component>
    );
    await trigger(container.element, 'main.parent', 'click');
    expect((globalThis as any).componentExecuted).toEqual([
      'Parent',
      'Component1',
      'Component1',
      'Parent',
    ]);
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <main class="parent">
          {''}
          <Component ssr-required>
            <div></div>
          </Component>
        </main>
      </Component>
    );
    await trigger(container.element, 'main.parent', 'click');
    expect((globalThis as any).componentExecuted).toEqual([
      'Parent',
      'Component1',
      'Component1',
      'Parent',
      'Parent',
      'Component1',
    ]);
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <main class="parent">
          <Component ssr-required>
            <div></div>
          </Component>
          <Component ssr-required>
            <div></div>
          </Component>
        </main>
      </Component>
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

  it('should remove children from child component$', async () => {
    const log: string[] = [];
    const ChildMyComp = component$((props: any) => {
      log.push('children' in props ? 'children' : 'no children');
      return <span>Hello world</span>;
    });
    const MyComp = component$((props: any) => {
      log.push('children' in props ? 'children' : 'no children');
      return (
        <span>
          <ChildMyComp />
          Hello world
        </span>
      );
    });

    const { vNode } = await render(<MyComp>CHILDREN</MyComp>, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <span>
          <Component>
            <span>Hello world</span>
          </Component>
          Hello world
        </span>
      </Component>
    );
    expect(log).toEqual(['no children', 'no children']);
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

  it('should render children from dynamic props', async () => {
    const IssueChildrenSpread = component$(() => {
      const signal = useSignal({
        type: 'div',
        children: ['Hello'],
      });
      const Type = signal.value.type;
      return (
        <div>
          <button
            onClick$={() => {
              signal.value = {
                type: 'div',
                children: ['Changed'],
              };
            }}
          >
            Change
          </button>
          <Hola>
            <div>1</div>
            <div>2</div>
          </Hola>
          <div>
            <Type {...(signal.value as any)}></Type>
          </div>
        </div>
      );
    });

    const { vNode, document } = await render(<IssueChildrenSpread />, { debug });

    const props = { type: 'div' };

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <div>
          <button>Change</button>
          <InlineComponent>
            <div>
              <div>1</div>
              <div>2</div>
            </div>
          </InlineComponent>
          <div>
            <div {...props}>Hello</div>
          </div>
        </div>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <div>
          <button>Change</button>
          <InlineComponent>
            <div>
              <div>1</div>
              <div>2</div>
            </div>
          </InlineComponent>
          <div>
            <div {...props}>Changed</div>
          </div>
        </div>
      </Component>
    );
  });

  it('should insert dangerouslySetInnerHTML', async () => {
    const Cmp = component$(() => {
      const htmlSignal = useSignal("<h2><span>I'm a signal value!</span></h2>");
      return (
        <div>
          <div>
            <span id="first" dangerouslySetInnerHTML="vanilla HTML here" />
          </div>
          <div>
            <span id="second" dangerouslySetInnerHTML="<h1>I'm an h1!</h1>" class="after" />
          </div>
          <div>
            <span id="third" dangerouslySetInnerHTML={htmlSignal.value} class="after" />
            <button
              onClick$={() =>
                (htmlSignal.value = "<h2><span>I'm a updated signal value!</span></h2>")
              }
            ></button>
          </div>
        </div>
      );
    });
    const { document } = await render(<Cmp />, { debug });
    const qContainerAttr = { [QContainerAttr]: QContainerValue.HTML };
    await expect(document.querySelector('#first')).toMatchDOM(
      <span id="first" {...qContainerAttr}>
        vanilla HTML here
      </span>
    );
    await expect(document.querySelector('#second')).toMatchDOM(
      <span id="second" class="after" {...qContainerAttr}>
        <h1>I'm an h1!</h1>
      </span>
    );
    await expect(document.querySelector('#third')).toMatchDOM(
      <span id="third" class="after" {...qContainerAttr}>
        <h2>
          <span>I'm a signal value!</span>
        </h2>
      </span>
    );
    await trigger(document.body, 'button', 'click');
    await expect(document.querySelector('#third')).toMatchDOM(
      <span id="third" class="after" {...qContainerAttr}>
        <h2>
          <span>I'm a updated signal value!</span>
        </h2>
      </span>
    );
  });

  it('should insert dangerouslySetInnerHTML via props', async () => {
    const Child = component$(({ htmlValue, html }: { htmlValue: string; html: string }) => {
      return (
        <div>
          <div>
            <span id="first" dangerouslySetInnerHTML="vanilla HTML here" />
          </div>
          <div>
            <span id="second" dangerouslySetInnerHTML="<h1>I'm an h1!</h1>" class="after" />
          </div>
          <div>
            <span id="third" dangerouslySetInnerHTML={htmlValue} class="after" />
          </div>
          <div>
            <span id="fourth" dangerouslySetInnerHTML={html} class="after" />
          </div>
        </div>
      );
    });
    const Parent = component$(() => {
      const htmlSignal = useSignal("<h2><span>I'm a signal value!</span></h2>");
      const html = '<h3>Test content</h3>';
      return (
        <>
          <Child htmlValue={htmlSignal.value} html={html} />
          <button
            onClick$={() =>
              (htmlSignal.value = "<h2><span>I'm a updated signal value!</span></h2>")
            }
          ></button>
        </>
      );
    });
    const { document } = await render(<Parent />, { debug });
    const qContainerAttr = { [QContainerAttr]: QContainerValue.HTML };
    await expect(document.querySelector('#first')).toMatchDOM(
      <span id="first" {...qContainerAttr}>
        vanilla HTML here
      </span>
    );
    await expect(document.querySelector('#second')).toMatchDOM(
      <span id="second" class="after" {...qContainerAttr}>
        <h1>I'm an h1!</h1>
      </span>
    );
    await expect(document.querySelector('#third')).toMatchDOM(
      <span id="third" class="after" {...qContainerAttr}>
        <h2>
          <span>I'm a signal value!</span>
        </h2>
      </span>
    );
    await expect(document.querySelector('#fourth')).toMatchDOM(
      <span id="fourth" class="after" {...qContainerAttr}>
        <h3>Test content</h3>
      </span>
    );

    await trigger(document.body, 'button', 'click');

    await expect(document.querySelector('#first')).toMatchDOM(
      <span id="first" {...qContainerAttr}>
        vanilla HTML here
      </span>
    );
    await expect(document.querySelector('#second')).toMatchDOM(
      <span id="second" class="after" {...qContainerAttr}>
        <h1>I'm an h1!</h1>
      </span>
    );
    await expect(document.querySelector('#third')).toMatchDOM(
      <span id="third" class="after" {...qContainerAttr}>
        <h2>
          <span>I'm a updated signal value!</span>
        </h2>
      </span>
    );
    await expect(document.querySelector('#fourth')).toMatchDOM(
      <span id="fourth" class="after" {...qContainerAttr}>
        <h3>Test content</h3>
      </span>
    );
  });

  it('should handle falsy values in dangerouslySetInnerHTML', async () => {
    const Cmp = component$(() => {
      return (
        <main>
          <div dangerouslySetInnerHTML={undefined}></div>
          <div dangerouslySetInnerHTML={null!}></div>
          {/* @ts-ignore-next-line */}
          <div dangerouslySetInnerHTML={false}></div>
        </main>
      );
    });
    const { document } = await render(<Cmp />, { debug });
    await expect(document.querySelector('main')).toMatchDOM(
      <main>
        <div></div>
        <div></div>
        <div></div>
      </main>
    );
  });

  it('should render textarea value', async () => {
    const Cmp = component$(() => {
      const signal = useSignal('value 123');
      return (
        <>
          <button onClick$={() => (signal.value += '!')}></button>
          <textarea value={signal.value}></textarea>
        </>
      );
    });

    const { document } = await render(<Cmp />, { debug });
    const qContainerAttr =
      render === ssrRenderToDom ? { [QContainerAttr]: QContainerValue.TEXT } : {};
    await expect(document.querySelector('textarea')).toMatchDOM(
      <textarea {...qContainerAttr}>value 123</textarea>
    );
    await trigger(document.body, 'button', 'click');
    await expect(document.querySelector('textarea')).toMatchDOM(
      <textarea {...qContainerAttr}>value 123!</textarea>
    );
  });

  it('should render textarea without error', async () => {
    const Textarea = component$<PropsOf<'textarea'>>(
      ({ ['bind:value']: valueSig, value, ...props }) => {
        return (
          <>
            <textarea {...props} value={valueSig ? valueSig.value : value} />
          </>
        );
      }
    );

    const Cmp = component$(() => {
      return <Textarea />;
    });

    const { document } = await render(<Cmp />, { debug });
    const qContainerAttr =
      render === ssrRenderToDom ? { [QContainerAttr]: QContainerValue.TEXT } : {};
    await expect(document.querySelector('textarea')).toMatchDOM(
      <textarea {...qContainerAttr}></textarea>
    );
  });

  it('should not render textarea value for non-text value', async () => {
    const qErrorSpy = vi.spyOn(qError, 'qError');
    const Cmp = component$(() => {
      const signal = useSignal(<h1>header</h1>);
      return (
        <>
          {/* @ts-ignore-next-line */}
          <textarea value={signal.value}></textarea>
        </>
      );
    });
    try {
      await render(
        <ErrorProvider>
          <div>
            <Cmp />
          </div>
        </ErrorProvider>,
        { debug }
      );
    } catch (e) {
      expect((e as Error).message).toBeDefined();
      expect(qErrorSpy).toHaveBeenCalledWith(QError.wrongTextareaValue, expect.anything());
    }
  });

  it('should not escape input value', async () => {
    const Cmp = component$(() => {
      const test = useSignal<string>();

      return (
        <div>
          <input
            type="text"
            value={test.value}
            onInput$={$((_, element) => {
              test.value = element.value;
            })}
          />

          <p>{test.value}</p>
        </div>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <div>
          <input type="text" />
          <p>
            <Signal ssr-required></Signal>
          </p>
        </div>
      </Component>
    );

    // simulate input
    const input = document.querySelector('input')!;
    input.value = "'";
    await trigger(document.body, input, 'input');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <div>
          <input type="text" value="'" />
          <p>
            <Signal ssr-required>'</Signal>
          </p>
        </div>
      </Component>
    );
  });

  it('should render correctly text node in the middle', async () => {
    const Cmp = component$(() => {
      const signal = useSignal<number>(0);
      return (
        <p onClick$={() => (signal.value = 123)}>
          <b>Test</b>
          {signal.value + 1}xx<span>{signal.value}</span>XXX<a></a>
        </p>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    await trigger(document.body, 'p', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <p>
          <b>Test</b>
          <Signal ssr-required>124</Signal>
          {'xx'}
          <span>
            <Signal ssr-required>123</Signal>
          </span>
          {'XXX'}
          <a></a>
        </p>
      </Component>
    );
    await expect(document.querySelector('p')).toMatchDOM(
      <p>
        <b>Test</b>
        {'124xx'}
        <span>123</span>
        {'XXX'}
        <a></a>
      </p>
    );
    expect(cleanupAttrs(document.querySelector('p')?.innerHTML)).toEqual(
      '<b>Test</b>124xx<span>123</span>XXX<a></a>'
    );
  });

  it('should execute all QRLs', async () => {
    const Cmp = component$(() => {
      const store1 = useStore({ count: 1 });
      const store2 = useStore({ count: 1 });

      const update = $(() => store2.count++);
      return (
        <button
          onClick$={[
            $(() => store1.count++),
            update,
            undefined,
            [
              null,
              // Note, this is the same as update but we only run the same chore once
              // Also, different AST so that later deduping of QRLs works
              $(() => (store2.count += 1)),
            ],
          ]}
        >
          {store1.count} / {store2.count}
        </button>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <Signal ssr-required>{'1'}</Signal> / <Signal ssr-required>{'1'}</Signal>
        </button>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <Signal ssr-required>{'2'}</Signal> / <Signal ssr-required>{'3'}</Signal>
        </button>
      </Component>
    );
  });

  it('should escape html tags', async () => {
    const Cmp = component$(() => {
      const counter = useSignal(0);
      const b = '<script></script>';
      return (
        <button onClick$={() => counter.value++}>
          {JSON.stringify(b)}
          {`&<'"`}
          {counter.value}
        </button>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          {'"<script></script>"'}
          {`&<'"`}
          <Signal ssr-required>{0}</Signal>
        </button>
      </Component>
    );

    await expect(document.querySelector('button')).toMatchDOM(
      <button>{`"<script></script>"&<'"0`}</button>
    );

    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          {'"<script></script>"'}
          {`&<'"`}
          <Signal ssr-required>{1}</Signal>
        </button>
      </Component>
    );

    await expect(document.querySelector('button')).toMatchDOM(
      <button>{`"<script></script>"&<'"1`}</button>
    );
  });

  it('should render correctly with comment nodes', async () => {
    const Cmp = component$(() => {
      const counter = useSignal(0);
      const doubleCounter = useComputed$(() => counter.value * 2);
      return (
        <>
          <SSRComment data="test comment" />
          <button onClick$={() => counter.value++}></button>
          {counter.value}
          <SSRComment data="test comment 2" />
          <div>{doubleCounter.value}</div>
          <SSRComment data="test comment 3" />
        </>
      );
    });
    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Signal ssr-required>0</Signal>
          <div>
            <Signal ssr-required>0</Signal>
          </div>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Signal ssr-required>1</Signal>
          <div>
            <Signal ssr-required>2</Signal>
          </div>
        </Fragment>
      </Component>
    );
  });

  it('should rerender components with the same key and different props', async () => {
    const Child = component$<{ value: number; active: boolean }>((props) => {
      return (
        <div>
          Child {props.value}, active: {props.active ? 'true' : 'false'}
        </div>
      );
    });

    const Cmp = component$(() => {
      const signal = useSignal(1);

      const children = [1, 2];

      return (
        <div>
          <button id="button-1" onClick$={() => (signal.value = 1)}>
            1
          </button>
          <button id="button-2" onClick$={() => (signal.value = 2)}>
            2
          </button>

          <>
            {children.map((value) => {
              return <Child key={value} value={value} active={signal.value === value} />;
            })}
          </>
        </div>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    await trigger(document.body, '#button-2', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button id="button-1">1</button>
          <button id="button-2">2</button>
          <Fragment>
            <Component>
              <div>
                {'Child '}
                {'1'}
                {', active: '}
                <Signal ssr-required>{'false'}</Signal>
              </div>
            </Component>
            <Component>
              <div>
                {'Child '}
                {'2'}
                {', active: '}
                <Signal ssr-required>{'true'}</Signal>
              </div>
            </Component>
          </Fragment>
        </div>
      </Component>
    );
    await trigger(document.body, '#button-1', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button id="button-1">1</button>
          <button id="button-2">2</button>
          <Fragment>
            <Component>
              <div>
                {'Child '}
                {'1'}
                {', active: '}
                <Signal ssr-required>{'true'}</Signal>
              </div>
            </Component>
            <Component>
              <div>
                {'Child '}
                {'2'}
                {', active: '}
                <Signal ssr-required>{'false'}</Signal>
              </div>
            </Component>
          </Fragment>
        </div>
      </Component>
    );
  });

  it('should preserve the same elements', async () => {
    const Cmp = component$(() => {
      const keys = useSignal(['A', 'B', 'C']);

      return (
        <div onClick$={() => (keys.value = ['B', 'C', 'A'])}>
          {keys.value.map((key) => (
            <span key={key} id={key}>
              {key}
            </span>
          ))}
        </div>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <span id="A">A</span>
          <span id="B">B</span>
          <span id="C">C</span>
        </div>
      </Component>
    );
    const a1 = document.getElementById('A');
    const b1 = document.getElementById('B');
    const c1 = document.getElementById('C');
    await trigger(document.body, 'div', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <span id="B">B</span>
          <span id="C">C</span>
          <span id="A">A</span>
        </div>
      </Component>
    );
    const a2 = document.getElementById('A');
    const b2 = document.getElementById('B');
    const c2 = document.getElementById('C');
    expect(a1).toBe(a2);
    expect(b1).toBe(b2);
    expect(c1).toBe(c2);
  });

  it('should render correctly component only with text node and node sibling', async () => {
    const Child = component$(() => {
      return <>0</>;
    });
    const Parent = component$(() => {
      return (
        <>
          <div>
            <Child />
          </div>
          <span>test</span>
        </>
      );
    });
    const { vNode } = await render(<Parent />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <div>
            <Component>
              <Fragment>0</Fragment>
            </Component>
          </div>
          <span>test</span>
        </Fragment>
      </Component>
    );
  });

  it('should rerender both text nodes', async () => {
    const SecretForm = component$(() => {
      const message = useSignal('');
      const secret = useSignal('');

      return (
        <>
          {message.value && <p>{message.value}</p>}
          {secret.value && <p>{secret.value}</p>}
          <button
            onClick$={() => {
              message.value = 'foo';
              secret.value = 'bar';
            }}
          ></button>
        </>
      );
    });

    const { vNode, document } = await render(<SecretForm />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment ssr-required>
          {''}
          {''}
          <button></button>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment ssr-required>
          <p>
            <Signal ssr-required>{'foo'}</Signal>
          </p>
          <p>
            <Signal ssr-required>{'bar'}</Signal>
          </p>
          <button></button>
        </Fragment>
      </Component>
    );
  });

  it('should render all components', async () => {
    const Ref = component$((props: { id: string }) => {
      return <div id={props.id} />;
    });

    const Cmp = component$(() => {
      const state = useStore({
        visible: false,
      });

      useVisibleTask$(() => {
        state.visible = true;
      });
      return (
        <div id="parent">
          <Ref id="static" key={1}></Ref>
          {state.visible && <Ref id="dynamic" key={'11'}></Ref>}

          <Ref id="static-2" key={2}></Ref>
          {state.visible && <Ref id="dynamic-2" key={'22'}></Ref>}

          <Ref id="static-3" key={3}></Ref>
          {state.visible && <Ref id="dynamic-3" key={'33'}></Ref>}
        </div>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });

    if (render === ssrRenderToDom) {
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <div id="parent">
            <div id="static"></div>
            <div id="static-2"></div>
            <div id="static-3"></div>
          </div>
        </Component>
      );
      await trigger(document.body, '#parent', 'qvisible');
    }

    expect(vNode).toMatchVDOM(
      <Component>
        <div id="parent">
          <Component>
            <div id="static"></div>
          </Component>
          <Component>
            <div id="dynamic"></div>
          </Component>
          <Component>
            <div id="static-2"></div>
          </Component>
          <Component>
            <div id="dynamic-2"></div>
          </Component>
          <Component>
            <div id="static-3"></div>
          </Component>
          <Component>
            <div id="dynamic-3"></div>
          </Component>
        </div>
      </Component>
    );
  });

  it('should destructure arguments', async () => {
    const PropsDestructuring = component$(
      ({ message, id, count: c, ...rest }: Record<string, any>) => {
        const renders = useStore(
          { renders: 0 },
          {
            reactive: false,
          }
        );
        renders.renders++;
        const rerenders = renders.renders + 0;
        return (
          <div id={id}>
            <span {...rest}>
              {message} {c}
            </span>
            <div class="renders">{rerenders}</div>
          </div>
        );
      }
    );

    const MyComp = component$(() => {
      const state = useSignal(0);
      return (
        <>
          <button
            id="increment"
            onClick$={() => {
              state.value++;
            }}
          >
            Increment
          </button>
          <PropsDestructuring
            message="Hello"
            count={state.value}
            id="props-destructuring"
            aria-hidden="true"
          />
        </>
      );
    });
    const { vNode, document } = await render(<MyComp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button id="increment">Increment</button>
          <Component>
            <div id="props-destructuring">
              <span aria-hidden="true">
                {'Hello '}
                <Signal ssr-required>0</Signal>
              </span>
              <div class="renders">1</div>
            </div>
          </Component>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button id="increment">Increment</button>
          <Component>
            <div id="props-destructuring">
              <span aria-hidden="true">
                {'Hello '}
                <Signal ssr-required>1</Signal>
              </span>
              <div class="renders">1</div>
            </div>
          </Component>
        </Fragment>
      </Component>
    );
  });

  it('should skip render', async () => {
    const SkipRenderTest = component$(() => {
      const count = useSignal(0);
      if (count.value % 3 !== 0) {
        return SkipRender;
      }
      const countV = count.value + '';
      return (
        <>
          <button onClick$={() => count.value++}>Increment {countV}</button>
          <div>Number: {count.value}</div>
        </>
      );
    });

    const { vNode, document } = await render(<SkipRenderTest />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            {'Increment '}
            {'0'}
          </button>
          <div>
            {'Number: '}
            <Signal ssr-required>0</Signal>
          </div>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            {'Increment '}
            {'0'}
          </button>
          <div>
            {'Number: '}
            <Signal ssr-required>1</Signal>
          </div>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            {'Increment '}
            {'0'}
          </button>
          <div>
            {'Number: '}
            <Signal ssr-required>2</Signal>
          </div>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            {'Increment '}
            {'3'}
          </button>
          <div>
            {'Number: '}
            <Signal ssr-required>3</Signal>
          </div>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            {'Increment '}
            {'3'}
          </button>
          <div>
            {'Number: '}
            <Signal ssr-required>4</Signal>
          </div>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            {'Increment '}
            {'3'}
          </button>
          <div>
            {'Number: '}
            <Signal ssr-required>5</Signal>
          </div>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>
            {'Increment '}
            {'6'}
          </button>
          <div>
            {'Number: '}
            <Signal ssr-required>6</Signal>
          </div>
        </Fragment>
      </Component>
    );
  });

  it('should update signals', async () => {
    const MultipleServerFunctionsInvokedInTask = component$(() => {
      const methodA = useSignal('');
      const methodB = useSignal('');
      const ref = useSignal<Element>();

      useVisibleTask$(async () => {
        const [error /*, data */] = await ['SomeError', 'ignore payload'];
        if (error) {
          methodA.value = error;
        }
        await delay(1);
        //     err, method
        const [, method] = await ['ignore error', 'POST'];
        methodB.value = method;
      });

      return (
        <div
          ref={ref}
          id="server-error"
          onClick$={() => {
            // Cause the VNode's to be deserialized
            if (!ref.value) {
              throw new Error('ref is not set');
            }
          }}
        >
          <b>(</b>
          {methodA.value}
          {methodB.value}
          <b>)</b>
        </div>
      );
    });
    const { document } = await render(<MultipleServerFunctionsInvokedInTask />, { debug });
    const div = document.querySelector('#server-error')!;
    // console.log('vNode', String(vNode));
    await trigger(document.body, 'div', 'click');
    // console.log('vNode', String(vNode));
    await trigger(document.body, 'div', 'qvisible');
    await delay(10);
    // console.log('vNode', String(vNode));
    // console.log('>>>>', div.outerHTML);
    expect(cleanupAttrs(div.innerHTML)).toEqual('<b>(</b>SomeErrorPOST<b>)</b>');
  });

  it('should render items in order', async () => {
    const Item = component$(({ countSig }: { countSig: SignalType<number> }) => {
      const itemNum = useSignal(0);

      useTask$(() => {
        itemNum.value = ++countSig.value;
      });

      return <div>Item {itemNum.value}</div>;
    });

    const Cmp = component$(() => {
      const countSig = useSignal(0);

      return (
        <div id="container">
          <Item countSig={countSig} />
          <Item countSig={countSig} />
          <Item countSig={countSig} />
          <Item countSig={countSig} />
        </div>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <div id="container">
          <Component>
            <div>
              {'Item '}
              <Signal>1</Signal>
            </div>
          </Component>
          <Component>
            <div>
              {'Item '}
              <Signal>2</Signal>
            </div>
          </Component>
          <Component>
            <div>
              {'Item '}
              <Signal>3</Signal>
            </div>
          </Component>
          <Component>
            <div>
              {'Item '}
              <Signal>4</Signal>
            </div>
          </Component>
        </div>
      </Component>
    );

    expect(document.querySelector('#container')).toMatchDOM(
      <div id="container">
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
        <div>Item 4</div>
      </div>
    );
  });

  it('should rerender components with projection and condition after sort', async () => {
    interface Item {
      id: string;
      level: number;
      value: {
        title: string;
      };
    }

    const SecondChild = component$((props: any) => {
      return props.title + props.index;
    });

    const FirstChild = component$<{ item: Item; index: number }>((props) => {
      return (
        <div>
          <Slot />
          {props.item.level === 1 && (
            <SecondChild title={props.item.value.title} index={props.index} />
          )}
        </div>
      );
    });

    const Parent = component$(() => {
      const data = useStore<{ items: Item[] }>({
        items: [
          {
            id: 'foo',
            level: 1,
            value: {
              title: 'qwik 1',
            },
          },
          {
            id: 'aaa',
            level: 2,
            value: {
              title: 'qwik 2',
            },
          },
          {
            id: 'bar',
            level: 1,
            value: {
              title: 'qwik 3',
            },
          },
        ],
      });

      return (
        <div>
          <button
            onClick$={() => {
              data.items.sort((a, b) => a.id.localeCompare(b.id));
            }}
          ></button>
          <section>
            {data.items.map((item, index) => {
              return (
                <FirstChild key={item.id} item={item} index={index}>
                  <span>{index}</span>
                </FirstChild>
              );
            })}
          </section>
        </div>
      );
    });

    const { vNode, document } = await render(<Parent />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button></button>
          <section>
            <Component>
              <div>
                <Projection>
                  <span>0</span>
                </Projection>
                <Component>qwik 10</Component>
              </div>
            </Component>
            <Component>
              <div>
                <Projection>
                  <span>1</span>
                </Projection>
                {''}
              </div>
            </Component>
            <Component>
              <div>
                <Projection>
                  <span>2</span>
                </Projection>
                <Component>qwik 32</Component>
              </div>
            </Component>
          </section>
        </div>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button></button>
          <section>
            <Component>
              <div>
                <Projection>
                  <span>0</span>
                </Projection>
                {''}
              </div>
            </Component>
            <Component>
              <div>
                <Projection>
                  <span>1</span>
                </Projection>
                <Component>qwik 31</Component>
              </div>
            </Component>
            <Component>
              <div>
                <Projection>
                  <span>2</span>
                </Projection>
                <Component>qwik 12</Component>
              </div>
            </Component>
          </section>
        </div>
      </Component>
    );
  });

  it('should not reuse old element with the same element name and different const props', async () => {
    const Cmp = component$(() => {
      const toggle = useSignal(false);
      return (
        <div>
          <button onClick$={() => (toggle.value = !toggle.value)}>Toggle</button>
          {toggle.value ? (
            <>
              <input id="input1" />
            </>
          ) : (
            <>
              <input id="input2" />
            </>
          )}
        </div>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button>Toggle</button>
          <Fragment>
            <input id="input2"></input>
          </Fragment>
        </div>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button>Toggle</button>
          <Fragment>
            <input id="input1"></input>
          </Fragment>
        </div>
      </Component>
    );
  });

  it('should not rerender elements inside dom element and fragment with different namespace', async () => {
    const AttributesChild = component$(() => {
      const input = useSignal('');
      const state = useStore({
        stuff: '',
      });

      // rerender component
      state.stuff;
      return (
        <>
          <button
            onClick$={() => {
              state.stuff += '0';
            }}
          >
            Add stuff (caused render)
          </button>
          <div>
            <>
              <input
                id="input1"
                onInput$={(_, el) => {
                  input.value = el.value;
                }}
              />
              <svg />
            </>
          </div>
        </>
      );
    });

    const { vNode, document } = await render(<AttributesChild />, { debug });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>Add stuff (caused render)</button>
          <div>
            <Fragment ssr-required>
              <input id="input1"></input>
              <svg />
            </Fragment>
          </div>
        </Fragment>
      </Component>
    );

    const input = document.querySelector('input#input1') as HTMLInputElement;
    input.value = 'test1';
    await trigger(document.body, input, 'input#input1');

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>Add stuff (caused render)</button>
          <div>
            <Fragment ssr-required>
              <input id="input1" value="test1"></input>
              <svg />
            </Fragment>
          </div>
        </Fragment>
      </Component>
    );

    expect((document.querySelector('input#input1') as HTMLInputElement).value).toBe('test1');
  });

  it('should not rerender elements inside dom element and fragment', async () => {
    const AttributesChild = component$(() => {
      const input = useSignal('');
      const state = useStore({
        stuff: '',
      });

      // rerender component
      state.stuff;
      return (
        <>
          <button
            onClick$={() => {
              state.stuff += '0';
            }}
          >
            Add stuff (caused render)
          </button>
          <div>
            <>
              <input
                id="input1"
                onInput$={(_, el) => {
                  input.value = el.value;
                }}
              />
              <>
                <input
                  id="input2"
                  onInput$={(_, el) => {
                    input.value = el.value;
                  }}
                />
              </>
              <input
                id="input3"
                onInput$={(_, el) => {
                  input.value = el.value;
                }}
              />
              <input
                id="input4"
                onInput$={(_, el) => {
                  input.value = el.value;
                }}
              />
            </>
            <input
              id="input5"
              onInput$={(_, el) => {
                input.value = el.value;
              }}
            />
          </div>
        </>
      );
    });

    const { vNode, document } = await render(<AttributesChild />, { debug });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>Add stuff (caused render)</button>
          <div>
            <Fragment ssr-required>
              <input id="input1"></input>
              <Fragment ssr-required>
                <input id="input2"></input>
              </Fragment>
              <input id="input3"></input>
              <input id="input4"></input>
            </Fragment>
            <input id="input5"></input>
          </div>
        </Fragment>
      </Component>
    );

    const input = document.querySelector('input#input1') as HTMLInputElement;
    input.value = 'test1';
    await trigger(document.body, input, 'input#input1');

    const input2 = document.querySelector('input#input2') as HTMLInputElement;
    input2.value = 'test2';
    await trigger(document.body, input2, 'input#input2');

    const input3 = document.querySelector('input#input3') as HTMLInputElement;
    input3.value = 'test3';
    await trigger(document.body, input3, 'input#input3');

    const input4 = document.querySelector('input#input4') as HTMLInputElement;
    input4.value = 'test4';
    await trigger(document.body, input4, 'input#input4');

    const input5 = document.querySelector('input#input5') as HTMLInputElement;
    input5.value = 'test5';
    await trigger(document.body, input4, 'input#input5');

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button>Add stuff (caused render)</button>
          <div>
            <Fragment ssr-required>
              <input id="input1" value="test1"></input>
              <Fragment ssr-required>
                <input id="input2" value="test2"></input>
              </Fragment>
              <input id="input3" value="test3"></input>
              <input id="input4" value="test4"></input>
            </Fragment>
            <input id="input5" value="test5"></input>
          </div>
        </Fragment>
      </Component>
    );

    expect((document.querySelector('input#input1') as HTMLInputElement).value).toBe('test1');
    expect((document.querySelector('input#input2') as HTMLInputElement).value).toBe('test2');
    expect((document.querySelector('input#input3') as HTMLInputElement).value).toBe('test3');
    expect((document.querySelector('input#input4') as HTMLInputElement).value).toBe('test4');
    expect((document.querySelector('input#input5') as HTMLInputElement).value).toBe('test5');
  });

  it('should rerender with new props', async () => {
    const TestA = component$<any>((props) => {
      return (
        <button type="button" {...props}>
          <Slot />
        </button>
      );
    });

    const TestB = component$<any>((props) => {
      return (
        <TestA {...props}>
          <Slot />
        </TestA>
      );
    });

    const Cmp = component$(() => {
      const toggled = useSignal<boolean>(false);

      return (
        <TestB
          aria-label={toggled.value ? 'a' : 'a1'}
          title={toggled.value ? 'a' : 'a1'}
          onClick$={() => {
            toggled.value = !toggled.value;
          }}
        >
          <span>Hello, World!</span>
        </TestB>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <Component ssr-required>
            <button type="button" aria-label="a1" title="a1">
              <Projection ssr-required>
                <Projection ssr-required>
                  <span>Hello, World!</span>
                </Projection>
              </Projection>
            </button>
          </Component>
        </Component>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <Component ssr-required>
            <button type="button" aria-label="a" title="a">
              <Projection ssr-required>
                <Projection ssr-required>
                  <span>Hello, World!</span>
                </Projection>
              </Projection>
            </button>
          </Component>
        </Component>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <Component ssr-required>
            <button type="button" aria-label="a1" title="a1">
              <Projection ssr-required>
                <Projection ssr-required>
                  <span>Hello, World!</span>
                </Projection>
              </Projection>
            </button>
          </Component>
        </Component>
      </Component>
    );
  });

  it('should correctly move to next sibling during inserting a new component instance after rerender', async () => {
    const Child = component$(() => {
      return <div></div>;
    });

    const Parent = component$(() => {
      const store = useStore<{ message?: string }>({
        message: undefined,
      });
      return (
        <div id="test">
          <button
            onClick$={() => {
              if (store.message) {
                store.message = undefined;
              } else {
                store.message = 'Hello';
              }
            }}
          ></button>
          <section key={store.message}>
            <Slot />
          </section>
        </div>
      );
    });

    const Cmp = component$(() => {
      return (
        <>
          <Slot />
        </>
      );
    });

    const Cmp2 = component$(() => {
      const counter = useSignal(0);
      return (
        <>
          <Cmp key={counter.value}>
            <Parent>
              <Child />
            </Parent>
          </Cmp>
          <button id="counter" onClick$={() => counter.value++}></button>
        </>
      );
    });

    const { vNode, document } = await render(<Cmp2 />, { debug });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component ssr-required>
            <Fragment ssr-required>
              <Projection ssr-required>
                <Component ssr-required>
                  <div id="test">
                    <button></button>
                    <section>
                      <Projection ssr-required>
                        <Component ssr-required>
                          <div></div>
                        </Component>
                      </Projection>
                    </section>
                  </div>
                </Component>
              </Projection>
            </Fragment>
          </Component>
          <button id="counter"></button>
        </Fragment>
      </Component>
    );
    await trigger(document.body, '#counter', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component ssr-required>
            <Fragment ssr-required>
              <Projection ssr-required>
                <Component ssr-required>
                  <div id="test">
                    <button></button>
                    <section>
                      <Projection ssr-required>
                        <Component ssr-required>
                          <div></div>
                        </Component>
                      </Projection>
                    </section>
                  </div>
                </Component>
              </Projection>
            </Fragment>
          </Component>
          <button id="counter"></button>
        </Fragment>
      </Component>
    );
  });

  it('should correctly insert new component if keys are the same', async () => {
    const InnerCmp1 = component$(() => {
      return <Slot />;
    });
    const InnerCmp2 = component$(() => {
      return <Slot />;
    });

    const Cmp = component$(() => {
      return <Slot />;
    });

    const Parent = component$(() => {
      const toggle = useSignal(false);
      return (
        <>
          <Cmp>
            {toggle.value ? (
              <InnerCmp1 key="abc">InnerCmp1</InnerCmp1>
            ) : (
              <InnerCmp2 key="abc">InnerCmp2</InnerCmp2>
            )}
          </Cmp>
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
        </>
      );
    });

    const { vNode, document } = await render(<Parent />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component ssr-required>
            <Fragment ssr-required>
              <Component ssr-required>
                <Fragment ssr-required>InnerCmp2</Fragment>
              </Component>
            </Fragment>
          </Component>
          <button></button>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Component ssr-required>
            <Fragment ssr-required>
              <Component ssr-required>
                <Fragment ssr-required>InnerCmp1</Fragment>
              </Component>
            </Fragment>
          </Component>
          <button></button>
        </Fragment>
      </Component>
    );
  });

  it('should reexecute entire component without key', async () => {
    const Child = component$((props: { text: string }) => {
      const text = useSignal('');
      useTask$(() => {
        text.value = props.text;
      });
      return <div>{text.value}</div>;
    });

    const Cmp = component$(() => {
      const toggle = useSignal(true);

      return (
        <>
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
          {/* no key for both components */}
          {toggle.value ? jsx(Child, { text: 'Hello' }, null) : jsx(Child, { text: 'World' }, null)}
        </>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Component ssr-required>
            <div>
              <Signal ssr-required>Hello</Signal>
            </div>
          </Component>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Component ssr-required>
            <div>
              <Signal ssr-required>World</Signal>
            </div>
          </Component>
        </Fragment>
      </Component>
    );
  });

  it('should remove component with null key when it is compared with fragment with null key', async () => {
    const InnerCmp = component$(() => {
      return <div>InnerCmp</div>;
    });

    const Cmp = component$(() => {
      const toggle = useSignal(true);

      return (
        <>
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
          {toggle.value ? (
            <InnerCmp key={null} />
          ) : (
            <Fragment key={null}>
              <h1>Test</h1>
            </Fragment>
          )}
        </>
      );
    });

    const { vNode, document, container } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Component ssr-required>
            <div>InnerCmp</div>
          </Component>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Fragment ssr-required>
            <h1>Test</h1>
          </Fragment>
        </Fragment>
      </Component>
    );
    const h1Element = vnode_locate(container.rootVNode, document.querySelector('h1')!);

    expect(h1Element.parent!.getProp(OnRenderProp, null)).toBeNull();
  });

  it('should reuse the same props instance when props are changing', async () => {
    (globalThis as any).logs = [];
    type ChildProps = {
      obj: string;
      foo: SignalType<number>;
    };
    const Child = component$<ChildProps>(({ obj, foo }) => {
      (globalThis as any).logs.push('child render ' + obj);
      useTask$(({ track }) => {
        foo && track(foo);
        (globalThis as any).logs.push(obj);
      });
      return <></>;
    });

    const Cmp = component$(() => {
      const foo = useSignal(0);
      (globalThis as any).logs.push('parent render');
      return (
        <div>
          <button
            onClick$={() => {
              foo.value === 0 ? (foo.value = 1) : (foo.value = 0);
            }}
          >
            click
          </button>
          <Child obj={globalObj[foo.value]} foo={foo} />
        </div>
      );
    });

    const { document } = await render(<Cmp />, { debug });

    await trigger(document.body, 'button', 'click');

    expect((globalThis as any).logs).toEqual([
      'parent render',
      'child render foo',
      'foo',
      'parent render',
      'bar',
      'child render bar',
    ]);

    (globalThis as any).logs = undefined;
  });

  it('should change component props to new one for the same component with the same key', async () => {
    (globalThis as any).logs = [];
    const FirstCmp = component$((props: { foo?: string; bar?: string }) => {
      (globalThis as any).logs.push('foo' in props, 'bar' in props);
      return <div>{props.foo}</div>;
    });

    const Cmp = component$(() => {
      const toggle = useSignal(true);
      return (
        <>
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
          {toggle.value ? <FirstCmp key="1" foo="foo" /> : <FirstCmp key="1" bar="bar" />}
        </>
      );
    });

    const { document } = await render(<Cmp />, { debug });
    expect((globalThis as any).logs).toEqual([true, false]);
    await trigger(document.body, 'button', 'click');
    expect((globalThis as any).logs).toEqual([true, false, false, true]);
    await trigger(document.body, 'button', 'click');
    expect((globalThis as any).logs).toEqual([true, false, false, true, true, false]);
    (globalThis as any).logs = undefined;
  });

  it('should early materialize element with ref property', async () => {
    const Cmp = component$(() => {
      const element = useSignal<HTMLDivElement>();
      const listToForceReRender = useSignal([]);

      useVisibleTask$(() => {
        element.value!.innerHTML = 'I am the innerHTML content!';
      });

      return (
        <div>
          <div ref={element} />
          <button
            onClick$={() => {
              listToForceReRender.value = [];
            }}
          >
            Render
          </button>
          {listToForceReRender.value.map(() => (
            <div />
          ))}
        </div>
      );
    });

    const { document } = await render(<Cmp />, { debug });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'div', 'qvisible');
    }
    await trigger(document.body, 'button', 'click');
    expect(document.body.innerHTML).toContain('I am the innerHTML content!');
  });

  it('should not throw when props are null', async () => {
    const Child = component$((props: any) => {
      props = (globalThis as any).stuff ? (globalThis as any).foo : (globalThis as any).bar;
      return <div {...props} />;
    });
    const Cmp = component$(() => {
      return <Child />;
    });
    const { document } = await render(<Cmp />, { debug });
    await expect(document.querySelector('div')).toMatchDOM(<div />);
  });

  it('should correctly remove all children for empty array', async () => {
    const Cmp = component$(() => {
      const list = useSignal([1, 2, 3]);
      return (
        <main>
          <button onClick$={() => (list.value = [])}>Remove</button>
          {list.value.map((item) => (
            <div>{item}</div>
          ))}
        </main>
      );
    });
    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <main>
          <button>Remove</button>
          <div>1</div>
          <div>2</div>
          <div>3</div>
        </main>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <main>
          <button>Remove</button>
        </main>
      </Component>
    );
    expect(document.querySelector('main')).toMatchDOM(
      <main>
        <button>Remove</button>
      </main>
    );
  });

  it('should correctly remove all children for empty array - case 2', async () => {
    const Cmp = component$(() => {
      const list = useSignal([1, 2, 3]);
      return (
        <main>
          <button onClick$={() => (list.value = [])}>Remove</button>
          <div>
            {list.value.map((item) => (
              <div>{item}</div>
            ))}
          </div>
        </main>
      );
    });
    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <main>
          <button>Remove</button>
          <div>
            <div>1</div>
            <div>2</div>
            <div>3</div>
          </div>
        </main>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <main>
          <button>Remove</button>
          <div></div>
        </main>
      </Component>
    );
    expect(document.querySelector('main')).toMatchDOM(
      <main>
        <button>Remove</button>
        <div></div>
      </main>
    );
  });

  it('should correctly remove all children for empty array within virtual node', async () => {
    const Cmp = component$(() => {
      const list = useSignal([1, 2, 3]);
      return (
        <main>
          <button onClick$={() => (list.value = [])}>Remove</button>
          <>
            {list.value.map((item) => (
              <div>{item}</div>
            ))}
          </>
        </main>
      );
    });
    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <main>
          <button>Remove</button>
          <Fragment ssr-required>
            <div>1</div>
            <div>2</div>
            <div>3</div>
          </Fragment>
        </main>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <main>
          <button>Remove</button>
          <Fragment ssr-required></Fragment>
        </main>
      </Component>
    );
    await expect(document.querySelector('main')).toMatchDOM(
      <main>
        <button>Remove</button>
      </main>
    );
  });

  describe('regression', () => {
    it('#3643', async () => {
      const Issue3643 = component$(() => {
        const toggle = useSignal(false);
        return (
          <main>
            <button onClick$={() => (toggle.value = !toggle.value)}>Toggle</button>
            <div>
              {toggle.value
                ? h('div', {}, 'World')
                : h('div', { dangerouslySetInnerHTML: 'Hello' })}
            </div>
            <div>
              {toggle.value
                ? jsx('div', { children: 'World' })
                : jsx('div', { dangerouslySetInnerHTML: 'Hello' })}
            </div>
          </main>
        );
      });
      const { document, container } = await render(<Issue3643 />, { debug });
      const qContainerAttr = { [QContainerAttr]: QContainerValue.HTML };
      await expect(document.querySelector('main')).toMatchDOM(
        <main>
          <button>Toggle</button>
          <div>
            <div {...qContainerAttr}>Hello</div>
          </div>
          <div>
            <div {...qContainerAttr}>Hello</div>
          </div>
        </main>
      );

      await trigger(container.element, 'button', 'click');
      await expect(document.querySelector('main')).toMatchDOM(
        <main>
          <button>Toggle</button>
          <div>
            <div>World</div>
          </div>
          <div>
            <div>World</div>
          </div>
        </main>
      );

      await trigger(container.element, 'button', 'click');
      await expect(document.querySelector('main')).toMatchDOM(
        <main>
          <button>Toggle</button>
          <div>
            <div {...qContainerAttr}>Hello</div>
          </div>
          <div>
            <div {...qContainerAttr}>Hello</div>
          </div>
        </main>
      );

      await trigger(container.element, 'button', 'click');
      await expect(document.querySelector('main')).toMatchDOM(
        <main>
          <button>Toggle</button>
          <div>
            <div>World</div>
          </div>
          <div>
            <div>World</div>
          </div>
        </main>
      );

      await trigger(container.element, 'button', 'click');
      await expect(document.querySelector('main')).toMatchDOM(
        <main>
          <button>Toggle</button>
          <div>
            <div {...qContainerAttr}>Hello</div>
          </div>
          <div>
            <div {...qContainerAttr}>Hello</div>
          </div>
        </main>
      );
    });

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
                <Signal ssr-required>
                  <span>Hi, this doesn't work...</span>
                </Signal>
                <p>
                  {'isShow value: '}
                  <Signal ssr-required>{'true'}</Signal>
                </p>
                <button id="first">Toggle</button>
              </div>
            </Component>
            <Component>
              <div>
                <Signal ssr-required>
                  <Component>
                    <div>Nested</div>
                  </Component>
                </Signal>
                <p>
                  {'isShow value: '}
                  <Signal ssr-required>{'true'}</Signal>
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
                <Signal ssr-required>{''}</Signal>
                <p>
                  {'isShow value: '}
                  <Signal ssr-required>{'false'}</Signal>
                </p>
                <button id="first">Toggle</button>
              </div>
            </Component>
            <Component>
              <div>
                <Signal ssr-required>
                  <Component>
                    <div>Nested</div>
                  </Component>
                </Signal>
                <p>
                  {'isShow value: '}
                  <Signal ssr-required>{'true'}</Signal>
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
                <Signal ssr-required>{''}</Signal>
                <p>
                  {'isShow value: '}
                  <Signal ssr-required>{'false'}</Signal>
                </p>
                <button id="first">Toggle</button>
              </div>
            </Component>
            <Component>
              <div>
                <Signal ssr-required>{''}</Signal>
                <p>
                  {'isShow value: '}
                  <Signal ssr-required>{'false'}</Signal>
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
                <Signal ssr-required>
                  <span>Hi, this doesn't work...</span>
                </Signal>
                <p>
                  {'isShow value: '}
                  <Signal ssr-required>{'true'}</Signal>
                </p>
                <button id="first">Toggle</button>
              </div>
            </Component>
            <Component>
              <div>
                <Signal ssr-required>{''}</Signal>
                <p>
                  {'isShow value: '}
                  <Signal ssr-required>{'false'}</Signal>
                </p>
                <button id="second">Toggle</button>
              </div>
            </Component>
          </Fragment>
        </Component>
      );
    });

    it('#6585 - reactivity should work with template literals', async () => {
      const Cmp = component$(() => {
        const useFoo = (count: SignalType<number>) => {
          const tag = (s: string | TemplateStringsArray) => {
            const value = typeof s === 'string' ? s : s[0];
            return `${value}-${count.value}`;
          };
          return tag;
        };
        const count = useSignal(0);
        const foo = useFoo(count);
        return (
          <>
            <p>{foo('test')}</p>
            <p>{foo`test`}</p>
            <button
              onClick$={() => {
                count.value++;
              }}
            >
              Count up
            </button>
          </>
        );
      });

      const { vNode, document } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <p>test-0</p>
            <p>test-0</p>
            <button>Count up</button>
          </Fragment>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <p>test-1</p>
            <p>test-1</p>
            <button>Count up</button>
          </Fragment>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <p>test-2</p>
            <p>test-2</p>
            <button>Count up</button>
          </Fragment>
        </Component>
      );
    });

    it('#7203 - should correctly move found vnode', async () => {
      const Cmp = component$(() => {
        const type = useSignal<'A' | 'B' | 'C'>('B');

        return (
          <>
            <div>
              <button
                id="A"
                type="button"
                onClick$={$(() => {
                  type.value = 'A';
                })}
              >
                Select A
              </button>

              <button
                id="B"
                type="button"
                onClick$={$(() => {
                  type.value = 'B';
                })}
              >
                Select B
              </button>

              <button
                id="C"
                type="button"
                onClick$={$(() => {
                  type.value = 'C';
                })}
              >
                Select C
              </button>
            </div>

            {type.value === 'A' ? (
              <>
                <p>A</p>
              </>
            ) : undefined}

            {type.value === 'B' ? (
              <>
                <p>B</p>
              </>
            ) : undefined}

            {type.value === 'C' ? (
              <>
                <p>C</p>
              </>
            ) : undefined}

            {type.value !== 'C' ? (
              <>
                <p>A or B</p>
              </>
            ) : undefined}
          </>
        );
      });

      const { vNode, document } = await render(<Cmp />, { debug });

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <div>
              <button id="A" type="button">
                Select A
              </button>
              <button id="B" type="button">
                Select B
              </button>
              <button id="C" type="button">
                Select C
              </button>
            </div>
            {''}
            <Fragment ssr-required>
              <p>B</p>
            </Fragment>
            {''}
            <Fragment ssr-required>
              <p>A or B</p>
            </Fragment>
          </Fragment>
        </Component>
      );

      await trigger(document.body, '#A', 'click');

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <div>
              <button id="A" type="button">
                Select A
              </button>
              <button id="B" type="button">
                Select B
              </button>
              <button id="C" type="button">
                Select C
              </button>
            </div>
            <Fragment ssr-required>
              <p>A</p>
            </Fragment>
            {''}
            {''}
            <Fragment ssr-required>
              <p>A or B</p>
            </Fragment>
          </Fragment>
        </Component>
      );

      await trigger(document.body, '#C', 'click');

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <div>
              <button id="A" type="button">
                Select A
              </button>
              <button id="B" type="button">
                Select B
              </button>
              <button id="C" type="button">
                Select C
              </button>
            </div>
            {''}
            {''}
            <Fragment ssr-required>
              <p>C</p>
            </Fragment>
            {''}
          </Fragment>
        </Component>
      );

      await trigger(document.body, '#B', 'click');

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <div>
              <button id="A" type="button">
                Select A
              </button>
              <button id="B" type="button">
                Select B
              </button>
              <button id="C" type="button">
                Select C
              </button>
            </div>
            {''}
            <Fragment ssr-required>
              <p>B</p>
            </Fragment>
            {''}
            <Fragment ssr-required>
              <p>A or B</p>
            </Fragment>
          </Fragment>
        </Component>
      );
    });

    it('#7531 - should correctly materialize vnodes with keys including special characters', async () => {
      const ChildComp = component$(() => {
        return <></>;
      });

      const Cmp = component$(() => {
        const toggle = useSignal(true);

        const places = [
          'Beaupré, Canada',
          'Łódź, Poland',
          '北京, China',
          '|, Separator',
          '||, Double Separator',
        ];
        return (
          <div>
            <button
              onClick$={() => {
                toggle.value = !toggle.value;
              }}
            >
              click
            </button>
            {toggle.value &&
              places.map((place) => <ChildComp key={`trip-teaser-${place}`}></ChildComp>)}
          </div>
        );
      });

      const { document } = await render(<Cmp />, { debug });

      await trigger(document.body, 'button', 'click');
    });
  });
});
