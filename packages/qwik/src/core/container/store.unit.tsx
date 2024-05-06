import { createDocument } from '../../testing/document';
import { useStore } from '../use/use-store.public';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { component$ } from '../component/component.public';
import { $ } from '../qrl/qrl.public';
import { logDebug } from '../util/log';
import { inlinedQrl } from '../qrl/qrl';
import { render } from '../render/dom/render.public';
import { expectDOM } from '../../testing/expect-dom';
import { pauseContainer } from './pause';
import { noSerialize } from '../state/common';
import { useSignal } from '../use/use-signal';
import { getQwikJSON } from './resume';
import { assert, test } from 'vitest';

test.skip('should serialize content', async () => {
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
      <!--qv -->
      <div>0</div>
      <!--/qv-->
    </div>
  </body>`
  );
  await pauseContainer(document.body);
  const script = getQwikJSON(document.body, 'type')!;
  script.remove();

  await expectDOM(
    document.body,
    `
    <body q:version="dev" q:container="paused" q:render="dom-dev">
      <div>
        <!--qv q:id=0-->
        <div>
          0
        </div>
        <!--/qv-->
      </div>
      <script>
        (window.qwikevents ||= []).push("click");
      </script>
    </body>`
  );

  assert.deepEqual(JSON.parse(script.textContent!), {
    refs: {
      '1': '1 2 f o 8 i 7 6 k! o l 0 n',
    },
    ctx: {},
    objs: [
      '\u0012j',
      1,
      'hola',
      12,
      {
        thing: '3',
      },
      123,
      false,
      true,
      null,
      'string',
      {
        hola: '1',
      },
      'hello',
      ['b'],
      ['1', '9', '6', 'a', 'c'],
      '\u0010/runtimeQRL#_',
      {
        a: '4',
        b: '2',
        c: '5',
        d: '6',
        e: '7',
        f: '8',
        g: 'o',
        h: 'd',
        i: 'e',
      },
      2,
      {},
      ['1', 'g', '2', 'h'],
      0,
      {
        count: 'j',
      },
      '\u0002/runtimeQRL#_',
      'ok',
      '\u0012m',
      '\u0001',
    ],
    subs: [['4 #0 0 #2']],
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
      <button document:onClick$={() => state.count++}>Rerender {state.count}</button>
    </section>
  );
};

export const LexicalScope = component$(() => {
  const state = useStore({
    count: 0,
  });
  const signal = useSignal(0);
  const signalFromFn = useSignal(() => 'ok');
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
    signal,
    signalFromFn,
  ]);
  return <div onClick$={thing}>{signal as any}</div>;
});
