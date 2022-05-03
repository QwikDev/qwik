import { createDocument } from '../../testing/document';
import { useStore } from '../use/use-store.public';
import { getContext, getProps } from '../props/props';
import type { Props } from '../props/props.public';
import { newInvokeContext, useInvoke } from '../use/use-core';
import { render } from '../render/render.public';
import { getQwikJSON } from './store';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { component$ } from '../component/component.public';
import { noSerialize } from './q-object';
import { $ } from '../import/qrl.public';
import { logDebug } from '../util/log';
import { runtimeQrl } from '../import/qrl';
import { pauseContainer } from '../object/store.public';
import { RenderEvent } from '../util/markers';
import { useDocument } from '../use/use-document.public';
import { useHostElement } from '../use/use-host-element.public';

describe('store', () => {
  let document: Document;
  let div: HTMLElement;
  let qDiv: Props;

  beforeEach(() => {
    document = createDocument();
    div = document.createElement('div');
    document.body.appendChild(div);
    qDiv = getProps(getContext(div));
  });

  it('should serialize content', async () => {
    await render(
      document.body,
      <div>
        <LexicalScope />
      </div>
    );
    await pauseContainer(document.body);
    const script = getQwikJSON(document.body)!;
    expect(JSON.parse(script.textContent!)).toMatchSnapshot();
  });

  it('should serialize cyclic graphs', () => {
    useInvoke(newInvokeContext(document, div, div, RenderEvent), () => {
      const foo = useStore({ mark: 'foo', bar: {} });
      const bar = useStore({ mark: 'bar', foo: foo });
      foo.bar = bar;
      qDiv.foo = foo;

      pauseContainer(document);

      qDiv = getProps(getContext(div));
      const foo2 = qDiv.foo;
      const bar2 = foo2.bar;
      expect(foo2.mark).toEqual('foo');
      expect(bar2.mark).toEqual('bar');
      expect(foo2.bar.foo).toStrictEqual(foo2);
    });
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
  };
  const noserialize = noSerialize({ text: 'not included', window: () => {} });
  const undef = undefined;
  const nulll = null;
  const array = [1, 2, 'hola', {}];
  const boolTrue = true;
  const boolFalse = false;
  const qrl = $(() => logDebug('qrl'));
  const el = useHostElement();
  const doc = useDocument();
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
    el,
    doc,
  ]);
  return <div onClickQrl={thing}></div>;
});
