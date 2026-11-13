import {
  $,
  component$,
  Slot,
  useComputed$,
  useOn,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
  type Component,
  type QRL,
  type Signal,
} from '@qwik.dev/core';
import { trigger } from '@qwik.dev/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

const text = (container: HTMLElement, selector: string) =>
  container.querySelector(selector)?.textContent ?? null;
const has = (container: HTMLElement, selector: string) =>
  (container.querySelector(selector) ?? null) !== null;

describe(`${name}: functions and components declared inside a component`, () => {
  describe('where the local function is read from', () => {
    it('a local arrow called from a click handler updates the count', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        const bump = () => count.value++;
        return (
          <button id="b" onClick$={() => bump()}>
            {count.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      expect(text(container, '#b')).toBe('1');
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('2');
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('3');
      cleanup();
    });

    it('a local function passed by name to onClick$ handles the click', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        const bump = () => count.value++;
        return (
          <button id="b" onClick$={bump}>
            {count.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('2');
      cleanup();
    });

    it('a local function wrapped in $() serves both a click handler and useOn', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        function bump() {
          count.value += 5;
        }
        const bumpQrl = $(bump);
        useOn('dblclick', bumpQrl);
        return (
          <button id="b" onClick$={() => bumpQrl()}>
            {count.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('6');
      cleanup();
    });

    it('a local function called from useTask$ reruns when its signal changes', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        const doubled = useSignal(0);
        const double = () => count.value * 2;
        useTask$(() => {
          doubled.value = double();
        });
        return (
          <button id="b" onClick$={() => count.value++}>
            {doubled.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      expect(text(container, '#b')).toBe('2');
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('4');
      cleanup();
    });

    it('a local function called from useComputed$ recomputes when its signal changes', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        const triple = () => count.value * 3;
        const tripled = useComputed$(() => triple());
        return (
          <button id="b" onClick$={() => count.value++}>
            {tripled.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      expect(text(container, '#b')).toBe('3');
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('6');
      cleanup();
    });

    it('a local function called from useVisibleTask$ runs on the client', async () => {
      const App = component$(() => {
        const state = useSignal('SSR');
        const mark = (to: string) => (state.value = to + '!');
        useVisibleTask$(() => {
          mark('CSR');
        });
        return <span id="s">{state.value}</span>;
      });
      const { container, cleanup, flush, qwikLoader } = await render(App);
      await qwikLoader?.dispatch(container.querySelector('#s')!, 'qvisible');
      await vi.waitFor(async () => {
        await flush();
        expect(text(container, '#s')).toBe('CSR!');
      });
      cleanup();
    });

    it('local functions in text, an attribute and a branch condition follow a click', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        const label = () => 'n' + count.value;
        const isEven = () => count.value % 2 === 0;
        return (
          <div>
            <button id="b" title={label()} onClick$={() => count.value++}>
              {label()}
            </button>
            {isEven() ? <i id="even">even</i> : <i id="odd">odd</i>}
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      expect(text(container, '#b')).toBe('n1');
      expect(container.querySelector('#b')!.getAttribute('title')).toBe('n1');
      expect(text(container, '#odd')).toBe('odd');
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('n2');
      expect(container.querySelector('#b')!.getAttribute('title')).toBe('n2');
      expect(text(container, '#even')).toBe('even');
      expect(has(container, '#odd')).toBe(false);
      cleanup();
    });

    it('local functions in list rows and row keys follow added rows and clicks', async () => {
      const App = component$(() => {
        const items = useSignal([1, 2]);
        const offset = useSignal(0);
        const show = (n: number) => 'r' + (n + offset.value);
        const keyOf = (n: number) => 'k' + n;
        return (
          <div>
            <button id="add" onClick$={() => (items.value = [...items.value, 3])} />
            <button id="off" onClick$={() => offset.value++} />
            <ul>
              {items.value.map((n) => (
                <li key={keyOf(n)} onClick$={() => (offset.value = n * 100)}>
                  {show(n)}
                </li>
              ))}
            </ul>
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      const rows = () => Array.from(container.querySelectorAll('li'), (li) => li.textContent);
      expect(rows()).toEqual(['r1', 'r2']);
      await trigger(container, '#add', 'click');
      expect(rows()).toEqual(['r1', 'r2', 'r3']);
      await trigger(container, '#off', 'click');
      expect(rows()).toEqual(['r2', 'r3', 'r4']);
      await trigger(container, 'li', 'click');
      expect(rows()).toEqual(['r101', 'r102', 'r103']);
      cleanup();
    });

    it('a local function in a condition inside a list row switches the row content', async () => {
      const App = component$(() => {
        const items = useSignal([1, 2, 3]);
        const limit = useSignal(1);
        const isBig = (n: number) => n > limit.value;
        return (
          <div>
            <button id="b" onClick$={() => limit.value++} />
            {items.value.map((n) => (
              <p key={n} id={'p' + n}>
                {isBig(n) ? <b>big</b> : <i>small</i>}
              </p>
            ))}
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      const rows = () => [1, 2, 3].map((n) => text(container, '#p' + n));
      expect(rows()).toEqual(['small', 'big', 'big']);
      await trigger(container, '#b', 'click');
      expect(rows()).toEqual(['small', 'small', 'big']);
      cleanup();
    });

    it('a local function passed as a plain prop is called by the child', async () => {
      const Child = component$((props: { format: (n: number) => string; n: number }) => (
        <span id="c">{props.format(props.n)}</span>
      ));
      const App = component$(() => {
        const prefix = useSignal('a');
        const n = useSignal(1);
        const format = (v: number) => prefix.value + v;
        return (
          <div>
            <button id="b" onClick$={() => n.value++} />
            <Child format={format} n={n.value} />
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      expect(text(container, '#c')).toBe('a1');
      await trigger(container, '#b', 'click');
      expect(text(container, '#c')).toBe('a2');
      cleanup();
    });
  });

  describe('a local function passed to a child as an on*$ prop', () => {
    it('the child calls it from a click handler', async () => {
      const Child = component$((props: { onPick$: QRL<(n: number) => void> }) => (
        <button id="c" onClick$={() => props.onPick$(5)}>
          child
        </button>
      ));
      const App = component$(() => {
        const picked = useSignal(0);
        const pick = (n: number) => {
          picked.value += n;
        };
        return (
          <div>
            <Child onPick$={pick} />
            <i id="v">{picked.value}</i>
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      expect(text(container, '#v')).toBe('0');
      await trigger(container, '#c', 'click');
      expect(text(container, '#v')).toBe('5');
      await trigger(container, '#c', 'click');
      expect(text(container, '#v')).toBe('10');
      cleanup();
    });

    it('the child forwards it to a button onClick$', async () => {
      const Child = component$((props: { onPick$: QRL<() => void> }) => (
        <button id="c" onClick$={props.onPick$}>
          child
        </button>
      ));
      const App = component$(() => {
        const picked = useSignal(0);
        const pick = () => {
          picked.value++;
        };
        return (
          <div>
            <Child onPick$={pick} />
            <i id="v">{picked.value}</i>
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#c', 'click');
      expect(text(container, '#v')).toBe('1');
      cleanup();
    });

    // The server strips on*$ handlers, so the task calls the prop only after a client change.
    it('the child calls it from useTask$ once per prop change', async () => {
      const Child = component$((props: { n: number; onSeen$: QRL<(n: number) => void> }) => {
        useTask$(() => {
          if (props.n > 1) {
            props.onSeen$(props.n);
          }
        });
        return <i id="n">{props.n}</i>;
      });
      const App = component$(() => {
        const n = useSignal(1);
        const log = useSignal('');
        const seen = (v: number) => {
          log.value += v;
        };
        return (
          <div>
            <button id="b" onClick$={() => n.value++} />
            <Child n={n.value} onSeen$={seen} />
            <b id="log">{log.value}</b>
          </div>
        );
      });
      const { container, cleanup, flush } = await render(App);
      expect(text(container, '#log')).toBe('');
      await trigger(container, '#b', 'click');
      await vi.waitFor(async () => {
        await flush();
        expect(text(container, '#log')).toBe('2');
      });
      await trigger(container, '#b', 'click');
      await vi.waitFor(async () => {
        await flush();
        expect(text(container, '#log')).toBe('23');
      });
      cleanup();
    });

    it('the child resolves it and calls the resolved function', async () => {
      const Child = component$((props: { onPick$: QRL<(n: number) => number> }) => {
        const out = useSignal(0);
        return (
          <button
            id="c"
            onClick$={async () => {
              const pick = await props.onPick$.resolve();
              out.value = pick(2);
            }}
          >
            {out.value}
          </button>
        );
      });
      const App = component$(() => {
        const base = useSignal(40);
        const pick = (n: number) => base.value + n;
        return <Child onPick$={pick} />;
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#c', 'click');
      expect(text(container, '#c')).toBe('42');
      cleanup();
    });
  });

  describe('how the local function is declared', () => {
    it('a function declaration called from a click handler updates the count', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        function bump() {
          count.value += 10;
        }
        return (
          <button id="b" onClick$={() => bump()}>
            {count.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('11');
      cleanup();
    });

    it('a let arrow called from a click handler updates the count', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        // eslint-disable-next-line prefer-const
        let bump = () => (count.value *= 3);
        return (
          <button id="b" onClick$={() => bump()}>
            {count.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('3');
      cleanup();
    });

    it('a var function whose parameter shadows a signal name reads its parameter', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        // eslint-disable-next-line no-var
        var add = function (count: number) {
          return count + 100;
        };
        return (
          <button id="b" onClick$={() => (count.value = add(count.value))}>
            {count.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('101');
      cleanup();
    });

    it('a local function declared below the useTask$ that calls it', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        const seen = useSignal(0);
        useTask$(() => {
          seen.value = later();
        });
        const later = () => count.value + 100;
        return (
          <button id="b" onClick$={() => count.value++}>
            {seen.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      expect(text(container, '#b')).toBe('101');
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('102');
      cleanup();
    });

    it('local functions declared below the JSX whose handler calls them', async () => {
      const App = component$(() => {
        const out = useSignal('');
        const view = (
          <button id="b" onClick$={() => (out.value = first() + second())}>
            {out.value}
          </button>
        );
        // eslint-disable-next-line prefer-const
        let first = () => 'a';
        function second() {
          return 'b';
        }
        return view;
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('ab');
      cleanup();
    });

    it('a local function declared inside an if block of the component', async () => {
      const App = component$((props: { isOn: boolean }) => {
        const count = useSignal(1);
        if (props.isOn) {
          const bump = () => (count.value += 7);
          return (
            <button id="b" onClick$={() => bump()}>
              {count.value}
            </button>
          );
        }
        return <i>off</i>;
      });
      const { container, cleanup } = await render(App, { props: { isOn: true } });
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('8');
      cleanup();
    });

    it('a local function in a custom hook is called by the $() the hook returns', async () => {
      function useCounter() {
        const count = useSignal(1);
        const next = () => count.value + 2;
        const inc = $(() => {
          count.value = next();
        });
        return { count, inc };
      }
      const App = component$(() => {
        const { count, inc } = useCounter();
        return (
          <button id="b" onClick$={inc}>
            {count.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      expect(text(container, '#b')).toBe('1');
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('3');
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('5');
      cleanup();
    });

    it('a local function in a plain helper is called by the $() the helper returns', async () => {
      function makeAdder(target: Signal<number>, by: number) {
        const add = () => {
          target.value += by;
        };
        return $(() => add());
      }
      const App = component$(() => {
        const count = useSignal(1);
        const add = makeAdder(count, 3);
        return (
          <button id="b" onClick$={add}>
            {count.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('4');
      cleanup();
    });

    it('a local function inside a useTask$ body is called by a $() made there', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        const out = useSignal('');
        const action = useSignal<QRL<() => void>>();
        useTask$(() => {
          const format = (n: number) => 'v' + n;
          action.value = $(() => {
            out.value = format(count.value);
          });
        });
        return (
          <div>
            <button id="inc" onClick$={() => count.value++} />
            <button id="b" onClick$={() => action.value?.()}>
              {out.value}
            </button>
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#inc', 'click');
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('v2');
      cleanup();
    });

    it('a local function inside a click handler is called by a $() made there', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        return (
          <button
            id="b"
            onClick$={async () => {
              const add = (n: number) => (count.value += n);
              const later = $(() => add(5));
              await later();
            }}
          >
            {count.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('6');
      cleanup();
    });

    it('a function declared inside another local function is called by the $() it returns', async () => {
      const App = component$(() => {
        const count = useSignal(3);
        const out = useSignal(0);
        const make = () => {
          const inner = () => count.value * 2;
          return $(() => inner());
        };
        return (
          <button id="b" onClick$={async () => (out.value = await make()())}>
            {out.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('6');
      cleanup();
    });

    it('two components with same-named local functions each update their own count', async () => {
      const A = component$(() => {
        const count = useSignal(1);
        const bump = () => (count.value += 1);
        return (
          <button id="a" onClick$={() => bump()}>
            {count.value}
          </button>
        );
      });
      const App = component$(() => {
        const count = useSignal(100);
        const bump = () => (count.value += 100);
        return (
          <div>
            <A />
            <button id="b" onClick$={() => bump()}>
              {count.value}
            </button>
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#a', 'click');
      await trigger(container, '#b', 'click');
      expect(text(container, '#a')).toBe('2');
      expect(text(container, '#b')).toBe('200');
      cleanup();
    });
  });

  describe('what the local function reads', () => {
    it('a destructured prop', async () => {
      const Child = component$(({ start }: { start: number }) => {
        const n = useSignal(0);
        const sum = () => start + n.value;
        return (
          <button id="c" onClick$={() => (n.value = sum() + 1)}>
            {n.value}
          </button>
        );
      });
      const App = component$(() => <Child start={10} />);
      const { container, cleanup } = await render(App);
      await trigger(container, '#c', 'click');
      expect(text(container, '#c')).toBe('11');
      await trigger(container, '#c', 'click');
      expect(text(container, '#c')).toBe('22');
      cleanup();
    });

    it('a destructured rest prop', async () => {
      const Child = component$(({ label, ...rest }: { label: string; extra: string }) => {
        const out = useSignal('');
        const read = () => label + rest.extra;
        return (
          <button id="c" onClick$={() => (out.value = read())}>
            {out.value}
          </button>
        );
      });
      const App = component$(() => <Child label="a" extra="b" />);
      const { container, cleanup } = await render(App);
      await trigger(container, '#c', 'click');
      expect(text(container, '#c')).toBe('ab');
      cleanup();
    });

    it('a props member that the parent changes', async () => {
      const Child = component$((props: { start: number }) => {
        const out = useSignal(0);
        const read = () => props.start * 2;
        return (
          <button id="c" onClick$={() => (out.value = read())}>
            {out.value}
          </button>
        );
      });
      const App = component$(() => {
        const start = useSignal(3);
        return (
          <div>
            <button id="s" onClick$={() => start.value++} />
            <Child start={start.value} />
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#c', 'click');
      expect(text(container, '#c')).toBe('6');
      await trigger(container, '#s', 'click');
      await trigger(container, '#c', 'click');
      expect(text(container, '#c')).toBe('8');
      cleanup();
    });

    it('a store, a computed, a constant and another local function', async () => {
      const App = component$(() => {
        const store = useStore({ n: 1 });
        const doubled = useComputed$(() => store.n * 2);
        const base = 100;
        const out = useSignal('');
        const inc = () => store.n++;
        const report = () => base + store.n + doubled.value;
        const both = () => {
          inc();
          return report();
        };
        return (
          <button id="b" onClick$={() => (out.value = String(both()))}>
            {out.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('106');
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('109');
      cleanup();
    });

    it('a constant declared after the function', async () => {
      const App = component$(() => {
        const out = useSignal(0);
        const read = () => later + 1;
        const later = 41;
        return (
          <button id="b" onClick$={() => (out.value = read())}>
            {out.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('42');
      cleanup();
    });

    it('the loop variable of a for loop and of a list row', async () => {
      const App = component$(() => {
        const out = useSignal('');
        const handlers: QRL<() => void>[] = [];
        for (let k = 1; k <= 2; k++) {
          const times = () => k * 10;
          handlers.push(
            $(() => {
              out.value = 'f' + times();
            })
          );
        }
        return (
          <div>
            <button id="f0" onClick$={handlers[0]} />
            <button id="f1" onClick$={handlers[1]} />
            {[3, 4].map((n) => {
              const twice = () => n * 2;
              return (
                <p key={n} id={'m' + n} onClick$={() => (out.value = 'm' + twice())}>
                  {n}
                </p>
              );
            })}
            <i id="o">{out.value}</i>
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#f1', 'click');
      expect(text(container, '#o')).toBe('f20');
      await trigger(container, '#f0', 'click');
      expect(text(container, '#o')).toBe('f10');
      await trigger(container, '#m4', 'click');
      expect(text(container, '#o')).toBe('m8');
      cleanup();
    });

    it('a captured local each list row adds to through a local helper', async () => {
      const App = component$(() => {
        const out = useSignal('');
        const items = useSignal(['a', 'b']);
        let prefix = '>';
        const run = (action: () => void) => action();
        return (
          <div>
            {items.value.map((item) => {
              run(() => {
                prefix += item;
              });
              return <p key={item} id={item} onClick$={() => (out.value = prefix)} />;
            })}
            <i id="o">{out.value}</i>
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      // Each row adds to its own copy, so no row sees what another row added.
      await trigger(container, '#b', 'click');
      expect(text(container, '#o')).toBe('>b');
      await trigger(container, '#a', 'click');
      expect(text(container, '#o')).toBe('>a');
      cleanup();
    });

    it('a $() function, with a signal as the default parameter', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        const inc = $(() => count.value++);
        const repeat = async (times = count.value) => {
          for (let i = 0; i < times; i++) {
            await inc();
          }
        };
        return (
          <button id="b" onClick$={() => repeat()}>
            {count.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('2');
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('4');
      cleanup();
    });
  });

  describe('recursion', () => {
    it('a function that calls itself computes the result in a click handler', async () => {
      const App = component$(() => {
        const out = useSignal(0);
        const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
        return (
          <button id="b" onClick$={() => (out.value = fact(5))}>
            {out.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('120');
      cleanup();
    });

    it('two functions that call each other compute the result in a click handler', async () => {
      const App = component$(() => {
        const out = useSignal('');
        function isEven(n: number): boolean {
          return n === 0 ? true : isOdd(n - 1);
        }
        function isOdd(n: number): boolean {
          return n === 0 ? false : isEven(n - 1);
        }
        return (
          <button id="b" onClick$={() => (out.value = isEven(7) + ':' + isOdd(7))}>
            {out.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('false:true');
      cleanup();
    });
  });

  describe('async and generator functions', () => {
    it('an async local function is awaited in a click handler', async () => {
      const App = component$(() => {
        const n = useSignal(2);
        const out = useSignal('');
        const load = async () => {
          await Promise.resolve();
          return n.value * 2;
        };
        return (
          <button id="b" onClick$={async () => (out.value = 'a' + (await load()))}>
            {out.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('a4');
      cleanup();
    });

    it('a generator local function is spread in a click handler', async () => {
      const App = component$(() => {
        const n = useSignal(2);
        const out = useSignal('');
        function* steps() {
          yield n.value;
          yield n.value + 1;
        }
        return (
          <button id="b" onClick$={() => (out.value = 'g' + [...steps()].join(','))}>
            {out.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('g2,3');
      cleanup();
    });
  });

  describe('changes made by a local function while rendering', () => {
    it('a function called while rendering and from a click handler updates one count', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        const bump = () => count.value++;
        bump();
        return (
          <button id="b" onClick$={() => bump()}>
            {count.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      expect(text(container, '#b')).toBe('2');
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('3');
      cleanup();
    });

    it('state set by a function while rendering is kept for the next click', async () => {
      const App = component$(() => {
        const count = useSignal(1);
        const label = useSignal('');
        const setTo = (n: number) => {
          count.value = n;
          label.value = 'set' + n;
        };
        setTo(7);
        return (
          <button id="b" onClick$={() => setTo(count.value + 1)}>
            {label.value}:{count.value}
          </button>
        );
      });
      const { container, cleanup } = await render(App);
      expect(text(container, '#b')).toBe('set7:7');
      await trigger(container, '#b', 'click');
      expect(text(container, '#b')).toBe('set8:8');
      cleanup();
    });
  });

  describe('components declared inside a component', () => {
    it('a component$ with its own hooks keeps working when toggled off and on', async () => {
      const App = component$(() => {
        const shown = useSignal(false);
        const base = useSignal(10);
        const Counter = component$(() => {
          const count = useSignal(base.value);
          const doubled = useSignal(0);
          useTask$(() => {
            doubled.value = count.value * 2;
          });
          return (
            <button id="c" onClick$={() => count.value++}>
              {count.value}:{doubled.value}
            </button>
          );
        });
        return (
          <div>
            <button id="t" onClick$={() => (shown.value = !shown.value)} />
            <button id="base" onClick$={() => base.value++} />
            {shown.value ? <Counter /> : <i id="none">none</i>}
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      expect(has(container, '#c')).toBe(false);
      await trigger(container, '#t', 'click');
      expect(text(container, '#c')).toBe('10:20');
      await trigger(container, '#c', 'click');
      expect(text(container, '#c')).toBe('11:22');
      await trigger(container, '#t', 'click');
      expect(has(container, '#c')).toBe(false);
      await trigger(container, '#base', 'click');
      await trigger(container, '#t', 'click');
      expect(text(container, '#c')).toBe('11:22');
      cleanup();
    });

    it('a lite component in a condition follows the parent signal when toggled', async () => {
      const App = component$(() => {
        const shown = useSignal(false);
        const n = useSignal(1);
        const Badge = (props: { label: string }) => (
          <b id="badge">
            {props.label}
            {n.value}
          </b>
        );
        return (
          <div>
            <button id="t" onClick$={() => (shown.value = !shown.value)} />
            <button id="n" onClick$={() => n.value++} />
            {shown.value && <Badge label="x" />}
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#t', 'click');
      expect(text(container, '#badge')).toBe('x1');
      await trigger(container, '#n', 'click');
      expect(text(container, '#badge')).toBe('x2');
      await trigger(container, '#t', 'click');
      expect(has(container, '#badge')).toBe(false);
      await trigger(container, '#t', 'click');
      expect(text(container, '#badge')).toBe('x2');
      cleanup();
    });

    it('a component$ projected into a slot starts fresh when toggled off and on', async () => {
      const Wrapper = component$(() => (
        <section>
          <Slot />
        </section>
      ));
      const App = component$(() => {
        const shown = useSignal(false);
        const Inner = component$(() => {
          const clicks = useSignal(0);
          return (
            <button id="in" onClick$={() => clicks.value++}>
              {clicks.value}
            </button>
          );
        });
        return (
          <div>
            <button id="t" onClick$={() => (shown.value = !shown.value)} />
            <Wrapper>{shown.value && <Inner />}</Wrapper>
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#t', 'click');
      expect(text(container, '#in')).toBe('0');
      await trigger(container, '#in', 'click');
      expect(text(container, '#in')).toBe('1');
      await trigger(container, '#t', 'click');
      expect(has(container, '#in')).toBe(false);
      await trigger(container, '#t', 'click');
      expect(text(container, '#in')).toBe('0');
      cleanup();
    });

    it('a component$ and a lite component in list rows render added rows', async () => {
      const App = component$(() => {
        const items = useSignal([1]);
        const prefix = useSignal('p');
        const Row = component$((props: { n: number }) => {
          const hits = useSignal(0);
          return (
            <button id={'r' + props.n} onClick$={() => hits.value++}>
              {prefix.value}
              {props.n}:{hits.value}
            </button>
          );
        });
        const Tag = (props: { n: number }) => <em id={'t' + props.n}>{props.n * 10}</em>;
        return (
          <div>
            <button
              id="add"
              onClick$={() => (items.value = [...items.value, items.value.length + 1])}
            />
            {items.value.map((n) => (
              <div key={n}>
                <Row n={n} />
                <Tag n={n} />
              </div>
            ))}
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      expect(text(container, '#r1')).toBe('p1:0');
      await trigger(container, '#add', 'click');
      expect(text(container, '#r2')).toBe('p2:0');
      expect(text(container, '#t2')).toBe('20');
      await trigger(container, '#r2', 'click');
      expect(text(container, '#r2')).toBe('p2:1');
      cleanup();
    });

    it('a component$ stored in a JSX variable renders when shown', async () => {
      const App = component$(() => {
        const shown = useSignal(false);
        const Panel = component$(() => {
          const n = useSignal(3);
          return (
            <button id="panel" onClick$={() => n.value++}>
              {n.value}
            </button>
          );
        });
        const panel = <Panel />;
        return (
          <div>
            <button id="t" onClick$={() => (shown.value = !shown.value)} />
            {shown.value ? panel : null}
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#t', 'click');
      expect(text(container, '#panel')).toBe('3');
      await trigger(container, '#panel', 'click');
      expect(text(container, '#panel')).toBe('4');
      await trigger(container, '#t', 'click');
      await trigger(container, '#t', 'click');
      expect(text(container, '#panel')).toBe('3');
      cleanup();
    });

    it('a component$ rendered directly and behind a toggle shows the same signal', async () => {
      const App = component$(() => {
        const shown = useSignal(false);
        const label = useSignal('L');
        const Label = component$(() => <span class="label">{label.value}</span>);
        return (
          <div>
            <button id="t" onClick$={() => (shown.value = !shown.value)} />
            <button id="l" onClick$={() => (label.value += '!')} />
            <Label />
            {shown.value && <Label />}
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      const labels = () =>
        Array.from(container.querySelectorAll('.label'), (label) => label.textContent);
      expect(labels()).toEqual(['L']);
      await trigger(container, '#t', 'click');
      expect(labels()).toEqual(['L', 'L']);
      await trigger(container, '#l', 'click');
      expect(labels()).toEqual(['L!', 'L!']);
      cleanup();
    });

    it('a component$ calls its own local function from a click handler', async () => {
      const App = component$(() => {
        const shown = useSignal(false);
        const step = useSignal(2);
        const Counter = component$(() => {
          const n = useSignal(0);
          const advance = () => (n.value += step.value);
          return (
            <button id="c" onClick$={() => advance()}>
              {n.value}
            </button>
          );
        });
        return (
          <div>
            <button id="t" onClick$={() => (shown.value = !shown.value)} />
            {shown.value && <Counter />}
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#t', 'click');
      await trigger(container, '#c', 'click');
      expect(text(container, '#c')).toBe('2');
      cleanup();
    });

    it('a component$ calls a local function of its parent from a click handler', async () => {
      const App = component$(() => {
        const shown = useSignal(false);
        const total = useSignal(0);
        const add = (n: number) => (total.value += n);
        const Adder = component$(() => (
          <button id="add" onClick$={() => add(4)}>
            {total.value}
          </button>
        ));
        return (
          <div>
            <button id="t" onClick$={() => (shown.value = !shown.value)} />
            {shown.value && <Adder />}
            <button id="direct" onClick$={() => add(1)} />
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#direct', 'click');
      await trigger(container, '#t', 'click');
      expect(text(container, '#add')).toBe('1');
      await trigger(container, '#add', 'click');
      expect(text(container, '#add')).toBe('5');
      cleanup();
    });

    it('a component$ made by a local function in a click handler shows the parent signal', async () => {
      const App = component$(() => {
        const count = useSignal(0);
        const shown = useSignal<Component | null>(null);
        const makeCounter = () => {
          const Counter = component$(() => <b id="counter">{count.value}</b>);
          return Counter;
        };
        const Shown = shown.value;
        return (
          <div>
            <button id="make" onClick$={() => (shown.value = makeCounter())} />
            <button id="add" onClick$={() => count.value++} />
            {Shown && <Shown />}
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      expect(has(container, '#counter')).toBe(false);
      await trigger(container, '#make', 'click');
      expect(text(container, '#counter')).toBe('0');
      await trigger(container, '#add', 'click');
      expect(text(container, '#counter')).toBe('1');
      cleanup();
    });

    it('a component written as a plain function, made by a helper the component calls, follows the parent signal', async () => {
      const App = component$(() => {
        const count = useSignal(0);
        const makeCounter = () => {
          const Counter = () => <b id="counter">{count.value}</b>;
          return Counter;
        };
        const Made = makeCounter();
        return (
          <div>
            <button id="add" onClick$={() => count.value++} />
            <Made />
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      expect(text(container, '#counter')).toBe('0');
      await trigger(container, '#add', 'click');
      expect(text(container, '#counter')).toBe('1');
      await trigger(container, '#add', 'click');
      expect(text(container, '#counter')).toBe('2');
      cleanup();
    });

    it('a component written as a plain function, made by a helper a click handler calls, follows the parent signal', async () => {
      const App = component$(() => {
        const count = useSignal(0);
        const shown = useSignal<Component | null>(null);
        const makeCounter = () => {
          function Counter() {
            return <b id="counter">{count.value}</b>;
          }
          return Counter;
        };
        const Shown = shown.value;
        return (
          <div>
            <button id="make" onClick$={() => (shown.value = makeCounter())} />
            <button id="add" onClick$={() => count.value++} />
            {Shown && <Shown />}
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      expect(has(container, '#counter')).toBe(false);
      await trigger(container, '#make', 'click');
      expect(text(container, '#counter')).toBe('0');
      await trigger(container, '#add', 'click');
      expect(text(container, '#counter')).toBe('1');
      await trigger(container, '#add', 'click');
      expect(text(container, '#counter')).toBe('2');
      cleanup();
    });

    it('a lite component calls its own local function from a click handler', async () => {
      const App = component$(() => {
        const count = useSignal(0);
        const Btn = () => {
          const add = () => (count.value += 3);
          return (
            <button id="lite" onClick$={() => add()}>
              {count.value}
            </button>
          );
        };
        return (
          <div>
            <Btn />
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      await trigger(container, '#lite', 'click');
      expect(text(container, '#lite')).toBe('3');
      cleanup();
    });
  });

  describe('an uppercase function returning JSX that the component calls directly', () => {
    it('builds list items in the component and follows the parent signal', async () => {
      const App = component$(() => {
        const count = useSignal(0);
        const Row = (item: number) => (
          <li id={`row${item}`}>
            {item}:{count.value}
          </li>
        );
        return (
          <div>
            <button id="add" onClick$={() => count.value++} />
            <ul>
              {Row(1)}
              {Row(2)}
            </ul>
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      expect([text(container, '#row1'), text(container, '#row2')]).toEqual(['1:0', '2:0']);
      await trigger(container, '#add', 'click');
      expect([text(container, '#row1'), text(container, '#row2')]).toEqual(['1:1', '2:1']);
      cleanup();
    });

    it('builds a list item in a helper and follows the parent signal', async () => {
      const App = component$(() => {
        const count = useSignal(0);
        const makeRow = () => {
          function Row(item: number) {
            return (
              <li id="row">
                {item}:{count.value}
              </li>
            );
          }
          return Row(1);
        };
        return (
          <div>
            <button id="add" onClick$={() => count.value++} />
            <ul>{makeRow()}</ul>
          </div>
        );
      });
      const { container, cleanup } = await render(App);
      expect(text(container, '#row')).toBe('1:0');
      await trigger(container, '#add', 'click');
      expect(text(container, '#row')).toBe('1:1');
      cleanup();
    });
  });
});
