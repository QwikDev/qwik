import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { component$, Fragment, Fragment as Component, useSignal, useStore } from '@qwik.dev/core';
import { Each } from '../control-flow/each';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: loops', ({ render }) => {
  it('should render each item', async () => {
    const Cmp = component$(() => {
      return (
        <div id="loop">
          <Each
            items={['a', 'b', 'c']}
            key$={(item) => item}
            item$={(item) => <div>Hello {item}</div>}
          />
        </div>
      );
    });
    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div id="loop">
          <Component>
            <div>Hello a</div>
            <div>Hello b</div>
            <div>Hello c</div>
          </Component>
        </div>
      </Component>
    );
    await expect(document.querySelector('#loop')).toMatchDOM(
      <div id="loop">
        <div>Hello a</div>
        <div>Hello b</div>
        <div>Hello c</div>
      </div>
    );
  });

  it('should render long each item', async () => {
    const Cmp = component$(() => {
      return (
        <div id="loop">
          <Each
            items={['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']}
            key$={(item) => item}
            item$={(item) => <div>Hello {item}</div>}
          />
        </div>
      );
    });
    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div id="loop">
          <Component>
            <div>Hello a</div>
            <div>Hello b</div>
            <div>Hello c</div>
            <div>Hello d</div>
            <div>Hello e</div>
            <div>Hello f</div>
            <div>Hello g</div>
            <div>Hello h</div>
            <div>Hello i</div>
            <div>Hello j</div>
          </Component>
        </div>
      </Component>
    );
    await expect(document.querySelector('#loop')).toMatchDOM(
      <div id="loop">
        <div>Hello a</div>
        <div>Hello b</div>
        <div>Hello c</div>
        <div>Hello d</div>
        <div>Hello e</div>
        <div>Hello f</div>
        <div>Hello g</div>
        <div>Hello h</div>
        <div>Hello i</div>
        <div>Hello j</div>
      </div>
    );
  });

  describe('signal', async () => {
    it('should update each item', async () => {
      const Cmp = component$(() => {
        const items = useSignal(['a', 'b', 'c']);
        return (
          <>
            <div id="loop">
              <Each
                items={items.value}
                key$={(item) => item}
                item$={(item) => <div>Hello {item}</div>}
              />
            </div>
            <button onClick$={() => (items.value = ['d', 'e', 'f'])}>Update</button>
          </>
        );
      });
      const { vNode, document } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <div id="loop">
              <Component ssr-required>
                <div>Hello a</div>
                <div>Hello b</div>
                <div>Hello c</div>
              </Component>
            </div>
            <button>Update</button>
          </Fragment>
        </Component>
      );
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello a</div>
          <div>Hello b</div>
          <div>Hello c</div>
        </div>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <div id="loop">
              <Component ssr-required>
                <div>Hello d</div>
                <div>Hello e</div>
                <div>Hello f</div>
              </Component>
            </div>
            <button>Update</button>
          </Fragment>
        </Component>
      );
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello d</div>
          <div>Hello e</div>
          <div>Hello f</div>
        </div>
      );
    });

    it('should keep reused keyed rows unchanged when item content changes', async () => {
      const Cmp = component$(() => {
        const items = useSignal([
          { id: 'a', label: 'Hello a' },
          { id: 'b', label: 'Hello b' },
          { id: 'c', label: 'Hello c' },
        ]);
        return (
          <>
            <div id="loop">
              <Each
                items={items.value}
                key$={(item) => item.id}
                item$={(item) => <div>{item.label}</div>}
              />
            </div>
            <button
              onClick$={() => {
                items.value = [
                  { id: 'a', label: 'Hello a' },
                  { id: 'b', label: 'Updated b' },
                  { id: 'c', label: 'Hello c' },
                ];
              }}
            >
              Update
            </button>
          </>
        );
      });

      const { document } = await render(<Cmp />, { debug });
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello a</div>
          <div>Hello b</div>
          <div>Hello c</div>
        </div>
      );
      await trigger(document.body, 'button', 'click');
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello a</div>
          <div>Hello b</div>
          <div>Hello c</div>
        </div>
      );
    });

    it('should swap items without re-rendering the rest', async () => {
      (globalThis as any).testCount = 0;
      const Cmp = component$(() => {
        const items = useSignal(['a', 'b', 'c']);
        return (
          <>
            <div id="loop">
              <Each
                items={items.value}
                key$={(item) => item}
                item$={(item) => {
                  (globalThis as any).testCount++;
                  return <div>Hello {item}</div>;
                }}
              />
            </div>
            <button
              onClick$={() => {
                items.value = ['c', 'b', 'a'];
              }}
            >
              Update
            </button>
          </>
        );
      });

      const { vNode, document } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <div id="loop">
              <Component ssr-required>
                <div>Hello a</div>
                <div>Hello b</div>
                <div>Hello c</div>
              </Component>
            </div>
            <button>Update</button>
          </Fragment>
        </Component>
      );
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello a</div>
          <div>Hello b</div>
          <div>Hello c</div>
        </div>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <div id="loop">
              <Component ssr-required>
                <div>Hello c</div>
                <div>Hello b</div>
                <div>Hello a</div>
              </Component>
            </div>
            <button>Update</button>
          </Fragment>
        </Component>
      );
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello c</div>
          <div>Hello b</div>
          <div>Hello a</div>
        </div>
      );
      expect((globalThis as any).testCount).toBe(3);
    });
  });

  describe('store', async () => {
    it('should update when a store-backed array shrinks in place', async () => {
      const Cmp = component$(() => {
        const items = useStore([
          { id: 1, label: 'Hello a' },
          { id: 2, label: 'Hello b' },
          { id: 3, label: 'Hello c' },
        ]);
        return (
          <>
            <div id="loop">
              <Each
                items={items}
                key$={(item) => String(item.id)}
                item$={(item) => <div>{item.label}</div>}
              />
            </div>
            <button onClick$={() => items.pop()}>Pop</button>
          </>
        );
      });

      const { document } = await render(<Cmp />, { debug });
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello a</div>
          <div>Hello b</div>
          <div>Hello c</div>
        </div>
      );

      await trigger(document.body, 'button', 'click');
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello a</div>
          <div>Hello b</div>
        </div>
      );

      await trigger(document.body, 'button', 'click');
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello a</div>
        </div>
      );

      await trigger(document.body, 'button', 'click');
      await expect(document.getElementById('loop')).toMatchDOM(<div id="loop"></div>);
    });

    it('should update each item', async () => {
      const Cmp = component$(() => {
        const items = useStore({
          value: ['a', 'b', 'c'],
        });
        return (
          <>
            <div id="loop">
              <Each
                items={items.value}
                key$={(item) => item}
                item$={(item) => <div>Hello {item}</div>}
              />
            </div>
            <button onClick$={() => (items.value = ['d', 'e', 'f'])}>Update</button>
          </>
        );
      });
      const { vNode, document } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <div id="loop">
              <Component ssr-required>
                <div>Hello a</div>
                <div>Hello b</div>
                <div>Hello c</div>
              </Component>
            </div>
            <button>Update</button>
          </Fragment>
        </Component>
      );
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello a</div>
          <div>Hello b</div>
          <div>Hello c</div>
        </div>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <div id="loop">
              <Component ssr-required>
                <div>Hello d</div>
                <div>Hello e</div>
                <div>Hello f</div>
              </Component>
            </div>
            <button>Update</button>
          </Fragment>
        </Component>
      );
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello d</div>
          <div>Hello e</div>
          <div>Hello f</div>
        </div>
      );
    });

    it('should keep reused keyed rows unchanged when item content changes', async () => {
      const Cmp = component$(() => {
        const items = useStore({
          value: [
            { id: 'a', label: 'Hello a' },
            { id: 'b', label: 'Hello b' },
            { id: 'c', label: 'Hello c' },
          ],
        });
        return (
          <>
            <div id="loop">
              <Each
                items={items.value}
                key$={(item) => item.id}
                item$={(item) => <div>{item.label}</div>}
              />
            </div>
            <button
              onClick$={() => {
                items.value = [
                  { id: 'a', label: 'Hello a' },
                  { id: 'b', label: 'Updated b' },
                  { id: 'c', label: 'Hello c' },
                ];
              }}
            >
              Update
            </button>
          </>
        );
      });

      const { document } = await render(<Cmp />, { debug });
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello a</div>
          <div>Hello b</div>
          <div>Hello c</div>
        </div>
      );
      await trigger(document.body, 'button', 'click');
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello a</div>
          <div>Hello b</div>
          <div>Hello c</div>
        </div>
      );
    });

    it('should swap items without re-rendering the rest', async () => {
      (globalThis as any).testCount = 0;
      const Cmp = component$(() => {
        const items = useStore({
          value: ['a', 'b', 'c'],
        });
        return (
          <>
            <div id="loop">
              <Each
                items={items.value}
                key$={(item) => item}
                item$={(item) => {
                  (globalThis as any).testCount++;
                  return <div>Hello {item}</div>;
                }}
              />
            </div>
            <button
              onClick$={() => {
                items.value = ['c', 'b', 'a'];
              }}
            >
              Update
            </button>
          </>
        );
      });

      const { vNode, document } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <div id="loop">
              <Component ssr-required>
                <div>Hello a</div>
                <div>Hello b</div>
                <div>Hello c</div>
              </Component>
            </div>
            <button>Update</button>
          </Fragment>
        </Component>
      );
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello a</div>
          <div>Hello b</div>
          <div>Hello c</div>
        </div>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <div id="loop">
              <Component ssr-required>
                <div>Hello c</div>
                <div>Hello b</div>
                <div>Hello a</div>
              </Component>
            </div>
            <button>Update</button>
          </Fragment>
        </Component>
      );
      await expect(document.getElementById('loop')).toMatchDOM(
        <div id="loop">
          <div>Hello c</div>
          <div>Hello b</div>
          <div>Hello a</div>
        </div>
      );
      expect((globalThis as any).testCount).toBe(3);
    });
  });
});
