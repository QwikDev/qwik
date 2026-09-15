import {
  $,
  component$,
  Slot,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
  type Signal,
} from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;
const isResume = name === 'ssrRender';
const SVG_NS = 'http://www.w3.org/2000/svg';
const HTML_NS = 'http://www.w3.org/1999/xhtml';
/** Rendered text only: a resumed container also carries its state script. */
const visibleText = (container: Element) =>
  Array.from(container.childNodes, (node) =>
    node.nodeName === 'SCRIPT' || node.nodeType === 8 ? '' : (node.textContent ?? '')
  ).join('');

describe(`${name}: projection`, () => {
  it('renders basic projection over the slot fallback', async () => {
    const Child = component$(() => (
      <div>
        <Slot>misko</Slot>
      </div>
    ));
    const Parent = component$(() => (
      <Child>
        <b>parent-content</b>
      </Child>
    ));
    const { container, cleanup } = await render(Parent);
    expect(container.querySelector('div')!.innerHTML).toContain('<b>parent-content</b>');
    expect(container.textContent).not.toContain('misko');
    cleanup();
  });

  it('renders nothing for an unused projection', async () => {
    const Child = component$(() => <span>no-projection</span>);
    const Parent = component$(() => <Child>parent-content</Child>);
    const { container, cleanup } = await render(Parent);
    expect(visibleText(container)).toBe('no-projection');
    cleanup();
  });

  it('renders nested projection', async () => {
    const Child = component$(() => (
      <div>
        <Slot />
      </div>
    ));
    const Parent = component$(() => (
      <Child>
        before
        <Child>inner</Child>
        after
      </Child>
    ));
    const { container, cleanup } = await render(Parent);
    const outer = container.querySelector('div')!;
    expect(outer.textContent).toBe('beforeinnerafter');
    expect(outer.querySelector('div')!.textContent).toBe('inner');
    cleanup();
  });

  it('toggles a projection into a named slot with a separator character', async () => {
    const Child = component$(() => (
      <div>
        <Slot name="main-header" />
        <Slot />
      </div>
    ));
    const Parent = component$(() => {
      const toggle = useSignal(true);
      return (
        <>
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
          <Child>
            {toggle.value && <h1 q:slot="main-header">Title</h1>}
            body-content
          </Child>
        </>
      );
    });
    const { container, cleanup, qwikLoader } = await render(Parent);
    const div = () => container.querySelector('div')!;
    expect(div().querySelector('h1')?.textContent).toBe('Title');
    expect(div().textContent).toBe('Titlebody-content');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(div().querySelector('h1')).toBeFalsy();
    expect(div().textContent).toBe('body-content');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(div().querySelector('h1')?.textContent).toBe('Title');
    cleanup();
  });

  it('projects a projected slot through a named slot', async () => {
    const Child = component$(() => (
      <span>
        <Slot name="child" />
      </span>
    ));
    const Parent = component$(() => (
      <Child>
        <div q:slot="child">
          <Slot name="parent" />
        </div>
      </Child>
    ));
    const App = component$(() => (
      <Parent>
        <b q:slot="parent">parent</b>
      </Parent>
    ));
    const { container, cleanup } = await render(App);
    expect(container.querySelector('span > div > b')?.textContent).toBe('parent');
    cleanup();
  });

  it('projects default content through a named slot', async () => {
    const Child = component$(() => (
      <span>
        <Slot name="child">Default Child</Slot>
      </span>
    ));
    const Parent = component$(() => (
      <Child>
        <div q:slot="child">
          <Slot name="parent">Default parent</Slot>
        </div>
      </Child>
    ));
    const { container, cleanup } = await render(Parent);
    expect(container.querySelector('span > div')?.textContent).toBe('Default parent');
    cleanup();
  });

  it('renders a conditional projection', async () => {
    const Child = component$(() => {
      const show = useSignal(false);
      return <button onClick$={() => (show.value = true)}>{show.value && <Slot />}</button>;
    });
    const Parent = component$(() => <Child>parent-content</Child>);
    const { container, cleanup, qwikLoader } = await render(Parent);
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('parent-content');
    cleanup();
  });

  it('replaces projection content with undefined and back', async () => {
    const Test = component$(() => (
      <div id="slot">
        <Slot />
      </div>
    ));
    const Cmp = component$(() => {
      const test = useSignal<number | undefined>(1);
      return (
        <div>
          <Test>
            {test.value ? (
              <div>
                <h1>Hello from Qwik</h1>
              </div>
            ) : undefined}
          </Test>
          <button onClick$={() => (test.value = test.value ? undefined : 1)}></button>
        </div>
      );
    });
    const { container, cleanup, qwikLoader } = await render(Cmp);
    const slot = () => container.querySelector('#slot')!;
    const click = () => qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(slot().querySelector('h1')?.textContent).toBe('Hello from Qwik');
    await click();
    expect(slot().querySelector('h1')).toBeFalsy();
    await click();
    expect(slot().querySelector('h1')?.textContent).toBe('Hello from Qwik');
    await click();
    expect(slot().querySelector('h1')).toBeFalsy();
    cleanup();
  });

  it('runs cleanup functions inside a removed projection', async () => {
    const log: string[] = ((globalThis as any).__projectionLog = []);
    const Child = component$(() => <Slot />);
    const Cleanup = component$(() => {
      useTask$(() => {
        (globalThis as any).__projectionLog.push('task');
        return () => {
          (globalThis as any).__projectionLog.push('cleanup');
        };
      });
      return <div></div>;
    });
    const Parent = component$(() => {
      const show = useSignal(true);
      return (
        <>
          <button onClick$={() => (show.value = false)} />
          {show.value && (
            <Child>
              <Cleanup />
            </Child>
          )}
        </>
      );
    });
    const { container, cleanup, qwikLoader } = await render(Parent);
    expect(log).toEqual(isResume ? ['task', 'cleanup'] : ['task']);
    log.length = 0;
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(log).toEqual(isResume ? [] : ['cleanup']);
    cleanup();
  });

  it('toggles a slot inside a slot', async () => {
    const Button = component$(() => (
      <div>
        <Slot />
      </div>
    ));
    const Projector = component$((props: { state: any; id: string }) => (
      <div id={props.id}>
        <Button>
          {props.state.showButtons && (
            <span>
              <Slot />
            </span>
          )}
        </Button>
      </div>
    ));
    const Parent = component$(() => {
      const state = useStore({ showButtons: true });
      return (
        <div>
          <button onClick$={() => (state.showButtons = !state.showButtons)}>Toggle</button>
          <Projector state={state} id="btn1">
            <p>test</p>
            <span q:slot="ignore">IGNORE</span>
          </Projector>
        </div>
      );
    });
    const { container, cleanup, qwikLoader } = await render(Parent);
    const btn1 = () => container.querySelector('#btn1')!;
    expect(btn1().querySelector('span > p')?.textContent).toBe('test');
    expect(btn1().textContent).not.toContain('IGNORE');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(btn1().querySelector('p')).toBeFalsy();
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(btn1().querySelector('span > p')?.textContent).toBe('test');
    cleanup();
  });

  it('toggles a slot inside a slot with two different slots', async () => {
    const Button = component$(() => (
      <div role="button">
        <Slot />
      </div>
    ));
    const Projector = component$((props: { state: any }) => (
      <Button>
        <Slot name="start"></Slot>
        {!props.state.disableButtons && (
          <span>
            <Slot />
          </span>
        )}
      </Button>
    ));
    const SlotParent = component$(() => {
      const state = useStore({ disableButtons: false });
      return (
        <>
          <Projector state={state}>
            <>DEFAULT</>
          </Projector>
          <Projector state={state}>
            <span q:slot="start">START</span>
          </Projector>
          <button onClick$={() => (state.disableButtons = !state.disableButtons)}>Toggle</button>
        </>
      );
    });
    const { container, cleanup, qwikLoader } = await render(SlotParent);
    const texts = () =>
      Array.from(container.querySelectorAll('[role=button]'), (b) => b.textContent);
    expect(texts()).toEqual(['DEFAULT', 'START']);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(texts()).toEqual(['', 'START']);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(texts()).toEqual(['DEFAULT', 'START']);
    cleanup();
  });

  it('toggles named slots to nothing and back with a changed count', async () => {
    const Projector = component$((props: { state: any; id: string }) => (
      <div id={props.id}>
        <Slot name="start"></Slot>
        <Slot />
        <Slot name="end"></Slot>
      </div>
    ));
    const Parent = component$(() => {
      const state = useStore({ toggle: true, count: 0 });
      return (
        <>
          <Projector state={state} id="btn1">
            {state.toggle && <>DEFAULT {state.count}</>}
          </Projector>
          <Projector state={state} id="btn2">
            {state.toggle && <span q:slot="start">START {state.count}</span>}
            {state.toggle && <span q:slot="end">END {state.count}</span>}
          </Projector>
          <button id="toggle" onClick$={() => (state.toggle = !state.toggle)}></button>
          <button id="count" onClick$={() => state.count++}></button>
        </>
      );
    });
    const { container, cleanup, qwikLoader } = await render(Parent);
    const text = (id: string) => container.querySelector(id)!.textContent;
    const click = (id: string) => qwikLoader?.dispatch(container.querySelector(id)!, 'click');
    expect(text('#btn1')).toBe('DEFAULT 0');
    expect(text('#btn2')).toBe('START 0END 0');
    await click('#toggle');
    expect(text('#btn1')).toBe('');
    expect(text('#btn2')).toBe('');
    await click('#count');
    await click('#toggle');
    expect(text('#btn1')).toBe('DEFAULT 1');
    expect(text('#btn2')).toBe('START 1END 1');
    cleanup();
  });

  it('renders to a named slot through nested named slots', async () => {
    const NestedSlotCmp = component$(() => (
      <div>
        <Slot name="nested" />
      </div>
    ));
    const Projector = component$(() => (
      <NestedSlotCmp>
        <Slot q:slot="nested" name="start" />
      </NestedSlotCmp>
    ));
    const SlotParent = component$(() => (
      <Projector>
        <span q:slot="start">START</span>
      </Projector>
    ));
    const { container, cleanup } = await render(SlotParent);
    expect(container.querySelector('div > span')?.textContent).toBe('START');
    cleanup();
  });

  it('renders nested projections through several components', async () => {
    const CompTwo = component$(() => (
      <div>
        <Slot />
      </div>
    ));
    const CompThree = component$(() => (
      <div>
        <Slot />
      </div>
    ));
    const CompFour = component$(() => (
      <div>
        <Slot />
      </div>
    ));
    const CompOne = component$(() => (
      <CompTwo>
        <CompThree>
          <CompFour>
            <Slot />
          </CompFour>
        </CompThree>
      </CompTwo>
    ));
    const App = component$(() => <CompOne>Hey</CompOne>);
    const { container, cleanup } = await render(App);
    expect(container.querySelector('div > div > div')?.textContent).toBe('Hey');
    cleanup();
  });

  it('renders a fragment projected through two slot components', async () => {
    const Button = component$(() => <Slot />);
    const Thing = component$(() => <Slot />);
    const Projector = component$(() => (
      <Button>
        <span>
          <Slot />
        </span>
      </Button>
    ));
    const Parent = component$(() => (
      <Thing>
        <Projector>{<>INSIDE THING</>}</Projector>
      </Thing>
    ));
    const { container, cleanup } = await render(Parent);
    expect(container.querySelector('span')?.textContent).toBe('INSIDE THING');
    cleanup();
  });

  it('cleans up a removed projection and re-projects the replacement', async () => {
    const SomeCmp = component$((props: { toggle: boolean }) => <>{props.toggle && <Slot />}</>);
    const Cmp = component$(() => {
      const toggle = useSignal(true);
      return (
        <>
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
          <SomeCmp toggle={toggle.value}>
            {toggle.value && <h1>Title 1</h1>}
            {!toggle.value && <h1>Title 2</h1>}
          </SomeCmp>
        </>
      );
    });
    const { container, cleanup, qwikLoader } = await render(Cmp);
    const titles = () => Array.from(container.querySelectorAll('h1'), (h) => h.textContent);
    expect(titles()).toEqual(['Title 1']);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(titles()).toEqual([]);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(titles()).toEqual(['Title 1']);
    cleanup();
  });

  it('keeps the same projected component across differently structured slots', async () => {
    const Cmp1 = component$(() => (
      <>
        <h1>Test</h1>
        <p>Test content</p>
      </>
    ));
    const Cmp2 = component$((props: { toggle: boolean }) => (
      <>
        {props.toggle && <Slot />}
        {!props.toggle && (
          <>
            <Slot />
          </>
        )}
      </>
    ));
    const Parent = component$(() => {
      const toggle = useSignal(true);
      const handler = $(() => {
        toggle.value = !toggle.value;
      });
      return (
        <div>
          <button onClick$={handler}>toggle</button>
          <Cmp2 toggle={toggle.value}>
            <Cmp1 />
          </Cmp2>
        </div>
      );
    });
    const { container, cleanup, qwikLoader } = await render(Parent);
    const shape = () => Array.from(container.querySelector('div')!.children, (el) => el.tagName);
    expect(shape()).toEqual(['BUTTON', 'H1', 'P']);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(shape()).toEqual(['BUTTON', 'H1', 'P']);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(shape()).toEqual(['BUTTON', 'H1', 'P']);
    cleanup();
  });

  it('toggles content projection from undefined or null', async () => {
    const Wrapper = component$(() => <Slot />);
    const Cmp = component$(() => {
      const show = useSignal(false);
      return (
        <>
          <button onClick$={() => (show.value = !show.value)}>Click</button>
          <Wrapper>{show.value ? <div>Test</div> : undefined}</Wrapper>
          <Wrapper>{show.value ? <div>Test</div> : null}</Wrapper>
        </>
      );
    });
    const { container, cleanup, qwikLoader } = await render(Cmp);
    expect(container.querySelectorAll('div')).toHaveLength(0);
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(Array.from(container.querySelectorAll('div'), (d) => d.textContent)).toEqual([
      'Test',
      'Test',
    ]);
    cleanup();
  });

  it('toggles text content projected through a forwarding slot', async () => {
    const Parent = component$(() => <Slot />);
    const Cmp = component$(() => {
      const show = useSignal(false);
      return (
        <>
          <button onClick$={() => (show.value = !show.value)}></button>
          {show.value && (
            <Parent>
              <Slot />
            </Parent>
          )}
        </>
      );
    });
    const App = component$(() => <Cmp>content</Cmp>);
    const { container, cleanup, qwikLoader } = await render(App);
    expect(visibleText(container)).toBe('');
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect(visibleText(container)).toBe('content');
    cleanup();
  });

  describe('resolved projections', () => {
    const Child = component$<{ show: boolean }>((props) => {
      (globalThis as any).__log.push('render:Child');
      const show = useSignal(props.show);
      const handler = $(() => {
        (globalThis as any).__log.push('click:Child');
        show.value = !show.value;
      });
      return (
        <span class="child" onClick$={handler}>
          {show.value && <Slot />}
        </span>
      );
    });
    const Parent = component$<{ content: boolean; slot: boolean }>((props) => {
      (globalThis as any).__log.push('render:Parent');
      const show = useSignal(props.content);
      const handler = $(() => {
        (globalThis as any).__log.push('click:Parent');
        show.value = !show.value;
      });
      return (
        <div class="parent" onClick$={handler}>
          <Child show={props.slot}>{show.value && 'child-content'}</Child>
        </div>
      );
    });
    const wrap = (log: string[], result: Awaited<ReturnType<typeof render>>) => {
      const child = () => result.container.querySelector('.child')!;
      // The child click must not bubble to the parent toggle; v3 re-runs no render on a signal change.
      const click = (selector: string) =>
        result.qwikLoader?.dispatch(result.container.querySelector(selector)!, 'click', {
          bubbles: false,
        });
      log.length = 0;
      return { ...result, log, child, click };
    };

    it('works when the parent removes content', async () => {
      const Both = component$(() => <Parent content={true} slot={true} />);
      const { child, click, log, cleanup } = wrap(
        ((globalThis as any).__log = []),
        await render(Both)
      );
      expect(child().textContent).toBe('child-content');
      await click('.parent');
      expect(child().textContent).toBe('');
      expect(log).toEqual(['click:Parent']);
      cleanup();
    });

    it('works when the child removes the projection', async () => {
      const Both = component$(() => <Parent content={true} slot={true} />);
      const { child, click, log, cleanup } = wrap(
        ((globalThis as any).__log = []),
        await render(Both)
      );
      await click('.child');
      expect(log).toEqual(['click:Child']);
      expect(child().textContent).toBe('');
      log.length = 0;
      await click('.parent');
      expect(log).toEqual(['click:Parent']);
      expect(child().textContent).toBe('');
      log.length = 0;
      await click('.child');
      expect(log).toEqual(['click:Child']);
      expect(child().textContent).toBe('');
      log.length = 0;
      await click('.parent');
      expect(log).toEqual(['click:Parent']);
      expect(child().textContent).toBe('child-content');
      cleanup();
    });

    it('works when the parent adds content', async () => {
      const NoContent = component$(() => <Parent content={false} slot={true} />);
      const { child, click, log, cleanup } = wrap(
        ((globalThis as any).__log = []),
        await render(NoContent)
      );
      expect(child().textContent).toBe('');
      await click('.parent');
      expect(child().textContent).toBe('child-content');
      expect(log).toEqual(['click:Parent']);
      cleanup();
    });

    it('works when the child adds the projection', async () => {
      const NoSlot = component$(() => <Parent content={true} slot={false} />);
      const { child, click, log, cleanup } = wrap(
        ((globalThis as any).__log = []),
        await render(NoSlot)
      );
      expect(child().textContent).toBe('');
      await click('.child');
      expect(child().textContent).toBe('child-content');
      expect(log).toEqual(['click:Child']);
      cleanup();
    });

    it('renders projected dangerouslySetInnerHTML', async () => {
      const htmlString = '<strong>A variable here!</strong>';
      const Child = component$(() => (
        <div>
          <Slot name="content-1" />
          <Slot name="content-2" />
        </div>
      ));
      const Parent = component$(() => (
        <Child>
          <div id="first" q:slot="content-1" dangerouslySetInnerHTML={htmlString} />
          <div
            q:slot="content-2"
            id="second"
            dangerouslySetInnerHTML="<span>here my raw HTML</span>"
            class="after"
          />
        </Child>
      ));
      const { container, cleanup } = await render(Parent);
      expect(container.querySelector('#first')!.innerHTML).toBe(htmlString);
      expect(container.querySelector('#second')!.innerHTML).toBe('<span>here my raw HTML</span>');
      expect(container.querySelector('#second')!.getAttribute('class')).toBe('after');
      cleanup();
    });
  });

  describe('unclaimed projections', () => {
    it('adds and deletes projection content when the slot is initially hidden', async () => {
      const Cmp = component$(() => {
        const show = useSignal(false);
        return (
          <>
            <button onClick$={() => (show.value = !show.value)}></button>
            {show.value && <Slot />}
          </>
        );
      });
      const Parent = component$(() => (
        <Cmp>
          <span>Some content</span>
        </Cmp>
      ));
      const { container, cleanup, qwikLoader } = await render(Parent);
      const click = () => qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(container.querySelector('span')).toBeFalsy();
      await click();
      expect(container.querySelector('span')?.textContent).toBe('Some content');
      await click();
      expect(container.querySelector('span')).toBeFalsy();
      await click();
      expect(container.querySelector('span')?.textContent).toBe('Some content');
      cleanup();
    });

    it('renders the projection after a hidden child re-renders', async () => {
      const Child = component$((props: { counter: Signal<number> }) => (
        <>
          {props.counter.value > 1 && (
            <section>
              <Slot />
            </section>
          )}
        </>
      ));
      const Parent = component$(() => {
        const counter = useSignal(0);
        const innerCounter = useSignal(0);
        return (
          <div>
            <button id="counter" onClick$={() => counter.value++}>
              Increment
            </button>
            <Child counter={counter}>
              <span>
                <button id="inner-counter" onClick$={() => innerCounter.value++}>
                  Increment inner {innerCounter.value}
                </button>
              </span>
            </Child>
          </div>
        );
      });
      const { container, cleanup, qwikLoader } = await render(Parent);
      const click = (id: string) => qwikLoader?.dispatch(container.querySelector(id)!, 'click');
      expect(container.querySelector('section')).toBeFalsy();
      await click('#counter');
      await click('#counter');
      expect(container.querySelector('#inner-counter')?.textContent).toBe('Increment inner 0');
      await click('#inner-counter');
      await click('#inner-counter');
      expect(container.querySelector('#inner-counter')?.textContent).toBe('Increment inner 2');
      cleanup();
    });

    it('renders the projection after the child removes and restores the slot', async () => {
      const Child = component$(() => {
        const show = useSignal(true);
        return (
          <section>
            <button id="toggle-slot" onClick$={() => (show.value = !show.value)}>
              Toggle slot
            </button>
            {show.value && <Slot />}
          </section>
        );
      });
      const Parent = component$(() => {
        const counter = useSignal(0);
        return (
          <Child>
            <button id="projected-counter" onClick$={() => counter.value++}>
              Projected {counter.value}
            </button>
          </Child>
        );
      });
      const { container, cleanup, qwikLoader } = await render(Parent);
      const click = (id: string) => qwikLoader?.dispatch(container.querySelector(id)!, 'click');
      expect(container.querySelector('#projected-counter')?.textContent).toBe('Projected 0');
      await click('#toggle-slot');
      expect(container.querySelector('#projected-counter')).toBeFalsy();
      await click('#toggle-slot');
      await click('#projected-counter');
      await click('#projected-counter');
      expect(container.querySelector('#projected-counter')?.textContent).toBe('Projected 2');
      cleanup();
    });

    it('cleans up an unclaimed projection when the component is removed', async () => {
      const Child = component$(() => <span>child</span>);
      const Parent = component$(() => {
        const show = useSignal(true);
        return (
          <div>
            <button id="remove" onClick$={() => (show.value = false)}>
              Remove
            </button>
            {show.value && (
              <Child>
                <span>projected</span>
              </Child>
            )}
          </div>
        );
      });
      const { container, cleanup, qwikLoader } = await render(Parent);
      expect(container.querySelector('div')!.textContent).toBe('Removechild');
      await qwikLoader?.dispatch(container.querySelector('#remove')!, 'click');
      expect(container.querySelector('div')!.textContent).toBe('Remove');
      cleanup();
    });

    it('re-keys a component with an unclaimed projection', async () => {
      const Child = component$(() => {
        const show = useSignal(false);
        return (
          <>
            <button id="slot" onClick$={() => (show.value = !show.value)}></button>
            {show.value && <Slot />}
          </>
        );
      });
      const Parent = component$(() => {
        const reload = useSignal(0);
        return (
          <>
            <button id="reload" data-v={reload.value} onClick$={() => reload.value++}>
              Reload
            </button>
            <Child key={reload.value}>
              <span>Some content</span>
            </Child>
          </>
        );
      });
      const { container, cleanup, qwikLoader } = await render(Parent);
      const click = (id: string) => qwikLoader?.dispatch(container.querySelector(id)!, 'click');
      await click('#reload');
      expect(container.querySelector('#reload')!.getAttribute('data-v')).toBe('1');
      await click('#slot');
      expect(container.querySelector('span')?.textContent).toBe('Some content');
      cleanup();
    });

    it('re-keys a wrapper whose named projection is unclaimed', async () => {
      const ComponentA = component$(() => {
        const store = useStore({ show: false });
        return (
          <div>
            <button id="slot" onClick$={() => (store.show = !store.show)}>
              toggle slot 4
            </button>
            {store.show ? <Slot name="four" /> : null}
          </div>
        );
      });
      const Wrapper = component$<{ v: number }>(({ v }) => (
        <div class="parent-container">
          <ComponentA>
            <div q:slot="four">
              <h1>Inside slot 4 {v}</h1>
            </div>
          </ComponentA>
        </div>
      ));
      const Parent = component$(() => {
        const reload = useSignal(0);
        return (
          <>
            <button id="reload" data-v={reload.value} onClick$={() => reload.value++}>
              Reload
            </button>
            <Wrapper v={reload.value} key={reload.value} />
          </>
        );
      });
      const { container, cleanup, qwikLoader } = await render(Parent);
      const click = (id: string) => qwikLoader?.dispatch(container.querySelector(id)!, 'click');
      expect(container.querySelector('h1')).toBeFalsy();
      await click('#reload');
      await click('#slot');
      expect(container.querySelector('h1')?.textContent).toBe('Inside slot 4 1');
      cleanup();
    });

    it('does not loop when an ignored named projection is unclaimed', async () => {
      const Projector = component$(() => (
        <div>
          <Slot name="start"></Slot>
        </div>
      ));
      const SlotParent = component$(() => {
        const showContent = useSignal(true);
        return (
          <>
            <Projector>
              {showContent.value && <>DEFAULT</>}
              <span q:slot="ignore">IGNORE</span>
            </Projector>
            <Projector>
              {showContent.value && <>DEFAULT</>}
              <span q:slot="ignore">IGNORE</span>
            </Projector>
            <button onClick$={() => (showContent.value = !showContent.value)}></button>
          </>
        );
      });
      const { container, cleanup, qwikLoader } = await render(SlotParent);
      expect(visibleText(container)).toBe('');
      await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(visibleText(container)).toBe('');
      cleanup();
    });

    it('toggles text projected into an initially hidden slot', async () => {
      const Cmp = component$((props: { show: boolean }) => <span>{props.show && <Slot />}</span>);
      const Parent = component$(() => {
        const show = useSignal(false);
        return (
          <>
            <button onClick$={() => (show.value = !show.value)}></button>
            <Cmp show={show.value}>a</Cmp>
            <Cmp show={show.value}>b</Cmp>
          </>
        );
      });
      const { container, cleanup, qwikLoader } = await render(Parent);
      const spans = () => Array.from(container.querySelectorAll('span'), (s) => s.textContent);
      const click = () => qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(spans()).toEqual(['', '']);
      await click();
      expect(spans()).toEqual(['a', 'b']);
      await click();
      expect(spans()).toEqual(['', '']);
      await click();
      expect(spans()).toEqual(['a', 'b']);
      cleanup();
    });
  });

  describe('svg', () => {
    it('toggles svg children projected into an svg slot', async () => {
      const QwikSvgWithSlot = component$(() => (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <Slot />
        </svg>
      ));
      const Parent = component$(() => {
        const show = useSignal(true);
        return (
          <>
            <button onClick$={() => (show.value = !show.value)}></button>
            <QwikSvgWithSlot>{show.value && <path d="M1 1" />}</QwikSvgWithSlot>
          </>
        );
      });
      const { container, cleanup, qwikLoader } = await render(Parent);
      const click = () => qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(container.querySelector('svg')?.namespaceURI).toBe(SVG_NS);
      expect(container.querySelector('path')?.namespaceURI).toBe(SVG_NS);
      await click();
      expect(container.querySelector('path')).toBeFalsy();
      await click();
      expect(container.querySelector('path')?.namespaceURI).toBe(SVG_NS);
      cleanup();
    });
    it('toggles nested svg children projected into an svg slot', async () => {
      const QwikSvgWithSlot = component$(() => (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <Slot />
        </svg>
      ));
      const Parent = component$(() => {
        const show = useSignal(true);
        return (
          <>
            <button onClick$={() => (show.value = !show.value)}></button>
            <QwikSvgWithSlot>
              {show.value && (
                <filter id="blurMe">
                  <feGaussianBlur in="SourceGraphic" class="test" />
                </filter>
              )}
            </QwikSvgWithSlot>
          </>
        );
      });
      const { container, cleanup, qwikLoader } = await render(Parent);
      const click = () => qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(container.querySelector('filter')?.namespaceURI).toBe(SVG_NS);
      expect(container.querySelector('feGaussianBlur')?.namespaceURI).toBe(SVG_NS);
      await click();
      await click();
      expect(container.querySelector('filter')?.namespaceURI).toBe(SVG_NS);
      expect(container.querySelector('feGaussianBlur')?.namespaceURI).toBe(SVG_NS);
      cleanup();
    });
    it('toggles a slot inside svg and renders nested children with the right namespace', async () => {
      const Parent = component$(() => {
        const show = useSignal(false);
        return (
          <>
            <button onClick$={() => (show.value = !show.value)}></button>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              {show.value && <Slot />}
            </svg>
          </>
        );
      });
      const App = component$(() => (
        <Parent>
          <filter id="blurMe">
            <feGaussianBlur in="SourceGraphic" class="test" />
            <foreignObject>
              <div id="inner-div">
                test
                <svg id="inner-svg" xmlns="http://www.w3.org/2000/svg">
                  <path></path>
                </svg>
              </div>
            </foreignObject>
          </filter>
        </Parent>
      ));
      const { container, cleanup, qwikLoader } = await render(App);
      expect(container.querySelector('filter')).toBeFalsy();
      await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(container.querySelector('filter')?.namespaceURI).toBe(SVG_NS);
      expect(container.querySelector('feGaussianBlur')?.namespaceURI).toBe(SVG_NS);
      expect(container.querySelector('foreignObject')?.namespaceURI).toBe(SVG_NS);
      expect(container.querySelector('#inner-div')?.namespaceURI).toBe(HTML_NS);
      expect(container.querySelector('#inner-svg')?.namespaceURI).toBe(SVG_NS);
      expect(container.querySelector('path')?.namespaceURI).toBe(SVG_NS);
      cleanup();
    });

    it('toggles html projected into a foreignObject slot', async () => {
      const QwikSvgWithSlot = component$(() => (
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <foreignObject>
            <Slot />
          </foreignObject>
        </svg>
      ));
      const Parent = component$(() => {
        const show = useSignal(true);
        return (
          <>
            <button onClick$={() => (show.value = !show.value)}></button>
            <QwikSvgWithSlot>{show.value && <div></div>}</QwikSvgWithSlot>
          </>
        );
      });
      const { container, cleanup, qwikLoader } = await render(Parent);
      const click = () => qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(container.querySelector('foreignObject')?.namespaceURI).toBe(SVG_NS);
      expect(container.querySelector('div')?.namespaceURI).toBe(HTML_NS);
      await click();
      await click();
      expect(container.querySelector('foreignObject')?.namespaceURI).toBe(SVG_NS);
      expect(container.querySelector('div')?.namespaceURI).toBe(HTML_NS);
      cleanup();
    });
  });

  it('locates the slot parent in a detached subtree', async () => {
    const Projector = component$(() => <Slot />);
    const Child = component$((props: { state: any }) => (
      <>{!props.state.disableNested && <Slot />}</>
    ));
    const Parent = component$(() => {
      const state = useStore({ count: 0, disableNested: false });
      return (
        <>
          <Child state={state}>
            <Projector>
              {state.count}
              {state.count}
            </Projector>
          </Child>
          <button id="toggle" onClick$={() => (state.disableNested = !state.disableNested)}>
            Toggle
          </button>
          <button id="count" onClick$={() => state.count++}>
            Count
          </button>
        </>
      );
    });
    const { container, cleanup, qwikLoader } = await render(Parent);
    const click = (id: string) => qwikLoader?.dispatch(container.querySelector(id)!, 'click');
    expect(visibleText(container)).toBe('00ToggleCount');
    await click('#toggle');
    expect(visibleText(container)).toBe('ToggleCount');
    await click('#count');
    await click('#toggle');
    expect(visibleText(container)).toBe('11ToggleCount');
    cleanup();
  });

  describe('regression', () => {
    it('#1630 toggles a default slot after a static named slot', async () => {
      const Child = component$(() => <b>CHILD</b>);
      const Issue1630 = component$(() => {
        const store = useStore({ open: true });
        return (
          <div>
            <button onClick$={() => (store.open = !store.open)}></button>
            <Slot name="static" />
            {store.open && <Slot />}
          </div>
        );
      });
      const App = component$(() => (
        <Issue1630>
          <Child />
          <p q:slot="static"></p>
          DYNAMIC
        </Issue1630>
      ));
      const { container, cleanup, qwikLoader } = await render(App);
      const click = () => qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      const text = () => container.querySelector('div')!.textContent;
      expect(text()).toBe('CHILDDYNAMIC');
      await click();
      expect(text()).toBe('');
      await click();
      expect(text()).toBe('CHILDDYNAMIC');
      cleanup();
    });

    it('#1630 case 2 keeps a component projected into the static slot', async () => {
      const Child = component$(() => (
        <b>
          <Slot />
        </b>
      ));
      const Issue1630 = component$(() => {
        const store = useStore({ open: true });
        const handler = $(() => {
          store.open = !store.open;
        });
        return (
          <div>
            <button onClick$={handler}></button>
            <Slot name="static" />
            {store.open && <Slot />}
          </div>
        );
      });
      const App = component$(() => (
        <Issue1630>
          <Child q:slot="static">CHILD</Child>
          <p q:slot="static"></p>
          DYNAMIC
        </Issue1630>
      ));
      const { container, cleanup, qwikLoader } = await render(App);
      const click = () => qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      const text = () => container.querySelector('div')!.textContent;
      expect(text()).toBe('CHILDDYNAMIC');
      await click();
      expect(text()).toBe('CHILD');
      await click();
      expect(text()).toBe('CHILDDYNAMIC');
      cleanup();
    });

    it('#2688 switches a dynamic slot name and keeps the projected signal live', async () => {
      const Switch = component$((props: { name: string }) => <Slot name={props.name} />);
      const Issue2688 = component$<{ count: number }>((props) => {
        const store = useStore({ flip: false });
        const count = useSignal(props.count);
        return (
          <>
            <button id="flip" onClick$={() => (store.flip = !store.flip)}></button>
            <button id="counter" onClick$={() => count.value++}></button>
            <div>
              <Switch name={store.flip ? 'b' : 'a'}>
                <div q:slot="a">Alpha {count.value}</div>
                <div q:slot="b">Bravo {count.value}</div>
              </Switch>
            </div>
          </>
        );
      });
      const App = component$(() => (
        <section>
          <Issue2688 count={123} />
        </section>
      ));
      const { container, cleanup, qwikLoader } = await render(App);
      const click = (id: string) => qwikLoader?.dispatch(container.querySelector(id)!, 'click');
      expect(container.querySelector('div')!.textContent).toBe('Alpha 123');
      await click('#flip');
      await click('#counter');
      expect(container.querySelector('div')!.textContent).toBe('Bravo 124');
      cleanup();
    });

    it('#2688 case 2 keeps a projected prop live across a slot switch', async () => {
      const Switch = component$((props: { name: string }) => <Slot name={props.name} />);
      const Issue2688 = component$(({ count }: { count: number }) => {
        const store = useStore({ flip: false });
        return (
          <>
            <button id="flip" onClick$={() => (store.flip = !store.flip)}></button>
            <Switch name={store.flip ? 'b' : 'a'}>
              <div q:slot="a">Alpha {count}</div>
              <div q:slot="b">Bravo {count}</div>
            </Switch>
          </>
        );
      });
      const Parent = component$(() => {
        const state = useStore({ count: 0 });
        return (
          <div>
            <Issue2688 count={state.count} />
            <button id="counter" onClick$={() => state.count++}></button>
          </div>
        );
      });
      const { container, cleanup, qwikLoader } = await render(Parent);
      const click = (id: string) => qwikLoader?.dispatch(container.querySelector(id)!, 'click');
      expect(container.querySelector('div')!.textContent).toBe('Alpha 0');
      await click('#flip');
      await click('#counter');
      expect(container.querySelector('div')!.textContent).toBe('Bravo 1');
      cleanup();
    });

    it('#4283 projects through a component that reveals after a visible task', async () => {
      const HideUntilVisible = component$(() => {
        const isNotVisible = useSignal(true);
        useVisibleTask$(
          () => {
            if (isNotVisible.value) {
              isNotVisible.value = false;
            }
          },
          { strategy: 'document-ready' }
        );
        return (
          <>
            {isNotVisible.value ? (
              <div></div>
            ) : (
              <div>
                <p>Hide until visible</p>
                <Slot />
              </div>
            )}
          </>
        );
      });
      const Issue4283 = component$(() => (
        <HideUntilVisible>
          <p>Content</p>
          <Slot />
        </HideUntilVisible>
      ));
      const App = component$(() => (
        <Issue4283>
          <p>index page</p>
        </Issue4283>
      ));
      const { container, cleanup, qwikLoader, flush } = await render(App);
      await qwikLoader?.dispatch(container.querySelector('div')!, 'qinit');
      await flush();
      expect(Array.from(container.querySelectorAll('p'), (p) => p.textContent)).toEqual([
        'Hide until visible',
        'Content',
        'index page',
      ]);
      cleanup();
    });

    it('#4283 case 2 removes the revealed projection tree', async () => {
      const HideUntilVisible = component$(() => {
        const isNotVisible = useSignal(true);
        useVisibleTask$(
          () => {
            if (isNotVisible.value) {
              isNotVisible.value = false;
            }
          },
          { strategy: 'document-ready' }
        );
        return (
          <>
            {isNotVisible.value ? (
              <div></div>
            ) : (
              <div>
                <p>Hide until visible</p>
                <Slot />
              </div>
            )}
          </>
        );
      });
      const Issue4283 = component$(() => (
        <HideUntilVisible>
          <p>Content</p>
          <Slot />
        </HideUntilVisible>
      ));
      const SlotParent = component$(() => {
        const show = useSignal(true);
        return (
          <>
            {show.value && (
              <>
                <Issue4283>
                  <p>index page</p>
                </Issue4283>
                <button onClick$={() => (show.value = !show.value)}></button>
              </>
            )}
          </>
        );
      });
      const { container, cleanup, qwikLoader, flush } = await render(SlotParent);
      await qwikLoader?.dispatch(container.querySelector('div')!, 'qinit');
      await flush();
      expect(container.querySelectorAll('p')).toHaveLength(3);
      await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(container.querySelectorAll('p')).toHaveLength(0);
      expect(container.querySelector('button')).toBeFalsy();
      cleanup();
    });

    it('#6900 does not run work for a removed projected component', async () => {
      const Root = component$(() => <Slot />);
      const Image = component$<{ src: string }>(({ src }) => <>{src}</>);
      const Issue6900 = component$(() => {
        const signal = useSignal<null | { url: string }>({ url: 'https://picsum.photos/200' });
        return (
          <>
            {!signal.value ? (
              <p>User is not signed in</p>
            ) : (
              <div>
                <button onClick$={() => (signal.value = null)}>Sign out</button>
                <Root>
                  <Image src={signal.value.url} />
                </Root>
              </div>
            )}
          </>
        );
      });
      const { container, cleanup, qwikLoader } = await render(Issue6900);
      expect(container.querySelector('div')!.textContent).toBe('Sign outhttps://picsum.photos/200');
      await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(visibleText(container)).toBe('User is not signed in');
      cleanup();
    });
  });
});
