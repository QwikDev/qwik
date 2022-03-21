import { component$, $, useStore } from '@builder.io/qwik';

export const LexicalScope = component$(() => {
  const state = useStore({
    count: 0,
  });
  const a = 1;
  const b = 'hola';
  const c = {
    a: { thing: 12 },
    b: 'hola',
    c: 123,
    d: false,
    e: true,
    f: null,
    g: undefined,
    h: [1, 'string', false, { hola: 1 }, ['hello']],
  };
  const d = undefined;
  const e = null;
  const f = [1, 2, 'hola', {}];
  const g = true;
  const h = false;

  const onclick = $(() => state.count++);

  return $(() => {
    return (
      <section>
        <p>{JSON.stringify(a)}</p>
        <p>{JSON.stringify(b)}</p>
        <p>{JSON.stringify(c)}</p>
        <p>{String(d)}</p>
        <p>{String(e)}</p>
        <p>{JSON.stringify(f)}</p>
        <p>{JSON.stringify(g)}</p>
        <p>{JSON.stringify(h)}</p>
        <button on:click={onclick}>Rerender {state.count}</button>
      </section>
    );
  });
});
