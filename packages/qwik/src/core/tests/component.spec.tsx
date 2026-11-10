import {
  component$,
  createContextId,
  Slot,
  type QRL,
  useContext,
  useContextProvider,
  useSignal,
  useStore,
  useTask$,
  type Signal,
  useAsync$,
  $,
  untrack,
  useComputed$,
  useVisibleTask$,
  type JSXOutput,
  type PropsOf,
  type Signal as SignalType,
  type FunctionComponent,
} from '@qwik.dev/core';
import { describe, expect, it, onTestFinished, afterEach, vi } from 'vitest';
import { ssrRender, testRenderer } from '../test-utils';
import { triggerAll } from './test-hooks';
import { trigger } from '@qwik.dev/core/testing';
import { delay } from '../shared/utils/promises';
import * as logUtils from '../shared/utils/log';

const debug = false;

const { name, render } = testRenderer;

const formatSize = (count: number) => (count < 10 ? 'few' : 'many');
const ToggleLabel = component$((props: { label: string }) => {
  const on = useSignal(false);
  return (
    <button id="toggle" class={on.value ? 'on' : 'off'} onClick$={() => (on.value = true)}>
      {props.label}
    </button>
  );
});
const TickPanel = component$(() => {
  const count = useSignal(0);
  return (
    <div>
      <button id="tick" onClick$={() => count.value++}>
        tick
      </button>
      <ToggleLabel label={formatSize(count.value)} />
    </div>
  );
});
const SpreadLabel = component$((props: { label?: string }) => <span>{props.label ?? 'none'}</span>);
const SpreadButton = component$(() => {
  const count = useSignal(0);
  return (
    <button onClick$={() => count.value++}>
      <SpreadLabel {...(count.value === 0 ? { label: 'initial' } : {})} />
    </button>
  );
});

const DeepPropLabel = component$((props: { label: string }) => <span>{props.label}</span>);
const DeepPropParent = component$(() => {
  const count = useSignal(0);
  if (count.value < 0) {
    return null;
  }
  const item = { meta: { label: 'hello' }, format: () => 'x' };
  return (
    <div>
      <button onClick$={() => count.value++}>{count.value}</button>
      <DeepPropLabel label={item.meta.label} />
    </div>
  );
});

type PropChange = 'same' | 'change' | 'remove' | 'add';

const ResumedChildCounter = component$((props: { label?: string }) => {
  (globalThis as any).resumedChildRenders++;
  const count = useSignal(0);
  return (
    <button id="counter" onClick$={() => count.value++}>
      {props.label}:{count.value}
    </button>
  );
});

const ResumedChildParent = component$((props: { mode: PropChange }) => {
  const tick = useSignal(0);
  const childProps = useComputed$((): { label?: string } => {
    if (props.mode === 'same' || (tick.value === 0 && props.mode !== 'add')) {
      return { label: 'one' };
    }
    if (props.mode === 'change' || props.mode === 'add') {
      return { label: 'big' };
    }
    return {};
  });
  return (
    <div>
      <p>{tick.value}</p>
      <ResumedChildCounter {...childProps.value} />
      <button id="tick" onClick$={() => tick.value++}>
        tick
      </button>
    </div>
  );
});

const UnserializedStaticBranch = component$(() => {
  useSignal('unserialized-static-hook');
  return <p>static</p>;
});
const ResumedChildPage = component$(() => (
  <main>
    <ResumedChildParent mode="change" />
    <aside>
      <UnserializedStaticBranch />
    </aside>
  </main>
));

