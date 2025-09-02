import {
  Fragment as Component,
  Fragment as InlineComponent,
  component$,
  Fragment,
  Fragment as Signal,
  untrack,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
  type PropsOf,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { advanceToNextTimerAndFlush } from '../../testing/element-fixture';
import { getStoreHandler } from '../reactive-primitives/impl/store';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useStore', ({ render }) => {
  it('should render value', async () => {
    const Cmp = component$(() => {
      const store = useStore({ items: [{ num: 0 }] });
      return (
        <>
          {store.items.map((item, key) => (
            <div key={key}>{item.num}</div>
          ))}
        </>
      );
    });

    const { vNode } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <div key="0">
            <Signal>0</Signal>
          </div>
        </Fragment>
      </Component>
    );
  });
  it('should update value', async () => {
    const Counter = component$(() => {
      const count = useStore({ count: 123 });
      return <button onClick$={() => count.count++}>Count: {count.count}!</button>;
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'123'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'124'}</Signal>!
        </button>
      </Component>
    );
  });
  it('should update deep value', async () => {
    const Counter = component$(() => {
      const count = useStore({ obj: { count: 123 } });
      return <button onClick$={() => count.obj.count++}>Count: {count.obj.count}!</button>;
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Count: <Signal ssr-required>{'123'}</Signal>!
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Count: <Signal ssr-required>{'124'}</Signal>!
        </button>
      </>
    );
  });

  it('should update array value', async () => {
    const Counter = component$(() => {
      const count = useStore([123]);
      return <button onClick$={() => count[0]++}>Count: {count[0]}!</button>;
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'123'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal ssr-required>{'124'}</Signal>!
        </button>
      </Component>
    );
  });

  it('should rerender child', async () => {
    const log: string[] = [];
    const Display = component$((props: { dValue: number }) => {
      log.push('Display');
      return <span>Count: {props.dValue}!</span>;
    });
    const Counter = component$((props: { initial: number }) => {
      log.push('Counter');
      const count = useStore({ obj: { value: props.initial } });
      return (
        <button onClick$={() => count.obj.value++}>
          <Display dValue={count.obj.value} />
        </button>
      );
    });

    const { vNode, container } = await render(<Counter initial={123} />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <>
            <span>
              Count: <Signal ssr-required>{'123'}</Signal>!
            </span>
          </>
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(log).toEqual(['Counter', 'Display']);
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <>
            <span>
              Count: <Signal ssr-required>{'124'}</Signal>!
            </span>
          </>
        </button>
      </>
    );
  });
  describe('derived', () => {
    it('should update value directly in DOM', async () => {
      const log: string[] = [];
      const Counter = component$((props: { initial: number }) => {
        const count = useStore({ value: props.initial });
        log.push('Counter: ' + untrack(() => count.value));
        return <button onClick$={() => count.value++}>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, {
        debug,
        // oldSSR: true,
      });
      expect(log).toEqual(['Counter: 123']);
      log.length = 0;
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <Signal ssr-required>{'123'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(log).toEqual([]);
      log.length = 0;
      expect(vNode).toMatchVDOM(
        <>
          <button>
            Count: <Signal ssr-required>{'124'}</Signal>!
          </button>
        </>
      );
    });
    it('should allow signal to deliver value or JSX', async () => {
      const log: string[] = [];
      const Counter = component$(() => {
        const count = useStore<any>({ jsx: 'initial' });
        log.push('Counter: ' + untrack(() => count.jsx));
        return (
          <button onClick$={() => (count.jsx = typeof count.jsx == 'string' ? <b>JSX</b> : 'text')}>
            -{count.jsx}-
          </button>
        );
      });

      const { vNode, container } = await render(<Counter />, { debug });
      expect(log).toEqual(['Counter: initial']);
      log.length = 0;
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            -<Signal ssr-required>{'initial'}</Signal>-
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(log).toEqual([]);
      log.length = 0;
      expect(vNode).toMatchVDOM(
        <>
          <button>
            -
            <>
              <b>JSX</b>
            </>
            -
          </button>
        </>
      );
      await trigger(container.element, 'button', 'click');
      expect(log).toEqual([]);
      log.length = 0;
      expect(vNode).toMatchVDOM(
        <>
          <button>
            -<Signal ssr-required>{'text'}</Signal>-
          </button>
        </>
      );
    });
    it('should update value when store, update and render are separated', async () => {
      const renderLog: string[] = [];
      const Display = component$((props: { displayValue: number }) => {
        renderLog.push('Display');
        return <>Count: {props.displayValue}!</>;
      });
      const Incrementor = component$((props: { countSignal: { value: number } }) => {
        renderLog.push('Incrementor');
        return (
          <button
            onClick$={() => {
              const signal = props.countSignal;
              signal.value++;
            }}
          >
            +1
          </button>
        );
      });
      const Counter = component$(() => {
        renderLog.push('Counter');
        const count = useStore({ value: 123 });
        return (
          <>
            <Display displayValue={count.value} />
            <Incrementor countSignal={count} />
          </>
        );
      });
      const { vNode, container } = await render(<Counter />, { debug });
      expect(renderLog).toEqual(['Counter', 'Display', 'Incrementor']);
      renderLog.length = 0;
      await trigger(container.element, 'button', 'click');
      expect(renderLog).toEqual([]);
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <Component ssr-required>
              <Fragment ssr-required>
                Count: <Signal ssr-required>{'124'}</Signal>!
              </Fragment>
            </Component>
            <Component ssr-required>
              <button>+1</button>
            </Component>
          </Fragment>
        </Component>
      );
    });

    it('should rerender inner component with store as a prop', async () => {
      interface InnerButtonProps {
        text: string;
        isActive: boolean;
        onClick$: PropsOf<'button'>['onClick$'];
      }
      const InnerButton = component$((props: InnerButtonProps) => {
        return (
          <button
            key={props.text}
            class={{ 'active-tab': props.isActive, 'repl-tab-button': true }}
            onClick$={props.onClick$}
          >
            {props.text}
          </button>
        );
      });

      const InnerButtonWrapper = component$((props: { data: any }) => {
        return (
          <InnerButton
            text="Options"
            isActive={props.data.selectedOutputDetail === 'options'}
            onClick$={() => {
              props.data.selectedOutputDetail = 'options';
            }}
          />
        );
      });

      const Parent = component$(() => {
        const store = useStore({
          selectedOutputDetail: 'console',
        });

        return <InnerButtonWrapper data={store} />;
      });

      const { vNode, document } = await render(<Parent />, { debug });

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <InlineComponent>
            <InlineComponent>
              <button class="repl-tab-button">Options</button>
            </InlineComponent>
          </InlineComponent>
        </Component>
      );

      await trigger(document.body, 'button', 'click');

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <InlineComponent>
            <InlineComponent>
              <button class="active-tab repl-tab-button">Options</button>
            </InlineComponent>
          </InlineComponent>
        </Component>
      );
    });

    it('should rerender inner inline component with destructured props', async () => {
      interface InnerButtonProps {
        text: string;
        isActive: boolean;
        onClick$: PropsOf<'button'>['onClick$'];
      }

      const Parent = component$(() => {
        const store = useStore({
          selectedOutputDetail: 'console',
        });

        const InnerButton = (props: InnerButtonProps) => {
          return (
            <button
              key={props.text}
              class={{ 'active-tab': props.isActive, 'repl-tab-button': true }}
              onClick$={props.onClick$}
            >
              {props.text}
            </button>
          );
        };

        const InnerButtonWrapper = ({ data }: { data: any }) => {
          return (
            <InnerButton
              text="Options"
              isActive={data.selectedOutputDetail === 'options'}
              onClick$={() => {
                data.selectedOutputDetail = 'options';
              }}
            />
          );
        };

        return <InnerButtonWrapper data={store} />;
      });

      const { vNode, document } = await render(<Parent />, { debug });

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <InlineComponent>
            <InlineComponent>
              <button class="repl-tab-button">Options</button>
            </InlineComponent>
          </InlineComponent>
        </Component>
      );

      await trigger(document.body, 'button', 'click');

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <InlineComponent>
            <InlineComponent>
              <button class="active-tab repl-tab-button">Options</button>
            </InlineComponent>
          </InlineComponent>
        </Component>
      );
    });
  });

  describe('SerializationConstant at the start', () => {
    it('should set the value with SerializationConstant at the start for initial empty value', async () => {
      const DataCmp = component$(() => {
        const data = useStore({ logs: '' });
        return <button onClick$={() => (data.logs = '\n test')}>Data: {data.logs}!</button>;
      });

      const { vNode, container } = await render(<DataCmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Data: <Signal ssr-required>{''}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Data: <Signal ssr-required>{'\n test'}</Signal>!
          </button>
        </Component>
      );
    });

    it('should set the value with SerializationConstant at the start', async () => {
      const DataCmp = component$(() => {
        const data = useStore({ logs: '\n abcd' });
        return <button onClick$={() => (data.logs = '\n test')}>Data: {data.logs}!</button>;
      });

      const { vNode, container } = await render(<DataCmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Data: <Signal ssr-required>{'\n abcd'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Data: <Signal ssr-required>{'\n test'}</Signal>!
          </button>
        </Component>
      );
    });

    it('should update the value with SerializationConstant at the start', async () => {
      const DataCmp = component$(() => {
        const data = useStore({ logs: '\n abcd' });
        return <button onClick$={() => (data.logs += '\n test')}>Data: {data.logs}!</button>;
      });

      const { vNode, container } = await render(<DataCmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Data: <Signal ssr-required>{'\n abcd'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Data: <Signal ssr-required>{'\n abcd\n test'}</Signal>!
          </button>
        </Component>
      );
    });

    it('should push the value with SerializationConstant at the start to array', async () => {
      const DataCmp = component$(() => {
        const data = useStore({ logs: ['\n abcd'] });
        return (
          <button onClick$={() => data.logs.push('\n test')}>
            Data:
            {data.logs.map((d) => (
              <span>{d}</span>
            ))}
            !
          </button>
        );
      });

      const { vNode, container } = await render(<DataCmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            {'Data:'}
            <span>{'\n abcd'}</span>
            {'!'}
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            {'Data:'}
            <span>{'\n abcd'}</span>
            <span>{'\n test'}</span>
            {'!'}
          </button>
        </Component>
      );
    });
  });

  it('should deep watch store', async () => {
    const Cmp = component$(() => {
      const store = useStore({
        nested: {
          fields: { are: 'also tracked' },
        },
        list: ['Item 1'],
      });

      return (
        <>
          <p>{store.nested.fields.are}</p>
          <button
            id="tracked"
            onClick$={() => {
              // Even though we are mutating a nested object, this will trigger a re-render
              store.nested.fields.are = 'tracked';
            }}
          ></button>
          <button
            id="add-item"
            onClick$={() => {
              // Because store is deep watched, this will trigger a re-render
              store.list.push(`Item ${store.list.length}`);
            }}
          ></button>
          <ul>
            {store.list.map((item, key) => (
              <li key={key}>{item}</li>
            ))}
          </ul>
        </>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <p>
            <Signal ssr-required>also tracked</Signal>
          </p>
          <button id="tracked"></button>
          <button id="add-item"></button>
          <ul>
            <li key="0">Item 1</li>
          </ul>
        </Fragment>
      </Component>
    );
    await trigger(document.body, 'button#add-item', 'click');
    await trigger(document.body, 'button#add-item', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <p>
            <Signal ssr-required>also tracked</Signal>
          </p>
          <button id="tracked"></button>
          <button id="add-item"></button>
          <ul>
            <li key="0">Item 1</li>
            <li key="1">Item 1</li>
            <li key="2">Item 2</li>
          </ul>
        </Fragment>
      </Component>
    );
  });

  it('should render value via JSON.stringify', async () => {
    const Stringify = component$<{
      data: any;
      style?: any;
    }>((props) => {
      return <>{JSON.stringify(props.data)}</>;
    });

    const Cmp = component$(() => {
      const group = useStore({
        controls: {
          ctrl: {
            value: '',
          },
        },
      });

      return (
        <button onClick$={() => (group.controls.ctrl.value = 'test')}>
          <Stringify data={group} />
          <Stringify data={group.controls} />
          <Stringify data={group.controls.ctrl} />
          <Stringify data={group.controls.ctrl.value} />
        </button>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <Component ssr-required>
            <Signal ssr-required>{'{"controls":{"ctrl":{"value":""}}}'}</Signal>
          </Component>
          <Component ssr-required>
            <Signal ssr-required>{'{"ctrl":{"value":""}}'}</Signal>
          </Component>
          <Component ssr-required>
            <Signal ssr-required>{'{"value":""}'}</Signal>
          </Component>
          <Component ssr-required>
            <Signal ssr-required>{'""'}</Signal>
          </Component>
        </button>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <Component ssr-required>
            <Signal ssr-required>{'{"controls":{"ctrl":{"value":"test"}}}'}</Signal>
          </Component>
          <Component ssr-required>
            <Signal ssr-required>{'{"ctrl":{"value":"test"}}'}</Signal>
          </Component>
          <Component ssr-required>
            <Signal ssr-required>{'{"value":"test"}'}</Signal>
          </Component>
          <Component ssr-required>
            <Signal ssr-required>{'"test"'}</Signal>
          </Component>
        </button>
      </Component>
    );
  });

  it('should work with frozen store', async () => {
    const Cmp = component$(() => {
      const store = useStore({ items: [{ num: 0 }] });
      Object.freeze(store);
      return (
        <>
          {store.items.map((item, key) => (
            <div key={key}>{item.num}</div>
          ))}
        </>
      );
    });

    const { vNode } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <div key="0">0</div>
        </Fragment>
      </Component>
    );
  });

  it('should deserialize store without effects', async () => {
    const Cmp = component$(() => {
      const store = useStore({ counter: 0 });
      useVisibleTask$(() => {
        store.counter++;
      });
      return <div></div>;
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'div', 'qvisible');
    }
    expect(vNode).toMatchVDOM(
      <Component>
        <div></div>
      </Component>
    );
  });

  it('should assign a store property to undefined', async () => {
    (global as any).logs = [] as string[];

    const Cmp = component$(() => {
      const store = useStore<Record<string, any>>({});
      useTask$(({ track }) => {
        track(() => store.someId);
        (global as any).logs.push('someId' in store);
      });

      return <button onClick$={() => (store['someId'] = undefined)}></button>;
    });

    const { document } = await render(<Cmp />, { debug });
    await trigger(document.body, 'button', 'click');
    expect((global as any).logs).toEqual([false, true]);
  });

  it('should trigger effects on property delete', async () => {
    const Cmp = component$(() => {
      const store = useStore<{ delete?: string }>({ delete: 'test' });
      return <div onClick$={() => delete store.delete}>{store.delete}</div>;
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Signal ssr-required>{'test'}</Signal>
        </div>
      </Component>
    );
    await trigger(document.body, 'div', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Signal ssr-required></Signal>
        </div>
      </Component>
    );
  });

  it('should update deep nested array of arrays inside object with inner component', async () => {
    const Item = component$(({ item }: any) => {
      return (
        <div id={item.id} onClick$={() => (item.completed = true)}>
          {item.title}
        </div>
      );
    });

    const Cmp = component$(() => {
      const todos = useStore(
        {
          filter: 'all',
          items: [
            { completed: false, title: 'Read Qwik docs', id: '0' },
            { completed: false, title: 'Build HelloWorld', id: '1' },
            { completed: false, title: 'Profit', id: '2' },
          ],
        },
        { deep: true }
      );
      const remaining = todos.items.filter((item) => item.completed === false).length;

      return (
        <div>
          {remaining}
          {todos.items.map((item, key) => (
            <Item key={key} item={item} />
          ))}
        </div>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          {'3'}
          <Component>
            <div id="0">
              <Signal>Read Qwik docs</Signal>
            </div>
          </Component>
          <Component>
            <div id="1">
              <Signal>Build HelloWorld</Signal>
            </div>
          </Component>
          <Component>
            <div id="2">
              <Signal>Profit</Signal>
            </div>
          </Component>
        </div>
      </Component>
    );

    await trigger(document.body, 'div[id="0"]', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          {'2'}
          <Component>
            <div id="0">
              <Signal>Read Qwik docs</Signal>
            </div>
          </Component>
          <Component>
            <div id="1">
              <Signal>Build HelloWorld</Signal>
            </div>
          </Component>
          <Component>
            <div id="2">
              <Signal>Profit</Signal>
            </div>
          </Component>
        </div>
      </Component>
    );
  });
  it('should update deep nested array of arrays inside object', async () => {
    const Cmp = component$(() => {
      const todos = useStore(
        {
          filter: 'all',
          items: [
            { completed: false, title: 'Read Qwik docs', id: '0' },
            { completed: false, title: 'Build HelloWorld', id: '1' },
            { completed: false, title: 'Profit', id: '2' },
          ],
        },
        { deep: true }
      );
      const remaining = todos.items.filter((item) => item.completed === false).length;

      return (
        <div>
          {remaining}
          <button onClick$={() => (todos.items[0].completed = true)}></button>
        </div>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          {'3'}
          <button></button>
        </div>
      </Component>
    );

    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          {'2'}
          <button></button>
        </div>
      </Component>
    );
  });

  it('should cleanup store effects on vNode/component remove', async () => {
    (globalThis as any).store = undefined;

    const Child = component$<{ store: { message?: string } }>((props) => {
      return <div>{props.store.message && <span>{props.store.message}</span>}</div>;
    });

    const Parent = component$(() => {
      const store = useStore<{ message?: string }>({
        message: undefined,
      });

      useVisibleTask$(() => {
        (globalThis as any).store = store;
      });

      return (
        <div>
          <button
            onClick$={() => {
              if (store.message) {
                store.message = undefined;
              } else {
                store.message = 'Hello';
              }
            }}
          ></button>
          <Child key={store.message} store={store} />
        </div>
      );
    });

    const { vNode, document } = await render(<Parent />, { debug });

    if (render === ssrRenderToDom) {
      await trigger(document.body, 'div', 'qvisible');
    }
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button></button>
          <Component>
            <div></div>
          </Component>
        </div>
      </Component>
    );

    const storeHandler = getStoreHandler((globalThis as any).store);
    expect(storeHandler?.$effects$?.get('message')).toHaveLength(2);

    await trigger(document.body, 'button', 'click');
    expect(storeHandler?.$effects$?.get('message')).toHaveLength(3);
    await trigger(document.body, 'button', 'click');
    expect(storeHandler?.$effects$?.get('message')).toHaveLength(2);
    await trigger(document.body, 'button', 'click');
    expect(storeHandler?.$effects$?.get('message')).toHaveLength(3);
    await trigger(document.body, 'button', 'click');
    expect(storeHandler?.$effects$?.get('message')).toHaveLength(2);
    await trigger(document.body, 'button', 'click');
    expect(storeHandler?.$effects$?.get('message')).toHaveLength(3);

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button></button>
          <Component>
            <div>
              <span>
                <Signal>Hello</Signal>
              </span>
            </div>
          </Component>
        </div>
      </Component>
    );
  });

  describe('regression', () => {
    it('#5597 - should update value', async () => {
      (globalThis as any).clicks = 0;
      const Issue5597 = component$(() => {
        const count = useSignal(0);
        const store = useStore({ items: [{ num: 0 }] });
        return (
          <>
            <button
              onClick$={() => {
                count.value++;
                store.items = store.items.map((i: { num: number }) => ({ num: i.num + 1 }));
                (globalThis as any).clicks++;
              }}
            >
              Count: {count.value}!
            </button>
            {store.items.map((item, key) => (
              <div key={key}>{item.num}</div>
            ))}
          </>
        );
      });

      const { vNode, container } = await render(<Issue5597 />, { debug });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button>
              {'Count: '}
              <Signal ssr-required>{(globalThis as any).clicks}</Signal>
              {'!'}
            </button>
            <div key="0">
              <Signal ssr-required>{(globalThis as any).clicks}</Signal>
            </div>
          </Fragment>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button>
              {'Count: '}
              <Signal ssr-required>{(globalThis as any).clicks}</Signal>
              {'!'}
            </button>
            <div key="0">
              <Signal ssr-required>{(globalThis as any).clicks}</Signal>
            </div>
          </Fragment>
        </Component>
      );
    });

    it('#5597 - should update value with setInterval', async () => {
      const Cmp = component$(() => {
        const count = useSignal(0);
        const store = useStore({ items: [{ num: 0 }] });
        useVisibleTask$(({ cleanup }) => {
          const intervalId = setInterval(() => {
            count.value++;
            store.items = store.items.map((i: { num: number }) => ({ num: i.num + 1 }));
          }, 500);

          cleanup(() => clearInterval(intervalId));
        });
        return (
          <>
            <div>Count: {count.value}!</div>
            {store.items.map((item, key) => (
              <div key={key}>{item.num}</div>
            ))}
          </>
        );
      });
      vi.useFakeTimers({
        toFake: ['setInterval', 'clearInterval'],
      });
      const { vNode, document, container } = await render(<Cmp />, { debug });
      if (render === ssrRenderToDom) {
        await trigger(document.body, 'div', 'qvisible');
      }
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <div>
              {'Count: '}
              <Signal ssr-required>{'0'}</Signal>
              {'!'}
            </div>
            <div key="0">
              <Signal ssr-required>0</Signal>
            </div>
          </Fragment>
        </Component>
      );
      await advanceToNextTimerAndFlush(container);
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <div>
              {'Count: '}
              <Signal ssr-required>{'1'}</Signal>
              {'!'}
            </div>
            <div key="0">
              <Signal ssr-required>1</Signal>
            </div>
          </Fragment>
        </Component>
      );
      await advanceToNextTimerAndFlush(container);
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <div>
              {'Count: '}
              <Signal ssr-required>{'2'}</Signal>
              {'!'}
            </div>
            <div key="0">
              <Signal ssr-required>2</Signal>
            </div>
          </Fragment>
        </Component>
      );
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    it('#5017 - should update child nodes for direct array', async () => {
      const Child = component$<{ columns: string }>(({ columns }) => {
        return <div>Child: {columns}</div>;
      });

      const Parent = component$(() => {
        const state = useStore([{ columns: 'INITIAL' }]);
        return (
          <>
            <button onClick$={() => (state[0] = { columns: 'UPDATE' })}>update!</button>
            <Child columns={state[0].columns} />
            {state.map((block, idx) => {
              return <Child columns={block.columns} key={idx} />;
            })}
          </>
        );
      });

      const { vNode, container } = await render(<Parent />, { debug });

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button>update!</button>
            <Component ssr-required>
              <div>
                {'Child: '}
                <Signal ssr-required>{'INITIAL'}</Signal>
              </div>
            </Component>
            <Component ssr-required>
              <div>
                {'Child: '}
                <Signal ssr-required>{'INITIAL'}</Signal>
              </div>
            </Component>
          </Fragment>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button>update!</button>
            <Component ssr-required>
              <div>
                {'Child: '}
                <Signal ssr-required>{'UPDATE'}</Signal>
              </div>
            </Component>
            <Component ssr-required>
              <div>
                {'Child: '}
                <Signal ssr-required>{'UPDATE'}</Signal>
              </div>
            </Component>
          </Fragment>
        </Component>
      );
    });

    it('#5001 - should serialize naked value', async () => {
      const Button = component$<{ unusedValue?: [number]; state: [number] }>(({ state }) => {
        return (
          <div>
            <button onClick$={() => state[0]++}>+1</button>
          </div>
        );
      });
      const Parent = component$<{ nakedState: [number] }>(({ nakedState }) => {
        // STEP 2
        // We wrap the `nakedState` into `state`.
        // This means that Qwik needs to serialize the Proxy for the `nakedState`.
        const state = useStore(nakedState);
        // const signal = useSignal(0);
        return (
          <>
            <Button
              // STEP 3
              // Uncommenting the next line breaks the code. (UI no longer updates)
              // This seems te be because Qwik somehow gets confused between the two
              // objects and assumes that `state` is no longer a proxy hence no
              // subscription
              //
              unusedValue={nakedState}
              state={state}
            />
            Count: <span>{state[0]}</span>
          </>
        );
      });
      const Issue5001 = component$(() => {
        const nakedState: [number] = [0];
        // STEP 1
        // By passing the `nakedState` into a child component, we force
        // Qwik to serialize `nakedState` into `qwik/json`
        return <Parent nakedState={nakedState} />;
      });

      const { vNode, document } = await render(<Issue5001 />, { debug });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Component>
            <Fragment>
              <Component>
                <div>
                  <button>+1</button>
                </div>
              </Component>
              {'Count: '}
              <span>
                <Signal ssr-required>0</Signal>
              </span>
            </Fragment>
          </Component>
        </Component>
      );

      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Component>
            <Fragment>
              <Component>
                <div>
                  <button>+1</button>
                </div>
              </Component>
              {'Count: '}
              <span>
                <Signal ssr-required>1</Signal>
              </span>
            </Fragment>
          </Component>
        </Component>
      );
    });
  });
});
