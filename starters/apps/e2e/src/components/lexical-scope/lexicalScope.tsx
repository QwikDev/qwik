import { component$, $, useStore, mutable } from '@builder.io/qwik';

export const LexicalScope = component$(() => {
  return <LexicalScopeChild message={mutable('mutable message')}></LexicalScopeChild>;
});

interface LexicalScopeProps {
  message: string;
}

export const LexicalScopeChild = component$((props: LexicalScopeProps) => {
  const state = useStore({
    count: 0,
    result: '',
  });
  const a = 1;
  const b = '</script>';
  const promise = Promise.resolve('from a promise');
  const c = {
    a: { thing: 12 },
    b: 'hola',
    c: 123,
    d: false,
    e: true,
    f: null,
    g: undefined,
    h: [1, 'string', false, { hola: 1 }, ['hello']],
    promise,
  };
  const d = undefined;
  const e = null;
  const f = [1, 2, 'hola', {}];
  const g = true;
  const h = false;

  const onclick = $(async () => {
    promise.then((promiseValue) => {
      state.result = JSON.stringify([
        a,
        b,
        c,
        String(d),
        String(e),
        f,
        g,
        h,
        props.message,
        promiseValue,
      ]);
      state.count++;
    });
  });

  return (
    <section>
      <div id="static">
        <p>{JSON.stringify(a)}</p>
        <p>{JSON.stringify(b)}</p>
        <p>{JSON.stringify(c)}</p>
        <p>{String(d)}</p>
        <p>{String(e)}</p>
        <p>{JSON.stringify(f)}</p>
        <p>{JSON.stringify(g)}</p>
        <p>{JSON.stringify(h)}</p>
        <p>{props.message}</p>
        <p>{promise}</p>
      </div>
      <button onClick$={onclick} id="rerender">
        Rerender {state.count}
      </button>
      <div id="result">{state.result}</div>
    </section>
  );
});
