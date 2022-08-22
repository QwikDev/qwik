import { createDocument } from '../../testing/document';
import { useStore } from '../use/use-store.public';
import { getQwikJSON } from './store';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { component$ } from '../component/component.public';
import { noSerialize } from './q-object';
import { $ } from '../import/qrl.public';
import { logDebug } from '../util/log';
import { runtimeQrl } from '../import/qrl';
import { pauseContainer } from '../object/store';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { render } from '../render/dom/render.public';
import { expectDOM } from '../../testing/expect-dom.unit';

const storeSuite = suite('store');

storeSuite('should serialize content', async () => {
  const document = createDocument();
  const div = document.createElement('div');
  document.body.appendChild(div);

  await render(
    document.body,
    <div>
      <LexicalScope />
    </div>
  );
  await expectDOM(
    document.body,
    `
  <body q:version="" q:container="resumed">
    <div>
      <!--qv q:key=sX: q:id=0-->
      <div q:id="1" on:click="/runtimeQRL#_[0 1 2 3 4 5 6 7 8 9 10]"></div>
      <!--/qv-->
    </div>
  </body>`
  );
  await pauseContainer(document.body);
  const script = getQwikJSON(document.body)!;

  equal(JSON.parse(script.textContent!), {
    ctx: {
      '#1': {
        r: '0 1 2 l 8 f 7 6 i! l k',
      },
    },
    objs: [
      1,
      'hola',
      {
        a: '3',
        b: '1',
        c: '5',
        d: '6',
        e: '7',
        f: '8',
        g: 'l',
        h: '9',
        i: 'e',
      },
      {
        thing: '4',
      },
      12,
      123,
      false,
      true,
      null,
      ['0', 'a', '6', 'b', 'c'],
      'string',
      {
        hola: '0',
      },
      ['d'],
      'hello',
      '\b/runtimeQRL#_',
      ['0', 'g', '1', 'h'],
      2,
      {},
      {
        count: 'j',
      },
      0,
      '\u0001/runtimeQRL#_',
      '\u0000',
    ],
    subs: [],
  });
});

export const LexicalScope_render = () => {
  const [a, b, c, d, e, f, g, h, state, noserialize] = useLexicalScope();
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
      <p>{noserialize.text}</p>
      <button onDocumentClick$={() => state.count++}>Rerender {state.count}</button>
    </section>
  );
};

export const LexicalScope = component$(() => {
  const state = useStore({
    count: 0,
  });
  const nu = 1;
  const str = 'hola';
  const obj = {
    a: { thing: 12 },
    b: 'hola',
    c: 123,
    d: false,
    e: true,
    f: null,
    g: undefined,
    h: [1, 'string', false, { hola: 1 }, ['hello']],
    i: LexicalScope,
  };
  const noserialize = noSerialize({ text: 'not included', window: () => {} });
  const undef = undefined;
  const nulll = null;
  const array = [1, 2, 'hola', {}];
  const boolTrue = true;
  const boolFalse = false;
  const qrl = $(() => logDebug('qrl'));
  const thing = runtimeQrl(LexicalScope_render, [
    nu,
    str,
    obj,
    undef,
    nulll,
    array,
    boolTrue,
    boolFalse,
    state,
    noserialize,
    qrl,
  ]);
  return <div onClick$={thing}></div>;
});

storeSuite.run();