describe(`${name}: component`, () => {
  it('should render component', async () => {
    const MyComp = component$(() => {
      return <p>Hello Qwik</p>;
    });

    const { container, html, cleanup } = await render(MyComp, { debug });

    expect(container.innerHTML).toBe('<p>Hello Qwik</p>');
    expect(html).toBe('<p>Hello Qwik</p>');

    cleanup();
  });

  it('should forward an onClick$ prop through a wrapper', async () => {
    const Button = component$<any>(({ onClick$ }: any) => (
      <button id="btn" onClick$={onClick$}>
        <Slot />
      </button>
    ));
    const App = component$(() => {
      const count = useSignal(0);
      return (
        <div>
          <Button onClick$={() => count.value++}>go</Button>
          <span id="count">{count.value}</span>
        </div>
      );
    });

    const { container, qwikLoader, cleanup } = await render(App, { debug });

    expect(container.querySelector('#count')?.textContent).toBe('0');
    await qwikLoader?.dispatch(container.querySelector('#btn')!, 'click');
    expect(container.querySelector('#count')?.textContent).toBe('1');

    cleanup();
  });

  it('should render component with fragment', async () => {
    const MyComp = component$(() => {
      return <>Hello Qwik</>;
    });

    const { container, html, cleanup } = await render(MyComp, { debug });

    expect(container.innerHTML).toBe('Hello Qwik');
    expect(html).toBe('Hello Qwik');

    cleanup();
  });

  it('should render plain function component', async () => {
    function MyComp() {
      return <p>Hello Function</p>;
    }

    const { container, html, cleanup } = await render(MyComp, { debug });

    expect(container.innerHTML).toBe('<p>Hello Function</p>');
    expect(html).toBe('<p>Hello Function</p>');

    cleanup();
  });

  it('should render plain arrow component', async () => {
    const MyComp = () => {
      return <p>Hello Arrow</p>;
    };

    const { container, html, cleanup } = await render(MyComp, { debug });

    expect(container.innerHTML).toBe('<p>Hello Arrow</p>');
    expect(html).toBe('<p>Hello Arrow</p>');

    cleanup();
  });

  it('should render a nested component$ child', async () => {
    const Child = component$(() => {
      return <span>Nested Child</span>;
    });

    const Parent = component$(() => {
      return (
        <section>
          <Child />
        </section>
      );
    });

    const { container, html, cleanup } = await render(Parent, { debug });

    expect(container.innerHTML).toBe('<section><span>Nested Child</span></section>');
    expect(html).toBe('<section><span>Nested Child</span></section>');

    cleanup();
  });

  it('should render a nested plain function child', async () => {
    function Child() {
      return <span>Function Child</span>;
    }

    const Parent = () => {
      return (
        <section>
          <Child />
        </section>
      );
    };

    const { container, html, cleanup } = await render(Parent, { debug });

    expect(container.innerHTML).toBe('<section><span>Function Child</span></section>');
    expect(html).toBe('<section><span>Function Child</span></section>');

    cleanup();
  });

  it('should render a nested child with scoped constants', async () => {
    const label = 'Scoped Child';

    function Child() {
      return <span>{label}</span>;
    }

    function Parent() {
      return (
        <section>
          <Child />
        </section>
      );
    }

    const { container, cleanup } = await render(Parent, { debug });

    expect(container.querySelector('span')?.textContent).toBe('Scoped Child');
    cleanup();
  });

  it('should pass props to a child component', async () => {
    function Child(props: { label: string; count: number }) {
      return (
        <p>
          {props.label}: {props.count}
        </p>
      );
    }

    function Parent() {
      const count = 7;
      return <Child label="Count" count={count} />;
    }

    const { container, cleanup } = await render(Parent, { debug });

    expect(container.querySelector('p')?.textContent).toBe('Count: 7');

    cleanup();
  });

  it('should update signal props read by a child component', async () => {
    const Child = component$((props: { count: Signal<number> }) => {
      const count = props.count;
      return <span>{count.value}</span>;
    });

    const Parent = component$(() => {
      const count = useSignal(0);
      return (
        <button onClick$={() => count.value++}>
          <Child count={count} />
        </button>
      );
    });

    const { container, cleanup, qwikLoader } = await render(Parent, { debug });
    const button = container.querySelector('button');

    expect(button?.textContent).toBe('0');
    expect(qwikLoader).toBeDefined();

    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('1');

    cleanup();
  });

  it('should preserve a signal forwarded through component props', async () => {
    const Leaf = component$((props: { shared: Signal<number> }) => (
      <span>shared={props.shared.value}</span>
    ));
    const Middle = component$((props: { shared: Signal<number> }) => (
      <Leaf shared={props.shared} />
    ));
    const Root = component$(() => {
      const shared = useSignal(7);
      return (
        <button onClick$={() => shared.value++}>
          <Middle shared={shared} />
        </button>
      );
    });

    const { container, cleanup, qwikLoader } = await render(Root, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('shared=7');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('shared=8');

    cleanup();
  });

  it('should read nested and computed destructured props reactively', async () => {
    const KEY = 'dyn';
    const Child = component$(
      ({
        user: {
          name,
          tags: [first],
        },
        [KEY]: keyed,
        meta: { count = 0 },
      }: any) => (
        <p>
          {name}-{first}-{keyed}-{count}
        </p>
      )
    );
    const Parent = component$(() => {
      const state = useStore({ user: { name: 'ann', tags: ['t1'] } });
      return (
        <button onClick$={() => (state.user.name = 'bob')}>
          <Child user={state.user} dyn="k" meta={{}} />
        </button>
      );
    });

    const { container, cleanup, qwikLoader } = await render(Parent, { debug });
    const paragraph = container.querySelector('p');

    expect(paragraph?.textContent).toBe('ann-t1-k-0');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(paragraph?.textContent).toBe('bob-t1-k-0');

    cleanup();
  });

  it('should pass event props to native child elements', async () => {
    const Button = component$((props: { onClick$: QRL<() => any> }) => {
      return <button onClick$={props.onClick$}>Click</button>;
    });

    const Parent = component$(() => {
      const count = useSignal(0);
      return (
        <section>
          <Button onClick$={() => count.value++} />
          <span>{count.value}</span>
        </section>
      );
    });

    const { container, cleanup, qwikLoader } = await render(Parent, { debug });
    const button = container.querySelector('button');
    const value = container.querySelector('span');

    expect(value?.textContent).toBe('0');
    expect(qwikLoader).toBeDefined();

    await qwikLoader?.dispatch(button!, 'click');

    expect(value?.textContent).toBe('1');

    cleanup();
  });

  it('should pass event handler arrays to native child elements', async () => {
    // The types only lift a single `$` prop function; a list is what the compiler receives.
    const Button = component$((props: { onClick$: QRL<() => void>[] }) => {
      return <button onClick$={props.onClick$}>Click</button>;
    });

    const Parent = component$(() => {
      const count = useSignal(0);
      const clicks = useSignal(0);
      return (
        <section>
          <Button
            onClick$={
              [
                () => {
                  count.value += 2;
                },
                () => {
                  clicks.value++;
                },
              ] as unknown as QRL<() => void>[]
            }
          />
          <span>{count.value + ':' + clicks.value}</span>
        </section>
      );
    });

    const { container, cleanup, qwikLoader } = await render(Parent, { debug });
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('span')?.textContent).toBe('2:1');
    cleanup();
  });

  it('should provide parent context to a child component', async () => {
    const Child = component$(() => {
      const Context = createContextId<Signal<string>>('child-component-context');
      const value = useContext(Context);
      return <span>{value.value}</span>;
    });

    const Parent = component$(() => {
      const Context = createContextId<Signal<string>>('child-component-context');
      const value = useSignal('provided');
      useContextProvider(Context, value);
      return (
        <section>
          <Child />
        </section>
      );
    });

    const { container, cleanup } = await render(Parent, { debug });

    expect(container.querySelector('span')?.textContent).toBe('provided');

    cleanup();
  });

  it('should update a prop that reads a signal directly', async () => {
    const Child = (props: { count: number }) => <span id="child">{props.count}</span>;

    const Parent = () => {
      const count = useSignal(0);
      return (
        <div>
          <button onClick$={() => count.value++}>inc</button>
          <Child count={count.value} />
        </div>
      );
    };

    const { container, cleanup, qwikLoader } = await render(Parent, { debug });
    expect(container.querySelector('#child')?.textContent).toBe('0');

    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('#child')?.textContent).toBe('1');
    cleanup();
  });

  // The middle component cannot prove its own prop is reactive, so the derived prop has to stay
  // live without that proof rather than serializing as a snapshot.
  it('should update a prop derived from an unproven prop', async () => {
    const Leaf = (props: { label: string }) => <span id="leaf">{props.label}</span>;
    const Middle = (props: { flag: boolean }) => <Leaf label={props.flag ? 'on' : 'off'} />;

    const Parent = () => {
      const flag = useSignal(false);
      return (
        <div>
          <button onClick$={() => (flag.value = !flag.value)}>toggle</button>
          <Middle flag={flag.value} />
        </div>
      );
    };

    const { container, cleanup, qwikLoader } = await render(Parent, { debug });
    expect(container.querySelector('#leaf')?.textContent).toBe('off');

    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('#leaf')?.textContent).toBe('on');
    cleanup();
  });

  it('should update expression props on mapped children', async () => {
    const Child = (props: { value: number; active: boolean }) => (
      <div id={`child-${props.value}`}>{props.active ? 'active' : 'inactive'}</div>
    );

    const Parent = () => {
      const selected = useSignal(1);
      return (
        <div>
          <button onClick$={() => (selected.value = 2)}>select</button>
          {[1, 2].map((value) => (
            <Child key={value} value={value} active={selected.value === value} />
          ))}
        </div>
      );
    };

    const { container, cleanup, qwikLoader } = await render(Parent, { debug });
    expect(container.querySelector('#child-1')?.textContent).toBe('active');
    expect(container.querySelector('#child-2')?.textContent).toBe('inactive');

    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('#child-1')?.textContent).toBe('inactive');
    expect(container.querySelector('#child-2')?.textContent).toBe('active');
    cleanup();
  });

  it('should reexecute a component swapped between branch arms without a key', async () => {
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
        <section>
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
          {toggle.value ? <Child text="Hello" /> : <Child text="World" />}
        </section>
      );
    });

    const { container, cleanup, qwikLoader } = await render(Cmp, { debug });
    expect(container.querySelector('div')?.textContent).toBe('Hello');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('div')?.textContent).toBe('World');
    cleanup();
  });

  it('should correctly rerender array without keys', async () => {
    const Cmp = component$(() => {
      const arrData = useSignal<number[]>([1, 2, 3, 4, 5]);
      return (
        <div>
          {arrData.value.map((item) => (
            <div class="item">Item: {item}</div>
          ))}
          <button onClick$={() => (arrData.value = [3, 4, 5])}></button>
        </div>
      );
    });

    const { container, cleanup, qwikLoader } = await render(Cmp, { debug });
    const items = () => Array.from(container.querySelectorAll('.item'), (div) => div.textContent);
    expect(items()).toEqual(['Item: 1', 'Item: 2', 'Item: 3', 'Item: 4', 'Item: 5']);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(items()).toEqual(['Item: 3', 'Item: 4', 'Item: 5']);
    cleanup();
  });

  it('should update child subscriptions for expression props', async () => {
    function Child(props: { count: number }) {
      return <span>{props.count}</span>;
    }

    function Parent() {
      const count = useSignal(0);
      return (
        <button onClick$={() => count.value++}>
          <Child count={count.value} />
        </button>
      );
    }

    const { container, cleanup, qwikLoader } = await render(Parent, { debug });
    const button = container.querySelector('button');

    expect(button?.textContent).toBe('0');
    expect(qwikLoader).toBeDefined();

    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('1');

    cleanup();
  });

  it('should rerender a module-scope child when its var props become empty', async () => {
    const { container, qwikLoader, cleanup } = await render(SpreadButton, { debug });
    expect(container.querySelector('span')?.textContent).toBe('initial');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('span')?.textContent).toBe('none');
    cleanup();
  });

  it('should keep a module-scope child state when its var props do not change', async () => {
    const { container, qwikLoader, cleanup } = await render(TickPanel, { debug });
    await qwikLoader?.dispatch(container.querySelector('#toggle')!, 'click');
    const toggle = container.querySelector('#toggle');
    expect(toggle?.getAttribute('class')).toBe('on');
    await qwikLoader?.dispatch(container.querySelector('#tick')!, 'click');
    expect(container.querySelector('#toggle')).toBe(toggle);
    expect(toggle?.getAttribute('class')).toBe('on');
    expect(toggle?.textContent).toBe('few');
    cleanup();
  });

  it('should rerender a child whose prop reads deep into an object holding a function', async () => {
    const { container, qwikLoader, cleanup } = await render(DeepPropParent, { debug });
    expect(container.querySelector('span')?.textContent).toBe('hello');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('button')?.textContent).toBe('1');
    expect(container.querySelector('span')?.textContent).toBe('hello');
    cleanup();
  });

  it('should render a deep prop in a child that can rerender', async () => {
    const Counter = component$((props: { label: string }) => {
      const count = useSignal(0);
      if (count.value < 0) {
        return null;
      }
      return <button onClick$={() => count.value++}>{`${props.label}${count.value}`}</button>;
    });
    const Parent = component$(() => {
      const item = { meta: { label: 'hello' }, format: () => 'x' };
      return <Counter label={item.meta.label} />;
    });

    const { container, qwikLoader, cleanup } = await render(Parent, { debug });
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('button')!.textContent).toBe('hello1');
    cleanup();
  });

  it('should still update a deep prop that reads a store', async () => {
    const Parent = component$(() => {
      const store = useStore({ label: 'a' });
      const item = { meta: store };
      return (
        <div>
          <button onClick$={() => (store.label = 'b')} />
          <DeepPropLabel label={item.meta.label} />
        </div>
      );
    });

    const { container, qwikLoader, cleanup } = await render(Parent, { debug });
    expect(container.querySelector('span')!.textContent).toBe('a');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('span')!.textContent).toBe('b');
    cleanup();
  });

  it.each([
    { mode: 'same', expected: 'one:2' },
    { mode: 'change', expected: 'big:2' },
    { mode: 'remove', expected: ':2' },
    { mode: 'add', expected: 'big:2' },
  ] as const)('preserves state and prop bindings when props $mode', async ({ mode, expected }) => {
    (globalThis as any).resumedChildRenders = 0;
    const { container, qwikLoader, cleanup } = await render(ResumedChildParent, {
      props: { mode },
    });
    await qwikLoader?.dispatch(container.querySelector('#counter')!, 'click');
    await qwikLoader?.dispatch(container.querySelector('#counter')!, 'click');
    await qwikLoader?.dispatch(container.querySelector('#tick')!, 'click');
    expect(container.querySelector('#counter')!.textContent).toBe(expected);
    if (mode !== 'add') {
      expect((globalThis as any).resumedChildRenders).toBe(1);
    }
    cleanup();
  });

  it('should render a component stored under two store keys after resume', async () => {
    const Hello = component$(() => <p>hello</p>);
    const Cmp = component$(() => {
      const registry = useStore({ first: Hello, second: Hello });
      const shown = useSignal<typeof Hello | null>(null);
      return (
        <>
          <button onClick$={() => (shown.value = registry.second)}>show</button>
          {shown.value && <shown.value />}
        </>
      );
    });
    const { container, qwikLoader, cleanup } = await render(Cmp, { debug });
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('p')?.textContent).toBe('hello');
    cleanup();
  });
});

describe.runIf(testRenderer.render === ssrRender)('ssrRender: component serialization', () => {
  it('keeps unrelated static branch hooks out of serialized state', async () => {
    const { container, cleanup } = await ssrRender(ResumedChildPage);
    const state = Array.from(container.querySelectorAll('script[type="qwik/state"]'))
      .map((script) => script.textContent)
      .join('');
    expect(state).not.toContain('unserialized-static-hook');
    cleanup();
  });
});

describe(`${name}: dynamic tag`, () => {
  it('should render a tag whose value is a string as an element', async () => {
    const MyComp = component$(() => {
      const Tag = 'h2';
      return <Tag class="title">Hello</Tag>;
    });

    const { container, cleanup } = await render(MyComp, { debug });

    expect(container.querySelector('h2.title')?.textContent).toBe('Hello');

    cleanup();
  });

  it('should render a tag whose value is a component', async () => {
    const Badge = component$(() => <em>badge</em>);
    const MyComp = component$(() => {
      const Tag = Badge;
      return <Tag />;
    });

    const { container, cleanup } = await render(MyComp, { debug });

    expect(container.querySelector('em')?.textContent).toBe('badge');

    cleanup();
  });
});

describe.runIf(name === 'csrRender')('client render', () => {
  it('should insert dangerouslySetInnerHTML from an async computed', async () => {
    const Cmp = component$(() => {
      const html = useAsync$(async () => '<b>async</b>');
      return <span id="async" dangerouslySetInnerHTML={html.value} />;
    });
    const { container } = await render(Cmp);
    const span = container.querySelector('#async')!;
    expect(span.innerHTML).toBe('<b>async</b>');
    expect(span.hasAttribute('dangerouslySetInnerHTML')).toBe(false);
  });
  describe('cleanup', () => {
    it('should clean up slotted component subscriptions when calling a cleanup function', async () => {
      interface CleanupProps {
        spies: {
          parentCleanup?: boolean;
          cleanup?: boolean;
          slottedCleanup?: boolean;
        };
      }

      const CleanupComponent = component$((props: CleanupProps) => {
        useTask$(({ cleanup }) => {
          cleanup(() => {
            (globalThis as any).cleanupSpies.cleanup = true;
          });
        });

        return (
          <div>
            <div id="cleanup">true</div>
            <Slot />
          </div>
        );
      });

      const ParentCleanupComponent = component$((props: CleanupProps) => {
        useTask$(({ cleanup }) => {
          cleanup(() => {
            (globalThis as any).cleanupSpies.parentCleanup = true;
          });
        });

        return (
          <div>
            <div id="parent-cleanup">true</div>
            <CleanupComponent spies={props.spies}>
              <Slot />
            </CleanupComponent>
          </div>
        );
      });

      const SlottedCleanupComponent = component$((props: CleanupProps) => {
        useTask$(({ cleanup }) => {
          cleanup(() => {
            (globalThis as any).cleanupSpies.slottedCleanup = true;
          });
        });

        return (
          <div>
            <div id="slotted-cleanup">true</div>
          </div>
        );
      });

      const spies = {
        parentCleanup: false,
        cleanup: false,
        slottedCleanup: false,
      };

      (globalThis as any).cleanupSpies = spies;
      const App = () => (
        <ParentCleanupComponent spies={spies}>
          <SlottedCleanupComponent spies={spies} />
        </ParentCleanupComponent>
      );
      const { cleanup } = await render(App);

      cleanup();

      expect(spies.parentCleanup).toBe(true);
      expect(spies.cleanup).toBe(true);
      expect(spies.slottedCleanup).toBe(true);
    });
  });
});

