import {
  component$,
  type PropsOf,
  useSignal,
  $,
  createContextId,
  Slot,
  useComputed$,
  useContext,
  useContextProvider,
  useStore,
  type ComputedSignal,
  type Signal as SignalType,
} from '@qwik.dev/core';
import { describe, expect, it, onTestFinished } from 'vitest';
import { testRenderer } from '../test-utils';
import { triggerAll } from './test-hooks';
import { trigger } from '@qwik.dev/core/testing';

const { name, render } = testRenderer;

describe(`${name}: attributes`, () => {
  it('serializes boolean, enumerated and numeric attributes consistently', async () => {
    const App = component$(() => {
      const enabled = useSignal(false);
      return (
        <input
          type="button"
          required={enabled.value}
          aria-hidden={enabled.value}
          draggable={enabled.value}
          spellcheck={enabled.value}
          tabIndex={-1}
          onClick$={() => (enabled.value = !enabled.value)}
        />
      );
    });
    const { container, qwikLoader, cleanup } = await render(App);
    const button = container.querySelector('input')!;

    expect(button.hasAttribute('required')).toBe(false);
    expect(button.getAttribute('aria-hidden')).toBe('false');
    expect(button.getAttribute('draggable')).toBe('false');
    expect(button.getAttribute('spellcheck')).toBe('false');
    expect(button.getAttribute('tabindex')).toBe('-1');

    await qwikLoader?.dispatch(button, 'click');
    expect(button.hasAttribute('required')).toBe(true);
    expect(button.getAttribute('aria-hidden')).toBe('true');
    expect(button.getAttribute('draggable')).toBe('true');
    expect(button.getAttribute('spellcheck')).toBe('true');
    cleanup();
  });

  it('updates class arrays and objects without losing static classes', async () => {
    const App = component$(() => {
      const active = useSignal(true);
      return (
        <button
          class={['base', { active: active.value, disabled: !active.value }]}
          onClick$={() => (active.value = !active.value)}
        />
      );
    });
    const { container, qwikLoader, cleanup } = await render(App);
    const button = container.querySelector('button')!;

    expect(button.className).toBe('base active');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.className).toBe('base disabled');
    cleanup();
  });

  it('preserves ordered spread last-write-wins semantics', async () => {
    const Child = component$((props: PropsOf<'div'>) => {
      const attrs: Record<string, unknown> = { class: 'last', 'data-order': 'spread' };
      const forwarded = props as unknown as Record<string, unknown>;
      return <div {...forwarded} class="middle" {...attrs} />;
    });
    const App = component$(() => <Child class="first" data-order="component" />);
    const { container, cleanup } = await render(App);

    expect(container.querySelector('div')?.className).toBe('last');
    expect(container.querySelector('div')?.getAttribute('data-order')).toBe('spread');
    cleanup();
  });

  it('removes keys that disappear from a reactive spread', async () => {
    const App = component$(() => {
      const attrs = useSignal<Record<string, string>>({ 'data-a': '1', title: 'first' });
      return <div {...attrs.value} onClick$={() => (attrs.value = { title: 'second' })} />;
    });
    const { container, cleanup, qwikLoader } = await render(App);
    const div = container.querySelector('div')!;
    expect(div.getAttribute('data-a')).toBe('1');

    await qwikLoader?.dispatch(div, 'click');

    expect(div.hasAttribute('data-a')).toBe(false);
    expect(div.getAttribute('title')).toBe('second');
    cleanup();
  });

  it('sets value and checked through native properties', async () => {
    const App = component$(() => {
      const text = useSignal('one');
      const on = useSignal(false);
      return (
        <form>
          <input value={text.value} checked={on.value} type="checkbox" />
          <button onClick$={() => ((text.value = 'two'), (on.value = true))} />
        </form>
      );
    });
    const { container, qwikLoader, cleanup } = await render(App);
    const input = container.querySelector('input')!;
    expect([input.value, input.checked]).toEqual(['one', false]);

    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect([input.value, input.checked]).toEqual(['two', true]);
    cleanup();
  });

  it('renders textarea and select values as content and selection', async () => {
    const App = component$(() => {
      const text = useSignal('one');
      return (
        <form>
          <textarea value={text.value} />
          <textarea value="fixed" />
          <select value={text.value}>
            <option value="one">one</option>
            <option value="two">two</option>
          </select>
          <select value="two">
            <option value="one">one</option>
            <option value="two">two</option>
          </select>
          <button onClick$={() => (text.value = 'two')} />
        </form>
      );
    });
    const { container, qwikLoader, cleanup } = await render(App);
    const [live, fixed] = Array.from(container.querySelectorAll('textarea'));
    const [liveSelect, fixedSelect] = Array.from(container.querySelectorAll('select'));
    const selected = (select: HTMLSelectElement) =>
      Array.from(select.querySelectorAll('option')).map((option) =>
        option.hasAttribute('selected')
      );
    expect([live.value, fixed.value]).toEqual(['one', 'fixed']);
    expect([selected(liveSelect), selected(fixedSelect)]).toEqual([
      [true, false],
      [false, true],
    ]);

    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(live.value).toBe('two');
    cleanup();
  });

  it('binds checked and value through native properties', async () => {
    const App = component$(() => {
      const checked = useSignal(false);
      const value = useSignal('one');
      return (
        <section>
          <input type="checkbox" bind:checked={checked} />
          <textarea bind:value={value} />
          <output>{checked.value + ':' + value.value}</output>
        </section>
      );
    });
    const { container, qwikLoader, cleanup } = await render(App);
    const input = container.querySelector('input')!;
    const textarea = container.querySelector('textarea')!;

    input.checked = true;
    textarea.value = 'two';
    await qwikLoader?.dispatch(input, 'input');
    await qwikLoader?.dispatch(textarea, 'input');
    expect(container.querySelector('output')?.textContent).toBe('true:two');
    expect(input.checked).toBe(true);
    expect(textarea.value).toBe('two');
    cleanup();
  });

  it('keeps the innerHTML subtree when an unrelated prop changes', async () => {
    const App = component$(() => {
      const clicks = useSignal(0);
      return (
        <div
          {...{ 'data-clicks': String(clicks.value) }}
          dangerouslySetInnerHTML="<span>raw</span>"
          onClick$={() => clicks.value++}
        />
      );
    });
    const { container, cleanup, flush, qwikLoader } = await render(App);
    const host = container.querySelector('div')!;
    await qwikLoader?.dispatch(host, 'click');
    await flush();
    const child = host.firstChild;

    await qwikLoader?.dispatch(host, 'click');
    await flush();

    expect(host.getAttribute('data-clicks')).toBe('2');
    expect(host.firstChild).toBe(child);
    cleanup();
  });

  it('uses innerHTML without runtime JSX normalization', async () => {
    const App = component$(() => <div dangerouslySetInnerHTML="<span>raw</span>" />);
    const { container, cleanup } = await render(App);

    expect(container.querySelector('div')?.innerHTML).toBe('<span>raw</span>');
    cleanup();
  });
});

