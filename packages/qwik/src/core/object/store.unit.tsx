import { createDocument } from '../../testing/document';
import { useStore } from '../use/use-store.public';
import { getQwikJSON } from './store';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { component$ } from '../component/component.public';
import { noSerialize } from './q-object';
import { $ } from '../import/qrl.public';
import { logDebug } from '../util/log';
import { inlinedQrl } from '../import/qrl';
import { pauseContainer } from '../object/store';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { render } from '../render/dom/render.public';
import { expectDOM } from '../../testing/expect-dom.unit';

const storeSuite = suite('store');

storeSuite('should serialize content', async () => {
  const document = createDocument();

  await render(
    document.body,
    <div>
      <LexicalScope />
    </div>
  );
  await expectDOM(
    document.body,
    `
  <body q:version="dev" q:container="resumed" q:render="dom-dev">
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
        r: '0 1 e l 7 h 6 5 j! l k',
      },
    },
    objs: [
      1,
      'hola',
      12,
      {
        thing: '2',
      },
      123,
      false,
      true,
      null,
      'string',
      {
        hola: '0',
      },
      'hello',
      ['a'],
      ['0', '8', '5', '9', 'b'],
      '\u0010/runtimeQRL#_',
      {
        a: '3',
        b: '1',
        c: '4',
        d: '5',
        e: '6',
        f: '7',
        g: 'l',
        h: 'c',
        i: 'd',
      },
      2,
      {},
      ['0', 'f', '1', 'g'],
      0,
      {
        count: 'i',
      },
      '\u0002/runtimeQRL#_',
      '\u0001',
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
  const thing = inlinedQrl(LexicalScope_render, 'LexicalScope_render', [
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