const globalObj = ['foo', 'bar'];

describe(`${name}: component`, () => {
  it('should render component', async () => {
    const MyComp = component$(() => {
      return <>Hello World!</>;
    });

    const { container, cleanup } = await render(MyComp, { debug });
    onTestFinished(cleanup);
    expect(
      Array.from(container.childNodes)
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent)
        .join('')
    ).toBe('Hello World!');
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

    const { container, cleanup } = await render(Parent, {
      ...{
        debug,
      },
      props: { salutation: 'Hello', name: 'World' },
    });
    onTestFinished(cleanup);
    expect(
      Array.from(container.childNodes)
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent)
        .join('')
    ).toBe('Hello World');
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

    const { container, cleanup, flush } = await render(Parent, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('counter');
    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('counter');
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

    const { container, cleanup } = await render(MyComp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Hello world');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('Hello world');
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

    const { container, cleanup, flush } = await render(Parent, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('Parent');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Show child');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Show child');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(3);
    expect(container.querySelector('div')!.textContent).toBe('Parent');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Show childChild');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('Child');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Show child');
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
    const { container, cleanup, flush } = await render(Parent, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main')!.textContent).toBe(
      'Component 11Component 11Component 22'
    );
    expect(container.querySelector('main')!.getAttribute('class')?.trim() ?? '').toBe('parent');
    expect(container.querySelectorAll('div')).toHaveLength(3);
    expect(container.querySelector('div')!.textContent).toBe('Component 11');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Component 11');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('Component 22');
    expect(container.querySelectorAll('span')).toHaveLength(3);
    expect(container.querySelector('span')!.textContent).toBe('Component 1');
    expect(container.querySelectorAll('span')[1]!.textContent).toBe('Component 1');
    expect(container.querySelectorAll('span')[2]!.textContent).toBe('Component 2');
    await triggerAll(container, 'main.parent', 'click');
    await flush();
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main')!.textContent).toBe('Component 22');
    expect(container.querySelector('main')!.getAttribute('class')?.trim() ?? '').toBe('parent');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Component 22');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('Component 2');
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
    const { container, cleanup, flush } = await render(Parent, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main')!.textContent).toBe('Component 11Component 22');
    expect(container.querySelector('main')!.getAttribute('class')?.trim() ?? '').toBe('parent');
    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('Component 11');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Component 22');
    expect(container.querySelectorAll('span')).toHaveLength(2);
    expect(container.querySelector('span')!.textContent).toBe('Component 1');
    expect(container.querySelectorAll('span')[1]!.textContent).toBe('Component 2');

    await triggerAll(container, 'main.parent', 'click');
    await flush();

    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main')!.textContent).toBe('Component 22');
    expect(container.querySelector('main')!.getAttribute('class')?.trim() ?? '').toBe('parent');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Component 22');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('Component 2');
  });

  it('should not rerender component with empty props', async () => {
    (globalThis as any).componentExecuted = [];
    const Component1 = component$<PropsOf<any>>(() => {
      const sig = useSignal(8);
      // be reactive
      sig.value;
      (globalThis as any).componentExecuted.push('Component1');
      return <div onClick$={() => sig.value}></div>;
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
    const { container, cleanup, flush } = await render(Parent, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main')!.textContent).toBe('');
    expect(container.querySelector('main')!.getAttribute('class')?.trim() ?? '').toBe('parent');
    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('');
    await triggerAll(container, 'main.parent', 'click');
    await flush();

    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main')!.textContent).toBe('');
    expect(container.querySelector('main')!.getAttribute('class')?.trim() ?? '').toBe('parent');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
    await triggerAll(container, 'main.parent', 'click');
    await flush();

    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main')!.textContent).toBe('');
    expect(container.querySelector('main')!.getAttribute('class')?.trim() ?? '').toBe('parent');
    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('');
  });

  it('should remove children from component$', async () => {
    (globalThis as any).__mainTestLog = [];
    const MyComp = component$((props: any) => {
      (globalThis as any).__mainTestLog.push('children' in props ? 'children' : 'no children');
      return <span>Hello world</span>;
    });

    const TestRoot0 = () => <MyComp>CHILDREN</MyComp>;
    const { container, cleanup } = await render(TestRoot0, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('Hello world');
    expect((globalThis as any).__mainTestLog).toEqual(['no children']);
  });

  it('should remove children from child component$', async () => {
    (globalThis as any).__mainTestLog = [];
    const ChildMyComp = component$((props: any) => {
      (globalThis as any).__mainTestLog.push('children' in props ? 'children' : 'no children');
      return <span>Hello world</span>;
    });
    const MyComp = component$((props: any) => {
      (globalThis as any).__mainTestLog.push('children' in props ? 'children' : 'no children');
      return (
        <span>
          <ChildMyComp />
          Hello world
        </span>
      );
    });

    const TestRoot1 = () => <MyComp>CHILDREN</MyComp>;
    const { container, cleanup } = await render(TestRoot1, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('span')).toHaveLength(2);
    expect(container.querySelector('span')!.textContent).toBe('Hello worldHello world');
    expect(container.querySelectorAll('span')[1]!.textContent).toBe('Hello world');
    expect((globalThis as any).__mainTestLog).toEqual(['no children', 'no children']);
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
    const { container, cleanup } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    await expect(container.querySelector('main')!.textContent).toBe('');
    expect(container.querySelector('main')!.querySelector('div')!.textContent).toBe('');
    expect(container.querySelector('main')!.querySelectorAll('div')[1]!.textContent).toBe('');
    expect(container.querySelector('main')!.querySelectorAll('div')[2]!.textContent).toBe('');
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

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('type')).toBe('text');
    expect((container.querySelector('input')! as HTMLInputElement).value).toBe('');
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('p')!.textContent).toBe('');

    // simulate input
    const input = container.querySelector('input')!;
    input.value = "'";
    await trigger(container, input, 'input');
    await flush();

    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe("'");
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('type')).toBe('text');
    expect((container.querySelector('input')! as HTMLInputElement).value).toBe("'");
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('p')!.textContent).toBe("'");
  });

  it('should render correctly text node in the middle', async () => {
    const Cmp = component$(() => {
      const signal = useSignal<number>(0);
      return (
        <button onClick$={() => (signal.value = 123)}>
          <i>
            <b>Test</b>
            {signal.value + 1}xx<span>{signal.value}</span>XXX<a></a>
          </i>
        </button>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Test124xx123XXX');
    expect(container.querySelectorAll('i')).toHaveLength(1);
    expect(container.querySelector('i')!.textContent).toBe('Test124xx123XXX');
    expect(container.querySelectorAll('b')).toHaveLength(1);
    expect(container.querySelector('b')!.textContent).toBe('Test');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('123');
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelector('a')!.textContent).toBe('');
    await expect(container.querySelector('i')!.textContent).toBe('Test124xx123XXX');
    expect(container.querySelector('i')!.querySelector('b')!.textContent).toBe('Test');
    expect(container.querySelector('i')!.querySelector('span')!.textContent).toBe('123');
    expect(container.querySelector('i')!.querySelector('a')!.textContent).toBe('');
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

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('1 / 1');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('2 / 3');
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

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe(
      '"<script></script>"' + String(`&<'"`) + '0'
    );

    await expect(container.querySelector('button')!.textContent).toBe(
      String(`"<script></script>"&<'"0`)
    );

    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe(
      '"<script></script>"' + String(`&<'"`) + '1'
    );

    await expect(container.querySelector('button')!.textContent).toBe(
      String(`"<script></script>"&<'"1`)
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

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    await trigger(container, '#button-2', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(3);
    expect(container.querySelector('div')!.textContent).toBe(
      '12Child 1, active: falseChild 2, active: true'
    );
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Child 1, active: false');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('Child 2, active: true');
    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('1');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('button-1');
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('2');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('button-2');
    await trigger(container, '#button-1', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(3);
    expect(container.querySelector('div')!.textContent).toBe(
      '12Child 1, active: trueChild 2, active: false'
    );
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Child 1, active: true');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('Child 2, active: false');
    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('1');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('button-1');
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('2');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('button-2');
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

    const { container, document, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('ABC');
    expect(container.querySelectorAll('span')).toHaveLength(3);
    expect(container.querySelector('span')!.textContent).toBe('A');
    expect(container.querySelector('span')!.getAttribute('id')).toBe('A');
    expect(container.querySelectorAll('span')[1]!.textContent).toBe('B');
    expect(container.querySelectorAll('span')[1]!.getAttribute('id')).toBe('B');
    expect(container.querySelectorAll('span')[2]!.textContent).toBe('C');
    expect(container.querySelectorAll('span')[2]!.getAttribute('id')).toBe('C');
    const a1 = document.getElementById('A');
    const b1 = document.getElementById('B');
    const c1 = document.getElementById('C');
    await triggerAll(container, 'div', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('BCA');
    expect(container.querySelectorAll('span')).toHaveLength(3);
    expect(container.querySelector('span')!.textContent).toBe('B');
    expect(container.querySelector('span')!.getAttribute('id')).toBe('B');
    expect(container.querySelectorAll('span')[1]!.textContent).toBe('C');
    expect(container.querySelectorAll('span')[1]!.getAttribute('id')).toBe('C');
    expect(container.querySelectorAll('span')[2]!.textContent).toBe('A');
    expect(container.querySelectorAll('span')[2]!.getAttribute('id')).toBe('A');
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
    const { container, cleanup } = await render(Parent, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('0');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('test');
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

    const { container, cleanup, flush } = await render(SecretForm, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('p')).toHaveLength(0);
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelector('p')!.textContent).toBe('foo');
    expect(container.querySelectorAll('p')[1]!.textContent).toBe('bar');
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

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    if (name === 'ssrRender') {
      expect(container.querySelectorAll('div')).toHaveLength(4);
      expect(container.querySelector('div')!.textContent).toBe('');
      expect(container.querySelector('div')!.getAttribute('id')).toBe('parent');
      expect(container.querySelectorAll('div')[1]!.textContent).toBe('');
      expect(container.querySelectorAll('div')[1]!.getAttribute('id')).toBe('static');
      expect(container.querySelectorAll('div')[2]!.textContent).toBe('');
      expect(container.querySelectorAll('div')[2]!.getAttribute('id')).toBe('static-2');
      expect(container.querySelectorAll('div')[3]!.textContent).toBe('');
      expect(container.querySelectorAll('div')[3]!.getAttribute('id')).toBe('static-3');
    }
    await trigger(container, '#parent', 'qvisible');
    await flush();

    expect(container.querySelectorAll('div')).toHaveLength(7);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelector('div')!.getAttribute('id')).toBe('parent');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('div')[1]!.getAttribute('id')).toBe('static');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('');
    expect(container.querySelectorAll('div')[2]!.getAttribute('id')).toBe('dynamic');
    expect(container.querySelectorAll('div')[3]!.textContent).toBe('');
    expect(container.querySelectorAll('div')[3]!.getAttribute('id')).toBe('static-2');
    expect(container.querySelectorAll('div')[4]!.textContent).toBe('');
    expect(container.querySelectorAll('div')[4]!.getAttribute('id')).toBe('dynamic-2');
    expect(container.querySelectorAll('div')[5]!.textContent).toBe('');
    expect(container.querySelectorAll('div')[5]!.getAttribute('id')).toBe('static-3');
    expect(container.querySelectorAll('div')[6]!.textContent).toBe('');
    expect(container.querySelectorAll('div')[6]!.getAttribute('id')).toBe('dynamic-3');
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
    const { container, cleanup, flush } = await render(MyComp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Increment');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('increment');
    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('Hello 01');
    expect(container.querySelector('div')!.getAttribute('id')).toBe('props-destructuring');
    expect(container.querySelector('div')!.getAttribute('class')?.trim() ?? '').toBe('');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('1');
    expect(container.querySelectorAll('div')[1]!.getAttribute('id')).toBe(null);
    expect(container.querySelectorAll('div')[1]!.getAttribute('class')?.trim() ?? '').toBe(
      'renders'
    );
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('Hello 0');
    expect(container.querySelector('span')!.getAttribute('aria-hidden')).toBe('true');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Increment');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('increment');
    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('Hello 11');
    expect(container.querySelector('div')!.getAttribute('id')).toBe('props-destructuring');
    expect(container.querySelector('div')!.getAttribute('class')?.trim() ?? '').toBe('');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('1');
    expect(container.querySelectorAll('div')[1]!.getAttribute('id')).toBe(null);
    expect(container.querySelectorAll('div')[1]!.getAttribute('class')?.trim() ?? '').toBe(
      'renders'
    );
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('Hello 1');
    expect(container.querySelector('span')!.getAttribute('aria-hidden')).toBe('true');
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
    const renderPromise = render(MultipleServerFunctionsInvokedInTask, { debug });

    const { container, cleanup } = await renderPromise;
    onTestFinished(cleanup);
    const div = container.querySelector('#server-error')!;
    const clickPromise = trigger(container, 'div', 'click');

    await clickPromise;

    const visiblePromise = trigger(container, 'div', 'qvisible');

    await visiblePromise;
    expect(div.textContent).toBe('(SomeErrorPOST)');
    expect(Array.from(div.querySelectorAll('b'), (node) => node.textContent)).toEqual(['(', ')']);
  });

  it('should render items in order', async () => {
    const Item = component$(({ countSig }: { countSig: SignalType<number> }) => {
      const itemNum = useSignal(0);

      useTask$(() => {
        itemNum.value = untrack(() => ++countSig.value);
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

    const { container, cleanup } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('div')).toHaveLength(5);
    expect(container.querySelector('div')!.textContent).toBe('Item 1Item 2Item 3Item 4');
    expect(container.querySelector('div')!.getAttribute('id')).toBe('container');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Item 1');
    expect(container.querySelectorAll('div')[1]!.getAttribute('id')).toBe(null);
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('Item 2');
    expect(container.querySelectorAll('div')[2]!.getAttribute('id')).toBe(null);
    expect(container.querySelectorAll('div')[3]!.textContent).toBe('Item 3');
    expect(container.querySelectorAll('div')[3]!.getAttribute('id')).toBe(null);
    expect(container.querySelectorAll('div')[4]!.textContent).toBe('Item 4');
    expect(container.querySelectorAll('div')[4]!.getAttribute('id')).toBe(null);

    await expect(container.querySelector('#container')!.textContent).toBe(
      'Item 1Item 2Item 3Item 4'
    );
    expect(container.querySelector('#container')!.getAttribute('id')).toBe('container');
    expect(container.querySelector('#container')!.querySelector('div')!.textContent).toBe('Item 1');
    expect(container.querySelector('#container')!.querySelector('div')!.getAttribute('id')).toBe(
      null
    );
    expect(container.querySelector('#container')!.querySelectorAll('div')[1]!.textContent).toBe(
      'Item 2'
    );
    expect(
      container.querySelector('#container')!.querySelectorAll('div')[1]!.getAttribute('id')
    ).toBe(null);
    expect(container.querySelector('#container')!.querySelectorAll('div')[2]!.textContent).toBe(
      'Item 3'
    );
    expect(
      container.querySelector('#container')!.querySelectorAll('div')[2]!.getAttribute('id')
    ).toBe(null);
    expect(container.querySelector('#container')!.querySelectorAll('div')[3]!.textContent).toBe(
      'Item 4'
    );
    expect(
      container.querySelector('#container')!.querySelectorAll('div')[3]!.getAttribute('id')
    ).toBe(null);
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

    const { container, cleanup, flush } = await render(Parent, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(4);
    expect(container.querySelector('div')!.textContent).toBe('0qwik 1012qwik 32');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('0qwik 10');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('1');
    expect(container.querySelectorAll('div')[3]!.textContent).toBe('2qwik 32');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('section')).toHaveLength(1);
    expect(container.querySelector('section')!.textContent).toBe('0qwik 1012qwik 32');
    expect(container.querySelectorAll('span')).toHaveLength(3);
    expect(container.querySelector('span')!.textContent).toBe('0');
    expect(container.querySelectorAll('span')[1]!.textContent).toBe('1');
    expect(container.querySelectorAll('span')[2]!.textContent).toBe('2');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(4);
    expect(container.querySelector('div')!.textContent).toBe('01qwik 312qwik 12');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('0');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('1qwik 31');
    expect(container.querySelectorAll('div')[3]!.textContent).toBe('2qwik 12');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('section')).toHaveLength(1);
    expect(container.querySelector('section')!.textContent).toBe('01qwik 312qwik 12');
    expect(container.querySelectorAll('span')).toHaveLength(3);
    expect(container.querySelector('span')!.textContent).toBe('0');
    expect(container.querySelectorAll('span')[1]!.textContent).toBe('1');
    expect(container.querySelectorAll('span')[2]!.textContent).toBe('2');
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

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Toggle');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Toggle');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input2');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Toggle');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Toggle');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input1');
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

    const { container, cleanup, flush } = await render(AttributesChild, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Add stuff (caused render)');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input1');
    expect((container.querySelector('input')! as HTMLInputElement).value).toBe('');
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('svg')!.textContent).toBe('');

    const input = container.querySelector('input#input1') as HTMLInputElement;
    input.value = 'test1';
    await trigger(container, input, 'input#input1');
    await flush();

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Add stuff (caused render)');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input1');
    expect((container.querySelector('input')! as HTMLInputElement).value).toBe('test1');
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('svg')!.textContent).toBe('');

    expect((container.querySelector('input#input1') as HTMLInputElement).value).toBe('test1');
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

    const { container, cleanup, flush } = await render(AttributesChild, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Add stuff (caused render)');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelectorAll('input')).toHaveLength(5);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input1');
    expect((container.querySelector('input')! as HTMLInputElement).value).toBe('');
    expect(container.querySelectorAll('input')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('input')[1]!.getAttribute('id')).toBe('input2');
    expect((container.querySelectorAll('input')[1]! as HTMLInputElement).value).toBe('');
    expect(container.querySelectorAll('input')[2]!.textContent).toBe('');
    expect(container.querySelectorAll('input')[2]!.getAttribute('id')).toBe('input3');
    expect((container.querySelectorAll('input')[2]! as HTMLInputElement).value).toBe('');
    expect(container.querySelectorAll('input')[3]!.textContent).toBe('');
    expect(container.querySelectorAll('input')[3]!.getAttribute('id')).toBe('input4');
    expect((container.querySelectorAll('input')[3]! as HTMLInputElement).value).toBe('');
    expect(container.querySelectorAll('input')[4]!.textContent).toBe('');
    expect(container.querySelectorAll('input')[4]!.getAttribute('id')).toBe('input5');
    expect((container.querySelectorAll('input')[4]! as HTMLInputElement).value).toBe('');

    const input = container.querySelector('input#input1') as HTMLInputElement;
    input.value = 'test1';
    await trigger(container, input, 'input#input1');
    await flush();

    const input2 = container.querySelector('input#input2') as HTMLInputElement;
    input2.value = 'test2';
    await trigger(container, input2, 'input#input2');
    await flush();

    const input3 = container.querySelector('input#input3') as HTMLInputElement;
    input3.value = 'test3';
    await trigger(container, input3, 'input#input3');
    await flush();

    const input4 = container.querySelector('input#input4') as HTMLInputElement;
    input4.value = 'test4';
    await trigger(container, input4, 'input#input4');
    await flush();

    const input5 = container.querySelector('input#input5') as HTMLInputElement;
    input5.value = 'test5';
    await trigger(container, input4, 'input#input5');
    await flush();

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Add stuff (caused render)');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelectorAll('input')).toHaveLength(5);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input1');
    expect((container.querySelector('input')! as HTMLInputElement).value).toBe('test1');
    expect(container.querySelectorAll('input')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('input')[1]!.getAttribute('id')).toBe('input2');
    expect((container.querySelectorAll('input')[1]! as HTMLInputElement).value).toBe('test2');
    expect(container.querySelectorAll('input')[2]!.textContent).toBe('');
    expect(container.querySelectorAll('input')[2]!.getAttribute('id')).toBe('input3');
    expect((container.querySelectorAll('input')[2]! as HTMLInputElement).value).toBe('test3');
    expect(container.querySelectorAll('input')[3]!.textContent).toBe('');
    expect(container.querySelectorAll('input')[3]!.getAttribute('id')).toBe('input4');
    expect((container.querySelectorAll('input')[3]! as HTMLInputElement).value).toBe('test4');
    expect(container.querySelectorAll('input')[4]!.textContent).toBe('');
    expect(container.querySelectorAll('input')[4]!.getAttribute('id')).toBe('input5');
    expect((container.querySelectorAll('input')[4]! as HTMLInputElement).value).toBe('test5');

    expect((container.querySelector('input#input1') as HTMLInputElement).value).toBe('test1');
    expect((container.querySelector('input#input2') as HTMLInputElement).value).toBe('test2');
    expect((container.querySelector('input#input3') as HTMLInputElement).value).toBe('test3');
    expect((container.querySelector('input#input4') as HTMLInputElement).value).toBe('test4');
    expect((container.querySelector('input#input5') as HTMLInputElement).value).toBe('test5');
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

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Hello, World!');
    expect(container.querySelector('button')!.getAttribute('type')).toBe('button');
    expect(container.querySelector('button')!.getAttribute('aria-label')).toBe('a1');
    expect(container.querySelector('button')!.getAttribute('title')).toBe('a1');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('Hello, World!');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Hello, World!');
    expect(container.querySelector('button')!.getAttribute('type')).toBe('button');
    expect(container.querySelector('button')!.getAttribute('aria-label')).toBe('a');
    expect(container.querySelector('button')!.getAttribute('title')).toBe('a');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('Hello, World!');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Hello, World!');
    expect(container.querySelector('button')!.getAttribute('type')).toBe('button');
    expect(container.querySelector('button')!.getAttribute('aria-label')).toBe('a1');
    expect(container.querySelector('button')!.getAttribute('title')).toBe('a1');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('Hello, World!');
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

    const { container, cleanup, flush } = await render(Cmp2, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelector('div')!.getAttribute('id')).toBe('test');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('div')[1]!.getAttribute('id')).toBe(null);
    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe(null);
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('counter');
    expect(container.querySelectorAll('section')).toHaveLength(1);
    expect(container.querySelector('section')!.textContent).toBe('');
    await trigger(container, '#counter', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelector('div')!.getAttribute('id')).toBe('test');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('div')[1]!.getAttribute('id')).toBe(null);
    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe(null);
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('counter');
    expect(container.querySelectorAll('section')).toHaveLength(1);
    expect(container.querySelector('section')!.textContent).toBe('');
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

    const { container, cleanup, flush } = await render(Parent, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
  });

  it('keeps prop aliases live across repeated updates', async () => {
    (globalThis as any).logs = [];
    type ChildProps = {
      obj: string;
      foo: SignalType<number>;
    };
    const Child = component$<ChildProps>(({ obj, foo }) => {
      (globalThis as any).logs.push('child render ' + obj);
      useTask$(() => {
        foo && foo.value;
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

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    await triggerAll(container, 'button', 'click');
    await flush();

    const values = () =>
      (globalThis as any).logs.filter((entry: string) => !entry.includes('render'));
    expect(values()[0]).toBe('foo');
    expect(values().at(-1)).toBe('bar');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(values().at(-1)).toBe('foo');

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

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect((globalThis as any).logs).toEqual([true, false]);
    await triggerAll(container, 'button', 'click');
    await flush();
    expect((globalThis as any).logs).toEqual([true, false, false, true]);
    await triggerAll(container, 'button', 'click');
    await flush();
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

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    await triggerAll(container, 'div', 'qvisible');
    await flush();
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.innerHTML).toContain('I am the innerHTML content!');
  });

  it('should not throw when props are null', async () => {
    const Child = component$((props: any) => {
      props = (globalThis as any).stuff ? (globalThis as any).foo : (globalThis as any).bar;
      return <div {...props} />;
    });
    const Cmp = component$(() => {
      return <Child />;
    });
    const { container, cleanup } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    await expect(container.querySelector('div')!.textContent).toBe('');
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
    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main')!.textContent).toBe('Remove123');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Remove');
    expect(container.querySelectorAll('div')).toHaveLength(3);
    expect(container.querySelector('div')!.textContent).toBe('1');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('2');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('3');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main')!.textContent).toBe('Remove');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Remove');
    expect(container.querySelectorAll('div')).toHaveLength(0);
    await expect(container.querySelector('main')!.textContent).toBe('Remove');
    expect(container.querySelector('main')!.querySelector('button')!.textContent).toBe('Remove');
  });

  it('should correctly remove all children for empty array - case 2', async () => {
    const Cmp = component$(() => {
      const list = useSignal([1, 2, 3]);
      return (
        <>
          <button onClick$={() => (list.value = [])}>Remove</button>
          <main>
            <div>
              {list.value.map((item) => (
                <div>{item}</div>
              ))}
            </div>
          </main>
        </>
      );
    });
    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Remove');
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main')!.textContent).toBe('123');
    expect(container.querySelectorAll('div')).toHaveLength(4);
    expect(container.querySelector('div')!.textContent).toBe('123');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('1');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('2');
    expect(container.querySelectorAll('div')[3]!.textContent).toBe('3');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Remove');
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
    await expect(container.querySelector('main')!.textContent).toBe('');
    expect(container.querySelector('main')!.querySelector('div')!.textContent).toBe('');
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
    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main')!.textContent).toBe('Remove123');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Remove');
    expect(container.querySelectorAll('div')).toHaveLength(3);
    expect(container.querySelector('div')!.textContent).toBe('1');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('2');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('3');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelector('main')!.textContent).toBe('Remove');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Remove');
    expect(container.querySelectorAll('div')).toHaveLength(0);
    await expect(container.querySelector('main')!.textContent).toBe('Remove');
    expect(container.querySelector('main')!.querySelector('button')!.textContent).toBe('Remove');
  });

  it('should rerun props subscribers', async () => {
    (globalThis as any).count = 0;
    (globalThis as any).logs = [];
    const ResponsiveImage = component$((props: { image: string }) => {
      const fullImage = useSignal('');
      const computedImage = useComputed$(() => `/computed/path/to/${props.image}`);
      useTask$(() => {
        props.image;
        fullImage.value = `/path/to/${props.image}`;
      });
      (globalThis as any).logs.push('ResponsiveImage render');
      return (
        <span onClick$={() => fullImage.value}>
          {props.image}
          {fullImage.value}
          {computedImage.value}
        </span>
      );
    });
    const PageContent = component$((props: { data: any }) => {
      function generateImage(data: any) {
        return data.image;
      }
      return (
        <div>
          <ResponsiveImage image={generateImage(props.data)} />
        </div>
      );
    });
    const Cmp = component$(() => {
      const pageLoaded = useSignal<any>({ image: '' });

      return (
        <>
          <button
            onClick$={() => {
              (globalThis as any).count++;
              pageLoaded.value = { image: `${(globalThis as any).count}.png` };
            }}
          >
            Generate
          </button>
          <PageContent data={pageLoaded.value} />
        </>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Generate');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('/path/to//computed/path/to/');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('/path/to//computed/path/to/');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Generate');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe(
      '1.png/path/to/1.png/computed/path/to/1.png'
    );
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe(
      '1.png/path/to/1.png/computed/path/to/1.png'
    );
  });

  it("should update multiple signals from component's props", async () => {
    const TextContent = component$((props: { 'data-nu'?: string; class?: string }) => {
      return (
        <div>
          <div id="issue-3482-datanu">data-nu: {props['data-nu']}</div>
          <div id="issue-3482-class">class: {props.class}</div>
        </div>
      );
    });
    const Issue3482 = component$(() => {
      const count = useSignal(0);

      const attributes = useComputed$(() => {
        return {
          'data-nu': String(count.value),
          class: `class-${count.value}`,
        };
      });

      return (
        <>
          <button id="issue-3482-button" onClick$={() => count.value++}>
            Increment
          </button>
          <TextContent {...attributes.value}></TextContent>
        </>
      );
    });
    const { container, cleanup, flush } = await render(Issue3482, { debug });
    onTestFinished(cleanup);
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Increment');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('issue-3482-button');
    expect(container.querySelectorAll('div')).toHaveLength(3);
    expect(container.querySelector('div')!.textContent).toBe('data-nu: 1class: class-1');
    expect(container.querySelector('div')!.getAttribute('id')).toBe(null);
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('data-nu: 1');
    expect(container.querySelectorAll('div')[1]!.getAttribute('id')).toBe('issue-3482-datanu');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('class: class-1');
    expect(container.querySelectorAll('div')[2]!.getAttribute('id')).toBe('issue-3482-class');
  });

  it('should correctly set undefined value', async () => {
    const Cmp = component$(() => {
      const someValue = useSignal<string | undefined>(undefined);
      return (
        <div>
          <input value={someValue.value} />

          <button
            id="foo"
            onClick$={() => {
              someValue.value = 'foo';
            }}
          ></button>
          <button
            id="undefined"
            onClick$={() => {
              someValue.value = undefined;
            }}
          ></button>
        </div>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect((container.querySelector('input')! as HTMLInputElement).value).toBe('');
    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('foo');
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('undefined');
    await trigger(container, 'button#foo', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect((container.querySelector('input')! as HTMLInputElement).value).toBe('foo');
    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('foo');
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('undefined');
    await trigger(container, 'button#undefined', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect((container.querySelector('input')! as HTMLInputElement).value).toBe('');
    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('foo');
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('undefined');
  });

  it('should register multiple events for var props', async () => {
    const Cmp = component$<any>((props) => {
      const clickCount = useSignal(0);
      const mouseOverCount = useSignal(0);
      return (
        <div
          onClick$={() => clickCount.value++}
          onMouseOver$={() => mouseOverCount.value++}
          // ensure it is var prop
          {...props}
        >
          {`clicks: ${clickCount.value}, mouseovers: ${mouseOverCount.value}`}
        </div>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('clicks: 0, mouseovers: 0');

    await triggerAll(container, 'div', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('clicks: 1, mouseovers: 0');

    await triggerAll(container, 'div', 'mouseover');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('clicks: 1, mouseovers: 1');
  });

  it('should correctly rerender array without keys', async () => {
    const Cmp = component$(() => {
      const arrData = useSignal<number[]>([1, 2, 3, 4, 5]);
      return (
        <div>
          {arrData.value.map((item) => (
            <div>Item: {item}</div>
          ))}

          <button
            onClick$={() => {
              arrData.value = [3, 4, 5];
            }}
          ></button>
        </div>
      );
    });
    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('div')).toHaveLength(6);
    expect(container.querySelector('div')!.textContent).toBe('Item: 1Item: 2Item: 3Item: 4Item: 5');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Item: 1');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('Item: 2');
    expect(container.querySelectorAll('div')[3]!.textContent).toBe('Item: 3');
    expect(container.querySelectorAll('div')[4]!.textContent).toBe('Item: 4');
    expect(container.querySelectorAll('div')[5]!.textContent).toBe('Item: 5');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('div')).toHaveLength(4);
    expect(container.querySelector('div')!.textContent).toBe('Item: 3Item: 4Item: 5');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Item: 3');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('Item: 4');
    expect(container.querySelectorAll('div')[3]!.textContent).toBe('Item: 5');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
  });

  it('should correctly rerender content in the same component with slot', async () => {
    const CustomLink = component$(() => {
      return (
        <a>
          <Slot />
        </a>
      );
    });

    const Cmp1 = component$(() => {
      const arrData = useSignal<number[]>([]);
      useTask$(async () => {
        await delay(1);
        arrData.value = [1, 2, 3, 4, 5];
      });
      return (
        <div>
          <CustomLink>Navigate to other page</CustomLink>
          <div>
            {arrData.value.map((item) => (
              <div>Item: {item}</div>
            ))}
          </div>
        </div>
      );
    });

    const Cmp2 = component$(() => {
      return (
        <div>
          <CustomLink>Navigate to home page</CustomLink>
        </div>
      );
    });

    const Cmp = component$(() => {
      const toggle = useSignal(false);

      return (
        <div>
          {toggle.value ? <Cmp1 /> : <Cmp2 />}
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
        </div>
      );
    });
    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('Navigate to home page');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Navigate to home page');
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelector('a')!.textContent).toBe('Navigate to home page');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');

    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(8);
    expect(container.querySelector('div')!.textContent).toBe(
      'Navigate to other pageItem: 1Item: 2Item: 3Item: 4Item: 5'
    );
    expect(container.querySelectorAll('div')[1]!.textContent).toBe(
      'Navigate to other pageItem: 1Item: 2Item: 3Item: 4Item: 5'
    );
    expect(container.querySelectorAll('div')[2]!.textContent).toBe(
      'Item: 1Item: 2Item: 3Item: 4Item: 5'
    );
    expect(container.querySelectorAll('div')[3]!.textContent).toBe('Item: 1');
    expect(container.querySelectorAll('div')[4]!.textContent).toBe('Item: 2');
    expect(container.querySelectorAll('div')[5]!.textContent).toBe('Item: 3');
    expect(container.querySelectorAll('div')[6]!.textContent).toBe('Item: 4');
    expect(container.querySelectorAll('div')[7]!.textContent).toBe('Item: 5');
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelector('a')!.textContent).toBe('Navigate to other page');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
  });

  it('should correctly diff 2 empty texts with element node', async () => {
    const Cmp = component$(() => {
      const counter = useSignal(0);
      const QrlComponent = $(() => <div>Outside Component</div>);

      const componentSignal = useSignal<QRL<any>>($(() => <div>Hello</div>));
      return (
        <>
          <button
            onClick$={() => {
              counter.value++;
            }}
          >
            Import Button {counter.value}
          </button>
          <br />
          {counter.value > 0 && <div>Hi there</div>}
          {counter.value > 0 && QrlComponent()}
          {counter.value > 0 && componentSignal.value}
        </>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Import Button 0');
    expect(container.querySelectorAll('br')).toHaveLength(1);
    expect(container.querySelector('br')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(0);

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Import Button 1');
    expect(container.querySelectorAll('br')).toHaveLength(1);
    expect(container.querySelector('br')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(3);
    expect(container.querySelector('div')!.textContent).toBe('Hi there');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Outside Component');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('Hello');
  });
  it('should correctly diff 2 empty texts with virtual node', async () => {
    const Cmp = component$(() => {
      const counter = useSignal(0);
      const QrlComponent = $(() => <div>Outside Component</div>);

      const componentSignal = useSignal<QRL<any>>($(() => <div>Hello</div>));
      return (
        <>
          <button
            onClick$={() => {
              counter.value++;
            }}
          >
            Import Button {counter.value}
          </button>
          <br />
          {counter.value > 0 && <>Hi there</>}
          {counter.value > 0 && QrlComponent()}
          {counter.value > 0 && componentSignal.value}
        </>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Import Button 0');
    expect(container.querySelectorAll('br')).toHaveLength(1);
    expect(container.querySelector('br')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(0);

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Import Button 1');
    expect(container.querySelectorAll('br')).toHaveLength(1);
    expect(container.querySelector('br')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('Outside Component');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Hello');
  });

  it('should not rerender child component with null key when parent component is rerendered', async () => {
    (globalThis as any).count = 0;
    const Child = component$(() => {
      (globalThis as any).count++;
      return <div>Child</div>;
    });

    const Cmp = component$(() => {
      const toggle = useSignal(false);
      // component subscription
      toggle.value;
      return (
        <>
          <button onClick$={() => (toggle.value = !toggle.value)}>Toggle</button>
          <Child key={null} />
        </>
      );
    });
    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Toggle');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Child');
    expect((globalThis as any).count).toBe(1);
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Toggle');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Child');
    expect((globalThis as any).count).toBe(1);

    (globalThis as any).count = undefined;
  });

  it('should add var props to a child component created without var props', async () => {
    const Child = component$((props: { klass?: string }) => <span class={props.klass}>child</span>);

    const Cmp = component$(() => {
      const show = useSignal(false);
      const on = useSignal(false);
      const extra = useComputed$(() => (on.value ? { klass: 'added' } : {}));
      return (
        <>
          <button id="show" onClick$={() => (show.value = true)}></button>
          <button id="add" onClick$={() => (on.value = true)}></button>
          {show.value && <Child {...extra.value} />}
        </>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    await trigger(container, '#show', 'click');
    await flush();
    expect(container.querySelector('span')!.className).toBe('');
    await trigger(container, '#add', 'click');
    await flush();
    expect(container.querySelector('span')!.className).toBe('added');
  });

  it('should not duplicate siblings when toggling element with dangerouslySetInnerHTML', async () => {
    const Cmp = component$(() => {
      const toggle = useSignal(false);
      return (
        <div>
          <button onClick$={() => (toggle.value = !toggle.value)}>Toggle</button>
          {toggle.value && <style dangerouslySetInnerHTML={''} />}
          <span>{'aaa'}</span>
        </div>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Toggleaaa');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Toggle');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('aaa');
    expect(container.querySelectorAll('style')).toHaveLength(0);

    await expect(container.querySelector('div')!.textContent).toBe('Toggleaaa');
    expect(container.querySelector('div')!.querySelector('button')!.textContent).toBe('Toggle');
    expect(container.querySelector('div')!.querySelector('span')!.textContent).toBe('aaa');

    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Toggleaaa');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Toggle');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('aaa');
    expect(container.querySelectorAll('style')).toHaveLength(1);
    expect(container.querySelector('style')!.textContent).toBe('');

    await expect(container.querySelector('div')!.textContent).toBe('Toggleaaa');
    expect(container.querySelector('div')!.querySelector('button')!.textContent).toBe('Toggle');
    expect(container.querySelector('div')!.querySelector('span')!.textContent).toBe('aaa');
    expect(container.querySelector('div')!.querySelector('style')!.textContent).toBe('');

    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Toggleaaa');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Toggle');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('aaa');
    expect(container.querySelectorAll('style')).toHaveLength(0);

    await expect(container.querySelector('div')!.textContent).toBe('Toggleaaa');
    expect(container.querySelector('div')!.querySelector('button')!.textContent).toBe('Toggle');
    expect(container.querySelector('div')!.querySelector('span')!.textContent).toBe('aaa');
  });

  it('keeps const props on a captured props proxy after eager SSR resume', async () => {
    const Test = component$(() => <div />);

    const Child = component$((props: any) => {
      useTask$(() => {
        props.isOpened.value;
      });

      return <Test {...props} />;
    });

    const Parent = component$(() => {
      const isOpened = useSignal(false);

      return (
        <>
          <button onClick$={() => (isOpened.value = !isOpened.value)}>Toggle</button>
          <Child isOpened={isOpened} />
        </>
      );
    });

    const { container, cleanup, flush } = await render(Parent, {
      debug,
    });
    onTestFinished(cleanup);

    await triggerAll(container, 'button', 'click');
    await flush();
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
      const { container, cleanup, flush } = await render(Issue5647, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('div')).toHaveLength(3);
      expect(container.querySelector('div')!.textContent).toBe(
        "Hi, this doesn't work...isShow value: trueToggle"
      );
      expect(container.querySelectorAll('div')[1]!.textContent).toBe(
        'NestedisShow value: trueToggle'
      );
      expect(container.querySelectorAll('div')[2]!.textContent).toBe('Nested');
      expect(container.querySelectorAll('span')).toHaveLength(1);
      expect(container.querySelector('span')!.textContent).toBe("Hi, this doesn't work...");
      expect(container.querySelectorAll('p')).toHaveLength(2);
      expect(container.querySelector('p')!.textContent).toBe('isShow value: true');
      expect(container.querySelectorAll('p')[1]!.textContent).toBe('isShow value: true');
      expect(container.querySelectorAll('button')).toHaveLength(2);
      expect(container.querySelector('button')!.textContent).toBe('Toggle');
      expect(container.querySelector('button')!.getAttribute('id')).toBe('first');
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('Toggle');
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('second');
      await trigger(container, 'button#first', 'click');
      await flush();
      expect(container.querySelectorAll('div')).toHaveLength(3);
      expect(container.querySelector('div')!.textContent).toBe('isShow value: falseToggle');
      expect(container.querySelectorAll('div')[1]!.textContent).toBe(
        'NestedisShow value: trueToggle'
      );
      expect(container.querySelectorAll('div')[2]!.textContent).toBe('Nested');
      expect(container.querySelectorAll('span')).toHaveLength(0);
      expect(container.querySelectorAll('p')).toHaveLength(2);
      expect(container.querySelector('p')!.textContent).toBe('isShow value: false');
      expect(container.querySelectorAll('p')[1]!.textContent).toBe('isShow value: true');
      expect(container.querySelectorAll('button')).toHaveLength(2);
      expect(container.querySelector('button')!.textContent).toBe('Toggle');
      expect(container.querySelector('button')!.getAttribute('id')).toBe('first');
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('Toggle');
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('second');
      await trigger(container, 'button#second', 'click');
      await flush();
      expect(container.querySelectorAll('div')).toHaveLength(2);
      expect(container.querySelector('div')!.textContent).toBe('isShow value: falseToggle');
      expect(container.querySelectorAll('div')[1]!.textContent).toBe('isShow value: falseToggle');
      expect(container.querySelectorAll('span')).toHaveLength(0);
      expect(container.querySelectorAll('p')).toHaveLength(2);
      expect(container.querySelector('p')!.textContent).toBe('isShow value: false');
      expect(container.querySelectorAll('p')[1]!.textContent).toBe('isShow value: false');
      expect(container.querySelectorAll('button')).toHaveLength(2);
      expect(container.querySelector('button')!.textContent).toBe('Toggle');
      expect(container.querySelector('button')!.getAttribute('id')).toBe('first');
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('Toggle');
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('second');
      await trigger(container, 'button#first', 'click');
      await flush();
      expect(container.querySelectorAll('div')).toHaveLength(2);
      expect(container.querySelector('div')!.textContent).toBe(
        "Hi, this doesn't work...isShow value: trueToggle"
      );
      expect(container.querySelectorAll('div')[1]!.textContent).toBe('isShow value: falseToggle');
      expect(container.querySelectorAll('span')).toHaveLength(1);
      expect(container.querySelector('span')!.textContent).toBe("Hi, this doesn't work...");
      expect(container.querySelectorAll('p')).toHaveLength(2);
      expect(container.querySelector('p')!.textContent).toBe('isShow value: true');
      expect(container.querySelectorAll('p')[1]!.textContent).toBe('isShow value: false');
      expect(container.querySelectorAll('button')).toHaveLength(2);
      expect(container.querySelector('button')!.textContent).toBe('Toggle');
      expect(container.querySelector('button')!.getAttribute('id')).toBe('first');
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('Toggle');
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('second');
    });

    it('#6585 - reactivity should work with template literals', async () => {
      const Cmp = component$(() => {
        const useFoo = (count: SignalType<number>) => {
          const tag = $((s: string | TemplateStringsArray) => {
            const value = typeof s === 'string' ? s : s[0];
            return `${value}-${count.value}`;
          });
          return tag;
        };
        const count = useSignal(0);
        const foo = useFoo(count);
        const called = useComputed$(async () => await foo('test'));
        const tagged = useComputed$(async () => await foo`test`);
        return (
          <>
            <p>{called.value}</p>
            <p>{tagged.value}</p>
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

      const { container, cleanup, flush } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('p')).toHaveLength(2);
      expect(container.querySelector('p')!.textContent).toBe('test-0');
      expect(container.querySelectorAll('p')[1]!.textContent).toBe('test-0');
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Count up');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('p')).toHaveLength(2);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('p')!.textContent).toBe('test-1');
        expect(container.querySelectorAll('p')[1]!.textContent).toBe('test-1');
      });
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Count up');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('p')).toHaveLength(2);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('p')!.textContent).toBe('test-2');
        expect(container.querySelectorAll('p')[1]!.textContent).toBe('test-2');
      });
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Count up');
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

      const { container, cleanup, flush } = await render(Cmp, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('Select ASelect BSelect C');
      expect(container.querySelectorAll('button')).toHaveLength(3);
      expect(container.querySelector('button')!.textContent).toBe('Select A');
      expect(container.querySelector('button')!.getAttribute('id')).toBe('A');
      expect(container.querySelector('button')!.getAttribute('type')).toBe('button');
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('Select B');
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('B');
      expect(container.querySelectorAll('button')[1]!.getAttribute('type')).toBe('button');
      expect(container.querySelectorAll('button')[2]!.textContent).toBe('Select C');
      expect(container.querySelectorAll('button')[2]!.getAttribute('id')).toBe('C');
      expect(container.querySelectorAll('button')[2]!.getAttribute('type')).toBe('button');
      expect(container.querySelectorAll('p')).toHaveLength(2);
      expect(container.querySelector('p')!.textContent).toBe('B');
      expect(container.querySelectorAll('p')[1]!.textContent).toBe('A or B');

      await trigger(container, '#A', 'click');
      await flush();

      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('Select ASelect BSelect C');
      expect(container.querySelectorAll('button')).toHaveLength(3);
      expect(container.querySelector('button')!.textContent).toBe('Select A');
      expect(container.querySelector('button')!.getAttribute('id')).toBe('A');
      expect(container.querySelector('button')!.getAttribute('type')).toBe('button');
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('Select B');
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('B');
      expect(container.querySelectorAll('button')[1]!.getAttribute('type')).toBe('button');
      expect(container.querySelectorAll('button')[2]!.textContent).toBe('Select C');
      expect(container.querySelectorAll('button')[2]!.getAttribute('id')).toBe('C');
      expect(container.querySelectorAll('button')[2]!.getAttribute('type')).toBe('button');
      expect(container.querySelectorAll('p')).toHaveLength(2);
      expect(container.querySelector('p')!.textContent).toBe('A');
      expect(container.querySelectorAll('p')[1]!.textContent).toBe('A or B');

      await trigger(container, '#C', 'click');
      await flush();

      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('Select ASelect BSelect C');
      expect(container.querySelectorAll('button')).toHaveLength(3);
      expect(container.querySelector('button')!.textContent).toBe('Select A');
      expect(container.querySelector('button')!.getAttribute('id')).toBe('A');
      expect(container.querySelector('button')!.getAttribute('type')).toBe('button');
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('Select B');
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('B');
      expect(container.querySelectorAll('button')[1]!.getAttribute('type')).toBe('button');
      expect(container.querySelectorAll('button')[2]!.textContent).toBe('Select C');
      expect(container.querySelectorAll('button')[2]!.getAttribute('id')).toBe('C');
      expect(container.querySelectorAll('button')[2]!.getAttribute('type')).toBe('button');
      expect(container.querySelectorAll('p')).toHaveLength(1);
      expect(container.querySelector('p')!.textContent).toBe('C');

      await trigger(container, '#B', 'click');
      await flush();

      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('Select ASelect BSelect C');
      expect(container.querySelectorAll('button')).toHaveLength(3);
      expect(container.querySelector('button')!.textContent).toBe('Select A');
      expect(container.querySelector('button')!.getAttribute('id')).toBe('A');
      expect(container.querySelector('button')!.getAttribute('type')).toBe('button');
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('Select B');
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('B');
      expect(container.querySelectorAll('button')[1]!.getAttribute('type')).toBe('button');
      expect(container.querySelectorAll('button')[2]!.textContent).toBe('Select C');
      expect(container.querySelectorAll('button')[2]!.getAttribute('id')).toBe('C');
      expect(container.querySelectorAll('button')[2]!.getAttribute('type')).toBe('button');
      expect(container.querySelectorAll('p')).toHaveLength(2);
      expect(container.querySelector('p')!.textContent).toBe('B');
      expect(container.querySelectorAll('p')[1]!.textContent).toBe('A or B');
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

      const { container, cleanup, flush } = await render(Cmp, { debug });
      onTestFinished(cleanup);

      await triggerAll(container, 'button', 'click');
      await flush();
    });

    it('should materialize q:vnode component keys containing vnode-data directive characters', async () => {
      const ChildComp = component$(() => {
        useVisibleTask$(() => {});
        return <i>child</i>;
      });

      const Cmp = component$(() => {
        const count = useSignal(0);

        return (
          <div>
            <button onClick$={() => count.value++}>{count.value}</button>
            <ChildComp key="?=;@~" />
          </div>
        );
      });

      const { container, cleanup, flush } = await render(Cmp, { debug });
      onTestFinished(cleanup);

      await triggerAll(container, 'button', 'click');
      await flush();

      expect(container.querySelector('button')!.textContent).toBe('1');
      expect(container.querySelector('i')!.textContent).toBe('child');
    });
  });
  it('should keep null-valued props spread into a component', async () => {
    const Child = component$((props: { a: number; s: { p: number } | null }) => (
      <span>{`${'s' in props}:${props.s === null}`}</span>
    ));
    const Parent = component$(() => {
      const data = { a: 1, s: null };
      return <Child {...data} />;
    });

    const { container, cleanup } = await render(Parent, { debug });
    onTestFinished(cleanup);
    expect(container.querySelector('span')!.textContent).toBe('true:true');
  });
});

const MyComp = () => {
  return (
    <>
      <h1>Test</h1>
      <p>Lorem</p>
      <h2>ipsum</h2>
      <p>foo</p>
      <h2>bar</h2>
    </>
  );
};

const InlineWrapper = () => {
  return <MyComp />;
};

const ChildrenWrapper = () => <Slot />;

const Id = (props: any) => <div>Id: {props.id}</div>;

const inlineProjectionContext = createContextId<{ value: string }>('inline-projection');

const InlineReadsContext = () => {
  const ctx = useContext(inlineProjectionContext, { value: 'default' });
  return <span>{ctx.value}</span>;
};

const ChildInline = () => {
  return <div>Child inline</div>;
};

describe(`${name}: inline component`, () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should render inline component', async () => {
    const MyComp = () => {
      return <>Hello World!</>;
    };

    const { container, cleanup } = await render(MyComp, { debug });
    onTestFinished(cleanup);
    expect(
      Array.from(container.childNodes)
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent)
        .join('')
    ).toBe('Hello World!');
  });

  it('should render nested component', async () => {
    const Child = (props: { name: string }) => {
      return <>{props.name}</>;
    };

    const Parent = (props: { salutation: string; name: string }) => {
      return (
        <>
          {props.salutation} <Child name={props.name} />
        </>
      );
    };

    const { container, cleanup } = await render(Parent, {
      ...{
        debug,
      },
      props: { salutation: 'Hello', name: 'World' },
    });
    onTestFinished(cleanup);
    expect(
      Array.from(container.childNodes)
        .filter((node) => node.nodeType === 3)
        .map((node) => node.textContent)
        .join('')
    ).toBe('Hello World');
  });

  it('should render inline component with null key', async () => {
    const { container, cleanup } = await render(MyComp, {
      ...{ debug },
      props: { key: null },
    });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('h1')!.textContent).toBe('Test');
    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelector('p')!.textContent).toBe('Lorem');
    expect(container.querySelectorAll('p')[1]!.textContent).toBe('foo');
    expect(container.querySelectorAll('h2')).toHaveLength(2);
    expect(container.querySelector('h2')!.textContent).toBe('ipsum');
    expect(container.querySelectorAll('h2')[1]!.textContent).toBe('bar');
  });

  it('should toggle component$ and inline wrapper', async () => {
    const Test = component$(() => {
      return <div>Test</div>;
    });
    const Wrapper = component$(() => {
      const toggle = useSignal(true);
      return (
        <>
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
          {toggle.value ? <Test /> : <InlineWrapper />}
        </>
      );
    });

    const { container, cleanup, flush } = await render(Wrapper, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Test');
    expect(container.querySelectorAll('h1')).toHaveLength(0);
    expect(container.querySelectorAll('p')).toHaveLength(0);
    expect(container.querySelectorAll('h2')).toHaveLength(0);
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(0);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('h1')!.textContent).toBe('Test');
    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelector('p')!.textContent).toBe('Lorem');
    expect(container.querySelectorAll('p')[1]!.textContent).toBe('foo');
    expect(container.querySelectorAll('h2')).toHaveLength(2);
    expect(container.querySelector('h2')!.textContent).toBe('ipsum');
    expect(container.querySelectorAll('h2')[1]!.textContent).toBe('bar');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Test');
    expect(container.querySelectorAll('h1')).toHaveLength(0);
    expect(container.querySelectorAll('p')).toHaveLength(0);
    expect(container.querySelectorAll('h2')).toHaveLength(0);
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(0);
    expect(container.querySelectorAll('h1')).toHaveLength(1);
    expect(container.querySelector('h1')!.textContent).toBe('Test');
    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelector('p')!.textContent).toBe('Lorem');
    expect(container.querySelectorAll('p')[1]!.textContent).toBe('foo');
    expect(container.querySelectorAll('h2')).toHaveLength(2);
    expect(container.querySelector('h2')!.textContent).toBe('ipsum');
    expect(container.querySelectorAll('h2')[1]!.textContent).toBe('bar');
  });

  it('should not rerender component', async () => {
    const Child = component$((props: { id: number }) => {
      const renders = useStore(
        {
          count: 0,
        },
        { reactive: false }
      );
      renders.count++;
      const rerenders = renders.count + 0;
      return (
        <>
          <Id id={props.id} />
          {rerenders}
        </>
      );
    });
    const Cmp = component$(() => {
      const id = useSignal(0);
      return (
        <>
          <button
            onClick$={() => {
              id.value++;
            }}
          >
            Increment ID
          </button>
          <Child id={id.value} />
        </>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Increment ID');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Id: 0');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Increment ID');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Id: 1');
  });

  it('should keep index-keyed inline components on their items when the array is sorted', async () => {
    const Cmp = component$(() => {
      const items = useStore(['qwik', 'foo', 'bar']);

      const Item = (props: { name: string }) => {
        return <div>{props.name}</div>;
      };

      return (
        <footer>
          <button onClick$={() => items.sort()}></button>
          {items.map((item, key) => (
            <Item name={item} key={key} />
          ))}
        </footer>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('footer')).toHaveLength(1);
    expect(container.querySelector('footer')!.textContent).toBe('qwikfoobar');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(3);
    expect(container.querySelector('div')!.textContent).toBe('qwik');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('foo');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('bar');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('footer')).toHaveLength(1);
    // a row keeps the item it was created with while its key stays: key by identity to replace it
    expect(container.querySelector('footer')!.textContent).toBe('qwikfoobar');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(3);
    expect(container.querySelector('div')!.textContent).toBe('qwik');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('foo');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('bar');
  });

  it('should conditionally render different inline component', async () => {
    const Cmp = component$(() => {
      const show = useSignal(true);

      const Item = (props: { name: string }) => {
        return <div>{props.name}</div>;
      };

      const Item2 = (props: { name: string }) => {
        return <span>{props.name}</span>;
      };

      return (
        <footer>
          <button onClick$={() => (show.value = !show.value)}></button>
          {show.value ? <Item name={'foo'} /> : <Item2 name={'bar'} />}
        </footer>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('footer')).toHaveLength(1);
    expect(container.querySelector('footer')!.textContent).toBe('foo');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('foo');
    expect(container.querySelectorAll('span')).toHaveLength(0);

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('footer')).toHaveLength(1);
    expect(container.querySelector('footer')!.textContent).toBe('bar');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(0);
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('bar');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('footer')).toHaveLength(1);
    expect(container.querySelector('footer')!.textContent).toBe('foo');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('foo');
    expect(container.querySelectorAll('span')).toHaveLength(0);
  });

  it('should conditionally render different inline component inside inline component', async () => {
    const Cmp = component$(() => {
      const show = useSignal(true);

      const Item = (props: { name: string }) => {
        return <div>{props.name}</div>;
      };

      const Item2 = (props: { name: string }) => {
        return <span>{props.name}</span>;
      };

      const Wrapper = () => {
        return <>{show.value ? <Item name={'foo'} /> : <Item2 name={'bar'} />}</>;
      };

      return (
        <footer>
          <button onClick$={() => (show.value = !show.value)}></button>
          <Wrapper />
        </footer>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('footer')).toHaveLength(1);
    expect(container.querySelector('footer')!.textContent).toBe('foo');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('foo');
    expect(container.querySelectorAll('span')).toHaveLength(0);

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('footer')).toHaveLength(1);
    expect(container.querySelector('footer')!.textContent).toBe('bar');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(0);
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('bar');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('footer')).toHaveLength(1);
    expect(container.querySelector('footer')!.textContent).toBe('foo');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('foo');
    expect(container.querySelectorAll('span')).toHaveLength(0);
  });

  it('should rerender without locate error', async () => {
    const errorSpy = vi.spyOn(logUtils, 'throwErrorAndStop');
    const ReplOutputPanel = component$(() => {
      const store = useStore<any>({
        selectedOutputPanel: 'app',
        serverUrl: undefined,
      });

      const ReplTabButton = (props: any) => {
        return (
          <button id={props.id} class={{ 'active-tab': props.isActive }} onClick$={props.onClick$}>
            {props.text}
          </button>
        );
      };

      useVisibleTask$(() => {
        store.serverUrl = 'test';
      });

      return (
        <div>
          <ReplTabButton
            text="App"
            id="1"
            isActive={store.selectedOutputPanel === 'app'}
            onClick$={async () => {
              store.selectedOutputPanel = 'app';
            }}
          />

          <ReplTabButton
            text="HTML"
            id="2"
            isActive={store.selectedOutputPanel === 'html'}
            onClick$={async () => {
              store.selectedOutputPanel = 'html';
            }}
          />

          {store.serverUrl && <div>test</div>}
        </div>
      );
    });

    const { container, cleanup, flush } = await render(ReplOutputPanel, { debug });
    onTestFinished(cleanup);

    await triggerAll(container, 'div', 'qvisible');
    await flush();

    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('AppHTMLtest');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('test');
    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('App');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('1');
    expect(container.querySelector('button')!.getAttribute('class')?.trim() ?? '').toBe(
      'active-tab'
    );
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('HTML');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('2');
    expect(container.querySelectorAll('button')[1]!.getAttribute('class')?.trim() ?? '').toBe('');

    await trigger(container, 'button[id="2"]', 'click');
    await flush();

    expect(errorSpy).not.toHaveBeenCalled();

    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('AppHTMLtest');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('test');
    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('App');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('1');
    expect(container.querySelector('button')!.getAttribute('class')?.trim() ?? '').toBe('');
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('HTML');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('2');
    expect(container.querySelectorAll('button')[1]!.getAttribute('class')?.trim() ?? '').toBe(
      'active-tab'
    );
  });

  it('should render swap component$ and inline component with the same key', async () => {
    const Child = component$(() => {
      return <div>Child component$</div>;
    });

    const Parent = component$(() => {
      const toggle = useSignal(true);
      return (
        <>
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
          {/* same key, simulate different routes and files, but the same keys at the same place */}
          {toggle.value ? <ChildInline key="samekey" /> : <Child key="samekey" />}
        </>
      );
    });

    const { container, cleanup, flush } = await render(Parent, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Child inline');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Child component$');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Child inline');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('Child component$');
  });

  it('should preserve table cell spans after inline component rerender', async () => {
    const Cmp = component$(() => {
      const sig = useSignal(true);
      const valA = [3, 6, 12, 24];
      const valB = [12, 24];
      sig.value;

      return (
        <div>
          <ChildrenWrapper>
            <table>
              <thead>
                <tr>
                  <th rowSpan={3}>ZZZ</th>
                  <th colSpan={1 + valA.length + valB.length}>AAA</th>
                </tr>
                <tr>
                  <th colSpan={valA.length + 1}>CCC</th>
                  <th colSpan={valB.length}>DDD</th>
                </tr>
                <tr>
                  <th>EEE</th>
                  {valA.map((value, index) => (
                    <th key={index}>{value}</th>
                  ))}
                  {valB.map((value, index) => (
                    <th key={index}>{value}</th>
                  ))}
                </tr>
              </thead>
              <tbody></tbody>
            </table>
            <button onClick$={() => (sig.value = !sig.value)}>submit</button>
          </ChildrenWrapper>
        </div>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    const getColSpans = () =>
      Array.from(
        container.querySelectorAll<HTMLTableCellElement>('th[colspan]'),
        (cell) => cell.colSpan
      );

    expect(getColSpans()).toEqual([7, 5, 2]);
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(getColSpans()).toEqual([7, 5, 2]);
  });

  // Object component factories still produce invalid compiler output.
  it.todo('should remove children from varProps and not throw');

  it('should rerender inline component in projection', async () => {
    const Link = component$(() => {
      return (
        <a>
          <Slot />
        </a>
      );
    });

    const Cmp = component$(() => {
      const bool = useSignal(false);

      const FnComp: FunctionComponent<{ bool: SignalType<boolean> }> = (props) => {
        return (
          <button
            onClick$={() => {
              props.bool.value = !props.bool.value;
            }}
          >
            Change {JSON.stringify(props.bool.value)}
          </button>
        );
      };

      return (
        <Link>
          <FnComp bool={bool} />
        </Link>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelector('a')!.textContent).toBe('Change false');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Change false');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelector('a')!.textContent).toBe('Change true');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Change true');
  });

  it('should resolve context when projected into a context provider', async () => {
    const Provider = component$(() => {
      useContextProvider(inlineProjectionContext, { value: 'provided' });
      return <Slot />;
    });
    const Layout = component$(() => {
      return (
        <Provider>
          <Slot />
        </Provider>
      );
    });
    const App = component$(() => {
      return (
        <Layout>
          <InlineReadsContext />
        </Layout>
      );
    });

    const { container, cleanup } = await render(App, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('provided');
  });
});

describe(`${name}: render regression`, () => {
  describe('issue #2608', () => {
    it('same tag', async () => {
      const Issue2608 = component$(() => {
        const show = useSignal(false);
        return (
          <>
            <button onClick$={() => (show.value = !show.value)} />
            {show.value && <div>Content</div>}
            <div>
              <input type="text" />
            </div>
          </>
        );
      });

      const { container, cleanup, flush } = await render(Issue2608, { debug });
      onTestFinished(cleanup);
      // const toggle = page.locator('#issue-2608-btn');
      const input = () => container.querySelector('input') as HTMLInputElement;
      expect(input().value).toBe('');
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('');
      expect(container.querySelectorAll('input')).toHaveLength(1);
      expect(container.querySelector('input')!.textContent).toBe('');
      expect(container.querySelector('input')!.getAttribute('type')).toBe('text');
      input().value = 'some text';
      await triggerAll(container, 'button', 'click');
      await flush(); // show
      expect(input().value).toBe('some text');
      await triggerAll(container, 'button', 'click');
      await flush(); // hide
      expect(input().value).toBe('some text');
      await triggerAll(container, 'button', 'click');
      await flush(); // show
      expect(input().value).toBe('some text');
    });

    it('different tag', async () => {
      const Issue2608 = component$(() => {
        const show = useSignal(false);
        return (
          <>
            <button onClick$={() => (show.value = !show.value)} />
            {show.value && <span>Content</span>}
            <div>
              <input type="text" />
            </div>
          </>
        );
      });

      const { container, cleanup, flush } = await render(Issue2608, { debug });
      onTestFinished(cleanup);
      // const toggle = page.locator('#issue-2608-btn');
      const input = () => container.querySelector('input') as HTMLInputElement;
      expect(input().value).toBe('');
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('');
      expect(container.querySelectorAll('input')).toHaveLength(1);
      expect(container.querySelector('input')!.textContent).toBe('');
      expect(container.querySelector('input')!.getAttribute('type')).toBe('text');
      input().value = 'some text';
      await triggerAll(container, 'button', 'click');
      await flush(); // show
      expect(input().value).toBe('some text');
      await triggerAll(container, 'button', 'click');
      await flush(); // hide
      expect(input().value).toBe('some text');
      await triggerAll(container, 'button', 'click');
      await flush(); // show
      expect(input().value).toBe('some text');
    });
  });

  describe('issue #9009', () => {
    it('notifies a task of a prop change after unrelated updates', async () => {
      // Module-scope log: a captured array would be serialized, so SSR would push into a copy
      const taskLog: boolean[] = ((globalThis as any).log = []);

      const Panel = component$<{ open?: boolean; onClose$?: QRL<() => void> }>((props) => {
        useTask$(() => {
          (globalThis as any).log.push(props.open === true);
        });
        return (
          <dialog open={props.open === true}>
            <button id="close" onClick$={props.onClose$} />
          </dialog>
        );
      });

      const Issue9009 = component$(() => {
        const store = useStore<{ action?: string; loading: boolean }>({ loading: false });
        return (
          <main>
            <button id="reload" onClick$={() => (store.loading = !store.loading)} />
            <button id="open" onClick$={() => (store.action = 'FILTERS')} />
            {store.loading ? <p>Loading</p> : <p>Loaded</p>}
            <Panel
              open={store.action === 'FILTERS'}
              onClose$={$(() => {
                store.action = undefined;
              })}
            />
          </main>
        );
      });

      const { container, cleanup, flush } = await render(Issue9009, { debug });
      onTestFinished(cleanup);
      expect(taskLog.length).toBeGreaterThan(0);
      expect(taskLog.every((open) => !open)).toBe(true);

      // Unrelated changes may invalidate observers without changing the prop.
      await trigger(container, '#reload', 'click');
      await flush();
      await trigger(container, '#reload', 'click');
      await flush();
      expect(taskLog.length).toBeGreaterThan(0);
      expect(taskLog.every((open) => !open)).toBe(true);

      await trigger(container, '#open', 'click');
      await flush();
      expect(taskLog.at(-1)).toBe(true);
      expect(container.querySelector('dialog')!.hasAttribute('open')).toBe(true);

      await trigger(container, '#close', 'click');
      await flush();
      expect(taskLog.at(-1)).toBe(false);
      expect(container.querySelector('dialog')!.hasAttribute('open')).toBe(false);
    });
  });
});
