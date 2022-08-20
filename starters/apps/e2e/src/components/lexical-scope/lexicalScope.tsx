import { component$, $, useStore, mutable, noSerialize } from '@builder.io/qwik';

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
  const rejected = Promise.reject(new Error('failed message'));
  rejected.catch(() => null);

  const c = {
    a: { thing: 12 },
    b: 'hola',
    c: 123,
    d: false,
    e: true,
    f: null,
    g: undefined,
    h: [1, 'string', false, { hola: 1 }, ['hello']],
    i: noSerialize(() => console.warn()),
    promise,
  };
  const d = undefined;
  const e = null;
  const g = true;
  const h = false;
  const i = noSerialize(() => console.error());
  const f = [1, 2, 'hola', i, {}];
  const url = new URL('http://qwik.builder.com/docs?query=true');
  const date = new Date('2022-07-26T17:40:30.255Z');
  const regex = /hola()\//gi;
  const nullPrototype = Object.create(null);
  nullPrototype.value = 12;

  const onclick = $(async () => {
    rejected.catch((reason) => {
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
          i,
          props.message,
          promiseValue,
          url.href,
          date.toISOString(),
          `${regex.source} ${regex.flags}`,
          nullPrototype.value,
          reason.message,
        ]);
        state.count++;
      });
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
        <p>{String(i)}</p>
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
