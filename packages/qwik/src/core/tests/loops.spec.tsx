import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { component$, useSignal, Fragment as Component } from '@qwik.dev/core';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: loops', ({ render }) => {
  it('should correctly extract qrls from loop items', async () => {
    (globalThis as any).log = [];
    const Cmp = component$(() => {
      const loop: string[] = ['abcd', 'xyz'];
      return (
        <div>
          {loop.map((item, index) => {
            return (
              <div
                id={`item-${index}`}
                onClick$={() => (globalThis as any).log.push(item)}
                onMouseOver$={() => (globalThis as any).log.push(index)}
              >
                {item}
              </div>
            );
          })}
        </div>
      );
    });

    const { document } = await render(<Cmp />, { debug });
    await trigger(document.body, document.getElementById('item-0'), 'click');
    expect((globalThis as any).log).toEqual(['abcd']);
    await trigger(document.body, document.getElementById('item-0'), 'mouseover');
    expect((globalThis as any).log).toEqual(['abcd', 0]);
    (globalThis as any).log = [];
    await trigger(document.body, document.getElementById('item-1'), 'click');
    expect((globalThis as any).log).toEqual(['xyz']);
    await trigger(document.body, document.getElementById('item-1'), 'mouseover');
    expect((globalThis as any).log).toEqual(['xyz', 1]);
    (globalThis as any).log = undefined;
  });

  it('should correctly extract qrls from loop items and capture refs', async () => {
    (globalThis as any).log = [];
    const Cmp = component$(() => {
      const foo = useSignal('hi');
      const bar = useSignal('ho');
      const loop: string[] = ['abcd', 'xyz'];
      return (
        <div>
          {loop.map((item, index) => {
            return (
              <div
                id={`item-${index}`}
                onClick$={() => (globalThis as any).log.push(item, foo.value)}
                onMouseOver$={() => (globalThis as any).log.push(index, bar.value)}
              >
                {item}
              </div>
            );
          })}
        </div>
      );
    });

    const { document } = await render(<Cmp />, { debug });
    await trigger(document.body, document.getElementById('item-0'), 'click');
    expect((globalThis as any).log).toEqual(['abcd', 'hi']);
    await trigger(document.body, document.getElementById('item-0'), 'mouseover');
    expect((globalThis as any).log).toEqual(['abcd', 'hi', 0, 'ho']);
    (globalThis as any).log = [];
    await trigger(document.body, document.getElementById('item-1'), 'click');
    expect((globalThis as any).log).toEqual(['xyz', 'hi']);
    await trigger(document.body, document.getElementById('item-1'), 'mouseover');
    expect((globalThis as any).log).toEqual(['xyz', 'hi', 1, 'ho']);
    (globalThis as any).log = undefined;
  });

  it('should transform block scoped variables in loops', async () => {
    (globalThis as any).log = [];
    const Cmp = component$(() => {
      const arr = useSignal(['a', 'b']);
      return (
        <div>
          {arr.value.map((val, i) => {
            const index = i + 1;
            return <div onClick$={() => (globalThis as any).log.push(index)}>{val}</div>;
          })}
        </div>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <div>a</div>
          <div>b</div>
        </div>
      </Component>
    );

    await trigger(document.body, 'div', 'click');

    expect((globalThis as any).log).toEqual([1, 2]);

    (globalThis as any).log = undefined;
  });
  it('should capture the outer item in handlers of a nested expression-bodied loop', async () => {
    (globalThis as any).log = [];
    interface Facet {
      slug: string;
      items: { slug: string }[];
    }
    const Facets = component$((props: { facets: Facet[]; prefix: string }) => {
      return (
        <div>
          {props.facets.map((facet: Facet) => (
            <div key={facet.slug}>
              {facet.items.map((item) => (
                <button
                  key={item.slug}
                  id={`${facet.slug}-${item.slug}`}
                  onClick$={() =>
                    (globalThis as any).log.push(`${props.prefix}:${facet.slug}:${item.slug}`)
                  }
                ></button>
              ))}
            </div>
          ))}
        </div>
      );
    });

    const facetList: Facet[] = [
      { slug: 'color', items: [{ slug: 'red' }, { slug: 'blue' }] },
      { slug: 'size', items: [{ slug: 'xl' }] },
    ];
    const { document } = await render(<Facets facets={facetList} prefix="f" />, { debug });

    await trigger(document.body, document.getElementById('color-blue'), 'click');
    await trigger(document.body, document.getElementById('size-xl'), 'click');
    expect((globalThis as any).log).toEqual(['f:color:blue', 'f:size:xl']);

    (globalThis as any).log = undefined;
  });
  it('should capture the outer item in nested loop handlers of a component returning JSX directly', async () => {
    (globalThis as any).log = [];
    interface Facet {
      slug: string;
      items: { slug: string }[];
    }
    const Facets = component$((props: { facets: Facet[]; prefix: string }) => (
      <div>
        {props.facets.map((facet: Facet) => (
          <div key={facet.slug}>
            {facet.items.map((item) => (
              <button
                key={item.slug}
                id={`${facet.slug}-${item.slug}`}
                onClick$={() =>
                  (globalThis as any).log.push(`${props.prefix}:${facet.slug}:${item.slug}`)
                }
              ></button>
            ))}
          </div>
        ))}
      </div>
    ));

    const facetList: Facet[] = [
      { slug: 'color', items: [{ slug: 'red' }, { slug: 'blue' }] },
      { slug: 'size', items: [{ slug: 'xl' }] },
    ];
    const { document } = await render(<Facets facets={facetList} prefix="f" />, { debug });

    await trigger(document.body, document.getElementById('color-blue'), 'click');
    await trigger(document.body, document.getElementById('size-xl'), 'click');
    expect((globalThis as any).log).toEqual(['f:color:blue', 'f:size:xl']);

    (globalThis as any).log = undefined;
  });
  it('should capture the reassigned value of a local in loop handlers', async () => {
    (globalThis as any).log = [];
    const Cmp = component$((props: { items: string[]; prefix: string }) => {
      let prefix = props.prefix;
      prefix = `${prefix}!`;
      return (
        <div>
          {props.items.map((item) => (
            <button
              key={item}
              id={item}
              onClick$={() => (globalThis as any).log.push(`${prefix}:${item}`)}
            ></button>
          ))}
        </div>
      );
    });

    const { document } = await render(<Cmp items={['a', 'b']} prefix="f" />, { debug });

    await trigger(document.body, document.getElementById('b'), 'click');
    expect((globalThis as any).log).toEqual(['f!:b']);

    (globalThis as any).log = undefined;
  });
  it('should render loop handlers from a const declared before the return', async () => {
    (globalThis as any).log = [];
    const Cmp = component$((props: { items: string[]; prefix: string }) => {
      const rows = props.items.map((item) => (
        <button
          key={item}
          id={item}
          onClick$={() => (globalThis as any).log.push(`${props.prefix}:${item}`)}
        ></button>
      ));
      const title = props.prefix.toUpperCase();
      return (
        <div>
          <h1>{title}</h1>
          {rows}
        </div>
      );
    });

    const { document } = await render(<Cmp items={['a', 'b']} prefix="f" />, { debug });

    await trigger(document.body, document.getElementById('b'), 'click');
    expect((globalThis as any).log).toEqual(['f:b']);

    (globalThis as any).log = undefined;
  });
  it('should render loop handlers from functions declared after the return', async () => {
    (globalThis as any).log = [];
    const Cmp = component$((props: { items: string[]; prefix: string }) => {
      return (
        <div>
          {renderRows()}
          <Footer />
        </div>
      );

      function renderRows() {
        return props.items.map((item) => (
          <button
            key={item}
            id={item}
            onClick$={() => (globalThis as any).log.push(`${props.prefix}:${item}`)}
          ></button>
        ));
      }

      function Footer() {
        return props.items.map((item) => (
          <button
            key={item}
            id={`footer-${item}`}
            onClick$={() => (globalThis as any).log.push(`footer:${props.prefix}:${item}`)}
          ></button>
        ));
      }
    });

    const { document } = await render(<Cmp items={['a', 'b']} prefix="f" />, { debug });

    await trigger(document.body, document.getElementById('b'), 'click');
    await trigger(document.body, document.getElementById('footer-a'), 'click');
    expect((globalThis as any).log).toEqual(['f:b', 'footer:f:a']);

    (globalThis as any).log = undefined;
  });
});
