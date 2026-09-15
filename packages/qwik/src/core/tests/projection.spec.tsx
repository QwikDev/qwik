import { $, component$, Slot, useSignal, useStore, useTask$ } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;
const isResume = name === 'ssrRender';
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
});