const debug = false;

describe(`${name}: attributes`, () => {
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

    const { container, cleanup, flush } = await render(AttrComp, { debug });
    onTestFinished(cleanup);

    await expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input');
    expect(container.querySelector('input')!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('input')!.getAttribute('aria-required')).toBe('false');
    expect(container.querySelector('input')!.getAttribute('draggable')).toBe('false');
    expect(container.querySelector('input')!.getAttribute('spellcheck')).toBe('false');
    expect(container.querySelector('input')!.getAttribute('tabindex')).toBe(String(-1));
    expect(container.querySelector('input')!.getAttribute('required')).toBe(null);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('req');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input');
    expect(container.querySelector('input')!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('input')!.getAttribute('aria-required')).toBe('false');
    expect(container.querySelector('input')!.getAttribute('draggable')).toBe('false');
    expect(container.querySelector('input')!.getAttribute('spellcheck')).toBe('false');
    expect(container.querySelector('input')!.getAttribute('tabindex')).toBe(String(-1));
    expect(container.querySelector('input')!.getAttribute('required')).toBe(null);

    await trigger(container, '#req', 'click');
    await flush();

    await expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input');
    expect(container.querySelector('input')!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('input')!.getAttribute('aria-required')).toBe('false');
    expect(container.querySelector('input')!.getAttribute('draggable')).toBe('true');
    expect(container.querySelector('input')!.getAttribute('spellcheck')).toBe('true');
    expect(container.querySelector('input')!.getAttribute('tabindex')).toBe(String(-1));
    expect(container.querySelector('input')!.getAttribute('required')).toBe('');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('req');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input');
    expect(container.querySelector('input')!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('input')!.getAttribute('aria-required')).toBe('false');
    expect(container.querySelector('input')!.getAttribute('draggable')).toBe('true');
    expect(container.querySelector('input')!.getAttribute('spellcheck')).toBe('true');
    expect(container.querySelector('input')!.getAttribute('tabindex')).toBe(String(-1));
    expect(container.querySelector('input')!.getAttribute('required')).toBe('');

    await trigger(container, '#req', 'click');
    await flush();

    await expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input');
    expect(container.querySelector('input')!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('input')!.getAttribute('aria-required')).toBe('false');
    expect(container.querySelector('input')!.getAttribute('draggable')).toBe('false');
    expect(container.querySelector('input')!.getAttribute('spellcheck')).toBe('false');
    expect(container.querySelector('input')!.getAttribute('tabindex')).toBe(String(-1));
    expect(container.querySelector('input')!.getAttribute('required')).toBe(null);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('req');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input');
    expect(container.querySelector('input')!.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('input')!.getAttribute('aria-required')).toBe('false');
    expect(container.querySelector('input')!.getAttribute('draggable')).toBe('false');
    expect(container.querySelector('input')!.getAttribute('spellcheck')).toBe('false');
    expect(container.querySelector('input')!.getAttribute('tabindex')).toBe(String(-1));
    expect(container.querySelector('input')!.getAttribute('required')).toBe(null);
  });

  describe('binding', () => {
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

      const { container, cleanup, flush } = await render(BindCmp, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('label')).toHaveLength(1);
      expect(container.querySelector('label')!.textContent).toBe('Show conditional');
      expect(container.querySelector('label')!.getAttribute('for')).toBe('toggle');
      expect(container.querySelectorAll('input')).toHaveLength(1);
      expect(container.querySelector('input')!.textContent).toBe('');
      expect(container.querySelector('input')!.getAttribute('type')).toBe('checkbox');
      expect((container.querySelector('input')! as HTMLInputElement).checked).toBe(false);
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('false');

      // simulate checkbox click
      const input = container.querySelector('input')!;
      input.checked = true;
      await triggerAll(container, 'input', 'input');
      await flush();

      expect(container.querySelectorAll('label')).toHaveLength(1);
      expect(container.querySelector('label')!.textContent).toBe('Show conditional');
      expect(container.querySelector('label')!.getAttribute('for')).toBe('toggle');
      expect(container.querySelectorAll('input')).toHaveLength(1);
      expect(container.querySelector('input')!.textContent).toBe('');
      expect(container.querySelector('input')!.getAttribute('type')).toBe('checkbox');
      expect((container.querySelector('input')! as HTMLInputElement).checked).toBe(true);
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('true');
    });
  });

  it('should render preventdefault attribute', async () => {
    const Cmp = component$(() => {
      const show = useSignal(false);
      return (
        <>
          <button onClick$={() => (show.value = !show.value)}></button>
          <span preventdefault:click></span>
          {show.value && <div preventdefault:click></div>}
        </>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('');
    expect(container.querySelector('span')!.getAttribute('preventdefault:click')).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(0);
    await expect(container.querySelector('span')!.textContent).toBe('');
    expect(container.querySelector('span')!.getAttribute('preventdefault:click')).toBe('');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('');
    expect(container.querySelector('span')!.getAttribute('preventdefault:click')).toBe('');
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelector('div')!.getAttribute('preventdefault:click')).toBe('');

    await expect(container.querySelector('span')!.textContent).toBe('');
    expect(container.querySelector('span')!.getAttribute('preventdefault:click')).toBe('');

    await expect(container.querySelector('div')!.textContent).toBe('');
    expect(container.querySelector('div')!.getAttribute('preventdefault:click')).toBe('');
  });

  it('should update var prop attribute', async () => {
    const Cmp = component$(() => {
      const counter = useSignal(0);
      const props = useComputed$(() => ({ 'data-bar': counter.value }));
      return (
        <button data-foo={counter.value} {...props.value} onClick$={() => counter.value++}></button>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('data-foo')).toBe('0');
    expect(container.querySelector('button')!.getAttribute('data-bar')).toBe('0');
    await triggerAll(container, 'button', 'click');
    await flush();
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('data-foo')).toBe('2');
    expect(container.querySelector('button')!.getAttribute('data-bar')).toBe('2');
  });

  it('should add and remove attribute', async () => {
    const Cmp = component$(() => {
      const hide = useSignal(false);
      const required = useSignal(true);
      return (
        <>
          <button
            onClick$={() => {
              hide.value = !hide.value;
            }}
          ></button>
          <span onClick$={() => (required.value = !required.value)}></span>
          {hide.value ? <input id="input" /> : <input id="input" attr-test={required.value} />}
        </>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input');
    expect(container.querySelector('input')!.getAttribute('attr-test')).toBe('');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input');
    expect(container.querySelector('input')!.hasAttribute('attr-test')).toBe(false);

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input');
    expect(container.querySelector('input')!.getAttribute('attr-test')).toBe('');

    await triggerAll(container, 'span', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('');
    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('id')).toBe('input');
    expect(container.querySelector('input')!.hasAttribute('attr-test')).toBe(false);
  });

  it('should update signal-based var prop', async () => {
    const PasswordInput = component$<PropsOf<'input'>>((props) => {
      const showPassword = useSignal<boolean>(false);
      const inputType = useComputed$(() => (showPassword.value ? 'text' : 'password'));
      return (
        <>
          <input type={inputType.value} {...props} />
          <button
            onClick$={() => {
              showPassword.value = !showPassword.value;
            }}
          ></button>
        </>
      );
    });

    const { container, cleanup, flush } = await render(PasswordInput, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('type')).toBe('password');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('input')).toHaveLength(1);
    expect(container.querySelector('input')!.textContent).toBe('');
    expect(container.querySelector('input')!.getAttribute('type')).toBe('text');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
  });

  it('should add and remove var props on destination vnode', async () => {
    const Tab = component$((props: any) => {
      return <button {...props} onClick$={() => props.onClick$()}></button>;
    });

    const Wrapper = component$(() => {
      const selected = useSignal(0);
      return (
        <>
          <Tab
            data-selected={selected.value === 0}
            id="button-0"
            onClick$={() => (selected.value = 0)}
          />
          <Tab
            data-selected={selected.value === 1}
            id="button-1"
            onClick$={() => (selected.value = 1)}
          />
        </>
      );
    });

    const { container, cleanup, flush } = await render(Wrapper, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('data-selected')).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('button-0');
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('button')[1]!.getAttribute('data-selected')).toBe(null);
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('button-1');

    await trigger(container, 'button[id=button-1]', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('data-selected')).toBe(null);
    expect(container.querySelector('button')!.getAttribute('id')).toBe('button-0');
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('button')[1]!.getAttribute('data-selected')).toBe('');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('button-1');
  });

  it('should render array of classes from rest props', async () => {
    const ctxId = createContextId<any>('abcd');
    const TabCmp = component$<any>(({ tabId, ...props }) => {
      const ctxObj = useContext(ctxId);

      const computedClass = useComputed$(() => {
        return ctxObj.selected.value === Number(tabId) ? 'selected' : '';
      });

      return (
        <button
          id={tabId}
          onClick$={() => ctxObj.onSelect$(tabId)}
          class={[props.class, computedClass.value]}
        >
          <Slot />
        </button>
      );
    });

    const ParentComponent = component$(() => {
      const selected = useSignal(0);
      const ctxObj = {
        selected,
        onSelect$: $((tabId: number) => {
          selected.value = Number(tabId);
        }),
      };
      useContextProvider(ctxId, ctxObj);
      return (
        <>
          {selected.value}
          <TabCmp tabId={0} class={selected.value === 0 ? 'custom' : ''}>
            TAB 1
          </TabCmp>
          <TabCmp tabId={1} class={selected.value === 1 ? 'custom' : ''}>
            TAB 2
          </TabCmp>
        </>
      );
    });

    const { container, cleanup, flush } = await render(ParentComponent, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('TAB 1');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('0');
    expect(container.querySelector('button')!.getAttribute('class')?.trim() ?? '').toBe(
      'custom selected'
    );
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('TAB 2');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('1');
    expect(container.querySelectorAll('button')[1]!.getAttribute('class')?.trim() ?? '').toBe('');

    await trigger(container, 'button[id=1]', 'click');
    await flush();

    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('TAB 1');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('0');
    expect(container.querySelector('button')!.getAttribute('class')?.trim() ?? '').toBe('');
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('TAB 2');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('1');
    expect(container.querySelectorAll('button')[1]!.getAttribute('class')?.trim() ?? '').toBe(
      'custom selected'
    );
  });

  describe('spread props', () => {
    describe('class attribute from component props', () => {
      it('should use class attribute from element', async () => {
        const Cmp = component$((props: PropsOf<'div'>) => {
          return <div {...props} class={[props.class, 'component']} />;
        });

        const Parent = component$(() => {
          return <Cmp class="test" />;
        });

        const { container, cleanup } = await render(Parent, { debug });
        onTestFinished(cleanup);
        expect(container.querySelectorAll('div')).toHaveLength(1);
        expect(container.querySelector('div')!.textContent).toBe('');
        expect(container.querySelector('div')!.getAttribute('class')?.trim() ?? '').toBe(
          'test component'
        );
      });

      it('should use class attribute from props', async () => {
        const Cmp = component$((props: PropsOf<'div'>) => {
          return <div class={[props.class, 'component']} {...props} />;
        });

        const Parent = component$(() => {
          return <Cmp class="test" />;
        });

        const { container, cleanup } = await render(Parent, { debug });
        onTestFinished(cleanup);
        expect(container.querySelectorAll('div')).toHaveLength(1);
        expect(container.querySelector('div')!.textContent).toBe('');
        expect(container.querySelector('div')!.getAttribute('class')?.trim() ?? '').toBe('test');
      });
    });

    describe('class attribute without component props', () => {
      it('should use class attribute from props', async () => {
        const Cmp = component$((props: PropsOf<'div'>) => {
          return <div class="test component" {...props} />;
        });

        const Parent = component$(() => {
          return <Cmp class="test" />;
        });

        const { container, cleanup } = await render(Parent, { debug });
        onTestFinished(cleanup);
        expect(container.querySelectorAll('div')).toHaveLength(1);
        expect(container.querySelector('div')!.textContent).toBe('');
        expect(container.querySelector('div')!.getAttribute('class')?.trim() ?? '').toBe('test');
      });

      it('should use class attribute from element', async () => {
        const Cmp = component$((props: PropsOf<'div'>) => {
          return <div {...props} class="test component" />;
        });

        const Parent = component$(() => {
          return <Cmp class="test" />;
        });

        const { container, cleanup } = await render(Parent, { debug });
        onTestFinished(cleanup);
        expect(container.querySelectorAll('div')).toHaveLength(1);
        expect(container.querySelector('div')!.textContent).toBe('');
        expect(container.querySelector('div')!.getAttribute('class')?.trim() ?? '').toBe(
          'test component'
        );
      });
    });

    it('should handle multiple spread component props', async () => {
      const Cmp = component$((props: PropsOf<'div'>) => {
        return <div {...props} class="test component" {...props} />;
      });

      const Parent = component$(() => {
        return <Cmp class="test" />;
      });

      const { container, cleanup } = await render(Parent, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('');
      expect(container.querySelector('div')!.getAttribute('class')?.trim() ?? '').toBe('test');
    });

    it('should handle multiple spread component and element props', async () => {
      const Cmp = component$((props: PropsOf<'div'>) => {
        const attrs: Record<string, any> = {
          class: 'test2',
        };
        return <div {...props} class="test component" {...attrs} />;
      });

      const Parent = component$(() => {
        return <Cmp class="test" />;
      });

      const { container, cleanup } = await render(Parent, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('');
      expect(container.querySelector('div')!.getAttribute('class')?.trim() ?? '').toBe('test2');
    });

    it('should handle multiple spread element and component props', async () => {
      const Cmp = component$((props: PropsOf<'div'>) => {
        const attrs: Record<string, any> = {
          class: 'test2',
        };
        return <div {...attrs} class="test component" {...props} />;
      });

      const Parent = component$(() => {
        return <Cmp class="test" />;
      });

      const { container, cleanup } = await render(Parent, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('');
      expect(container.querySelector('div')!.getAttribute('class')?.trim() ?? '').toBe('test');
    });

    it('should handle multiple spread element and component props before normal props', async () => {
      const Cmp = component$((props: PropsOf<'div'>) => {
        const attrs: Record<string, any> = {
          class: 'test2',
        };
        return <div {...attrs} {...props} class="test component" />;
      });

      const Parent = component$(() => {
        return <Cmp class="test" />;
      });

      const { container, cleanup } = await render(Parent, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('');
      expect(container.querySelector('div')!.getAttribute('class')?.trim() ?? '').toBe(
        'test component'
      );
    });

    it('should handle multiple spread element and component props after normal props', async () => {
      const Cmp = component$((props: PropsOf<'div'>) => {
        const attrs: Record<string, any> = {
          class: 'test2',
        };
        return <div class="test component" {...props} {...attrs} />;
      });

      const Parent = component$(() => {
        return <Cmp class="test" />;
      });

      const { container, cleanup } = await render(Parent, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('');
      expect(container.querySelector('div')!.getAttribute('class')?.trim() ?? '').toBe('test2');
    });
  });

  describe('class attribute', () => {
    it('should render class attribute', async () => {
      const Cmp = component$(() => {
        return <span class="test-class"></span>;
      });

      const { container, cleanup } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('span')).toHaveLength(1);
      expect(container.querySelector('span')!.textContent).toBe('');
      expect(container.querySelector('span')!.getAttribute('class')?.trim() ?? '').toBe(
        'test-class'
      );
    });

    it('should trim class attribute value', async () => {
      const Cmp = component$(() => {
        return <span class="   test-class   "></span>;
      });

      const { container, cleanup } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('span')).toHaveLength(1);
      expect(container.querySelector('span')!.textContent).toBe('');
      expect(container.querySelector('span')!.getAttribute('class')?.trim() ?? '').toBe(
        'test-class'
      );
    });

    it('should render class attribute from signal', async () => {
      const Cmp = component$(() => {
        const sigValue = useSignal('testA');
        return <button class={sigValue.value}></button>;
      });

      const { container, cleanup } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelector('button')!.getAttribute('class')?.trim() ?? '').toBe('testA');
    });

    it('should render class attribute from array of strings', async () => {
      const Cmp = component$(() => {
        return <button class={['testA', 'testB']}></button>;
      });

      const { container, cleanup } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelector('button')!.getAttribute('class')?.trim() ?? '').toBe(
        'testA testB'
      );
    });

    it('should render class attribute from array of mixed signals and strings', async () => {
      const Cmp = component$(() => {
        const sigValue = useSignal('testA');
        return <button class={[sigValue.value, 'testB']}></button>;
      });

      const { container, cleanup } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelector('button')!.getAttribute('class')?.trim() ?? '').toBe(
        'testA testB'
      );
    });

    it('should render class attribute from objects ', async () => {
      const Cmp = component$(() => {
        return (
          <button
            class={{
              testA: true,
              testB: false,
            }}
          ></button>
        );
      });

      const { container, cleanup } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelector('button')!.getAttribute('class')?.trim() ?? '').toBe('testA');
    });

    it('should render class attribute from object', async () => {
      const Cmp = component$(() => {
        const renderClass = useSignal(true);
        return (
          <button
            class={{
              testA: true,
              testB: false,
              toggle: renderClass.value,
            }}
            onClick$={() => (renderClass.value = !renderClass.value)}
          ></button>
        );
      });

      const { container, cleanup, flush } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelector('button')!.getAttribute('class')?.trim() ?? '').toBe(
        'testA toggle'
      );
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelector('button')!.getAttribute('class')?.trim() ?? '').toBe('testA');
    });
  });
});

describe(`${name}: inner HTML`, () => {
  it('should insert dangerouslySetInnerHTML', async () => {
    const App = component$(() => {
      const html = useSignal("<h2><span>I'm a signal value!</span></h2>");
      return (
        <section>
          <span id="first" dangerouslySetInnerHTML="vanilla HTML here" />
          <span id="second" class="after" dangerouslySetInnerHTML="<h1>I'm an h1!</h1>" />
          <span id="third" class="after" dangerouslySetInnerHTML={html.value} />
          <button
            onClick$={() => (html.value = "<h2><span>I'm an updated signal value!</span></h2>")}
          >
            Change
          </button>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    onTestFinished(cleanup);
    expect(container.querySelector('#first')?.textContent).toBe('vanilla HTML here');
    expect(container.querySelector('#second h1')?.textContent).toBe("I'm an h1!");
    expect(container.querySelector('#second')?.className).toBe('after');
    expect(container.querySelector('#third h2 span')?.textContent).toBe("I'm a signal value!");
    await qwikLoader!.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('#third h2 span')?.textContent).toBe(
      "I'm an updated signal value!"
    );
    expect(container.querySelector('#third')?.className).toBe('after');
  });

  it('should insert dangerouslySetInnerHTML via props', async () => {
    const Child = component$((props: { html: string; fixed: string }) => (
      <section>
        <span id="live" dangerouslySetInnerHTML={props.html} />
        <span id="fixed" dangerouslySetInnerHTML={props.fixed} />
      </section>
    ));
    const App = component$(() => {
      const html = useSignal('<h2>first</h2>');
      return (
        <>
          <Child html={html.value} fixed="<h3>Test content</h3>" />
          <button onClick$={() => (html.value = '<h2>second</h2>')}>Change</button>
        </>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    onTestFinished(cleanup);
    expect(container.querySelector('#live h2')?.textContent).toBe('first');
    expect(container.querySelector('#fixed h3')?.textContent).toBe('Test content');
    await qwikLoader!.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('#live h2')?.textContent).toBe('second');
    expect(container.querySelector('#fixed h3')?.textContent).toBe('Test content');
  });

  it('should render children from dynamic props', async () => {
    const App = component$(() => {
      const props = useSignal({ type: 'div' as const, children: ['Hello'] });
      const Tag = props.value.type;
      return (
        <section>
          <Tag id="dynamic" {...props.value} />
          <button onClick$={() => (props.value = { type: 'div', children: ['Changed'] })}>
            Change
          </button>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    onTestFinished(cleanup);
    expect(container.querySelector('#dynamic')?.textContent).toBe('Hello');
    await qwikLoader!.dispatch(container.querySelector('button')!, 'click');
    expect(container.querySelector('#dynamic')?.textContent).toBe('Changed');
  });

  it('should render svg with dangerouslySetInnerHTML', async () => {
    const App = component$(() => (
      <svg
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
        dangerouslySetInnerHTML='<circle cx="50" cy="50" r="50"></circle><path d="M10 10"></path><path d="M20 20"></path>'
      />
    ));
    const { container, cleanup } = await render(App);
    onTestFinished(cleanup);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
    expect(svg.querySelector('circle')?.getAttribute('r')).toBe('50');
    expect(Array.from(svg.querySelectorAll('path'), (path) => path.getAttribute('d'))).toEqual([
      'M10 10',
      'M20 20',
    ]);
    expect(
      Array.from(svg.querySelectorAll('circle, path'), (element) => element.namespaceURI)
    ).toEqual(Array(3).fill('http://www.w3.org/2000/svg'));
  });
});

describe(`${name}: render styles`, () => {
  it('should render styles', async () => {
    const Child = component$<{ count: number }>(({ count }) => {
      // const count = props.counter.count;
      return (
        <span
          class={{
            even: count % 2 === 0,
            odd: count % 2 === 1,
            stable0: true,
            hidden: false,
          }}
        >
          {count}
        </span>
      );
    });

    const TestCmp = component$(() => {
      const count = useStore({ count: 0 });

      return (
        <>
          <button onClick$={() => count.count++} />
          <Child count={count.count} />
        </>
      );
    });

    const { container, cleanup, flush } = await render(TestCmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('0');
    expect(container.querySelector('span')!.getAttribute('class')?.trim() ?? '').toBe(
      'even stable0'
    );
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('1');
    expect(container.querySelector('span')!.getAttribute('class')?.trim() ?? '').toBe(
      'odd stable0'
    );
  });

  it('should render styles from computed and context', async () => {
    const Ctx = createContextId<{
      val: ComputedSignal<Record<string, number>>;
      abc: SignalType<number>;
    }>('test');

    const Child = component$(() => {
      const ctx = useContext(Ctx);
      // use computed to add context value as dependency
      const color = useComputed$(() => (ctx.abc.value > 0 ? 'red' : 'green'));
      return (
        // use spread props to convert div props to var props
        <div style={{ color: color.value }} {...ctx.val.value}>
          Abcd
        </div>
      );
    });

    const Parent = component$(() => {
      const signal = useSignal(0);
      // use computed to create a new object
      const comp = useComputed$<Record<string, number>>(() => ({
        'data-value': signal.value,
      }));
      useContextProvider(Ctx, {
        val: comp,
        abc: signal,
      });
      return (
        <div>
          <Child />
          <button onClick$={() => signal.value++}></button>
        </div>
      );
    });

    const { container, cleanup, flush } = await render(Parent, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('Abcd');
    expect(container.querySelector('div')!.getAttribute('style')).toBe(null);
    expect(container.querySelector('div')!.getAttribute('data-value')).toBe(null);
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Abcd');
    expect(container.querySelectorAll('div')[1]!.getAttribute('style')).toBe('color:green');
    expect(container.querySelectorAll('div')[1]!.getAttribute('data-value')).toBe('0');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');

    await triggerAll(container, 'button', 'click');
    await flush();

    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('Abcd');
    expect(container.querySelector('div')!.getAttribute('style')).toBe(null);
    expect(container.querySelector('div')!.getAttribute('data-value')).toBe(null);
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Abcd');
    expect(container.querySelectorAll('div')[1]!.getAttribute('style')).toBe('color:red');
    expect(container.querySelectorAll('div')[1]!.getAttribute('data-value')).toBe('1');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
  });
  it('should not rewrite unchanged style and class objects when their component re-renders', async () => {
    const TestCmp = component$(() => {
      const count = useSignal(0);
      // A body read re-renders the component on every click.
      const n = count.value;
      return (
        <>
          <button onClick$={() => count.value++}>{n}</button>
          {/* Render-dependent, so not hoisted to const props. */}
          <div
            id="bg"
            class={{ bg: n >= 0 }}
            style={{ backgroundPositionY: n >= 0 ? 'center' : 'top' }}
          />
        </>
      );
    });

    const { container, cleanup, flush } = await render(TestCmp, { debug });
    onTestFinished(cleanup);
    // Resumed elements read their previous props from the DOM.
    await triggerAll(container, 'button', 'click');
    await flush();
    const bg = container.querySelector('#bg')!;
    // Simulates imperative writes, e.g. from an animation loop.
    bg.setAttribute('style', 'background-position: -10px center');
    bg.setAttribute('class', 'bg moving');

    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelector('button')!.textContent).toBe('2');
    expect(bg.getAttribute('style')).toBe('background-position: -10px center');
    expect(bg.getAttribute('class')).toBe('bg moving');
  });
});
