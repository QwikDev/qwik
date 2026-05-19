import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import {
  component$,
  useSignal,
  useStore,
  Fragment as Component,
  Fragment as Projection,
  Fragment as Signal,
  Fragment,
  type PropsOf,
  useComputed$,
  createContextId,
  useContext,
  useContextProvider,
  $,
  Slot,
} from '@qwik.dev/core';
import { QContainerAttr } from '../shared/utils/markers';
import { QContainerValue } from '../shared/types';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: attributes', ({ render }) => {
  it('should render boolean and number attributes', async () => {
    const AttrComp = component$(() => {
      const required = useSignal(false);
      const state = useStore({
        dataAria: true,
      });

      return (
        <>
          <button id="req" onClick$={() => (required.value = !required.value)}></button>
          <input
            id="input"
            required={required.value}
            aria-hidden={state.dataAria}
            aria-required="false"
            draggable={required.value}
            spellcheck={required.value}
            tabIndex={-1}
          />
        </>
      );
    });

    const { vNode, document } = await render(<AttrComp />, { debug });

    await expect(document.body.querySelector('input')).toMatchDOM(
      <input
        id="input"
        aria-hidden="true"
        aria-required="false"
        draggable={false}
        spellcheck={false}
        tabIndex={-1}
      />
    );
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button id="req"></button>
          <input
            id="input"
            aria-hidden="true"
            aria-required="false"
            draggable={false}
            spellcheck={false}
            tabIndex={-1}
          />
        </Fragment>
      </Component>
    );

    await trigger(document.body, '#req', 'click');

    await expect(document.body.querySelector('input')).toMatchDOM(
      <input
        id="input"
        required={true}
        aria-hidden="true"
        aria-required="false"
        draggable={true}
        spellcheck={true}
        tabIndex={-1}
      />
    );
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button id="req"></button>
          <input
            id="input"
            required={true}
            aria-hidden="true"
            aria-required="false"
            draggable={true}
            spellcheck={true}
            tabIndex={-1}
          />
        </Fragment>
      </Component>
    );

    await trigger(document.body, '#req', 'click');

    await expect(document.body.querySelector('input')).toMatchDOM(
      <input
        id="input"
        aria-hidden="true"
        aria-required="false"
        draggable={false}
        spellcheck={false}
        tabIndex={-1}
      />
    );
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button id="req"></button>
          <input
            id="input"
            aria-hidden="true"
            aria-required="false"
            draggable={false}
            spellcheck={false}
            tabIndex={-1}
          />
        </Fragment>
      </Component>
    );
  });

  describe('binding', () => {
    it('should bind checked attribute', async () => {
      const BindCmp = component$(() => {
        const show = useSignal(false);
        return (
          <>
            <label for="toggle">
              <input type="checkbox" bind:checked={show} />
              Show conditional
            </label>
            <div>{show.value.toString()}</div>
          </>
        );
      });

      const { vNode, document } = await render(<BindCmp />, { debug });

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <label for="toggle">
              <input type="checkbox" checked={false} />
              {'Show conditional'}
            </label>
            <div>false</div>
          </Fragment>
        </Component>
      );

      // simulate checkbox click
      const input = document.querySelector('input')!;
      input.checked = true;
      await trigger(document.body, 'input', 'input');

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <label for="toggle">
              <input type="checkbox" checked={true} />
              {'Show conditional'}
            </label>
            <div>true</div>
          </Fragment>
        </Component>
      );
    });

    it('should bind textarea value', async () => {
      const Cmp = component$(() => {
        const value = useSignal('123');
        return (
          <div>
            <textarea bind:value={value} />
            <input bind:value={value} />
          </div>
        );
      });
      const { document } = await render(<Cmp />, { debug });

      const qContainerAttr =
        render === ssrRenderToDom ? { [QContainerAttr]: QContainerValue.TEXT } : {};

      await expect(document.querySelector('div')).toMatchDOM(
        <div>
          <textarea {...qContainerAttr}>123</textarea>
          <input value="123" />
        </div>
      );

      // simulate input
      const textarea = document.querySelector('textarea')!;
      textarea.value = 'abcd';
      await trigger(document.body, textarea, 'input');

      await expect(document.querySelector('div')).toMatchDOM(
        <div>
          <textarea {...qContainerAttr}>abcd</textarea>
          <input value="abcd" />
        </div>
      );
    });
  });

  it('should render preventdefault attribute', async () => {
    const Cmp = component$(() => {
      const show = useSignal(false);
      return (
        <>
          <button onClick$={() => (show.value = !show.value)}></button>
          <span preventdefault:click></span>
          {show.value && <div preventdefault:click></div>}
        </>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <span preventdefault:click></span>
          {''}
        </Fragment>
      </Component>
    );
    await expect(document.querySelector('span')).toMatchDOM(
      // @ts-ignore-next-line
      <span preventdefault:click=""></span>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <span preventdefault:click></span>
          <div preventdefault:click></div>
        </Fragment>
      </Component>
    );

    await expect(document.querySelector('span')).toMatchDOM(
      // @ts-ignore-next-line
      <span preventdefault:click=""></span>
    );

    await expect(document.querySelector('div')).toMatchDOM(
      // @ts-ignore-next-line
      <div preventdefault:click=""></div>
    );
  });

  it('should update var prop attribute', async () => {
    const Cmp = component$(() => {
      const counter = useSignal(0);
      const props = { 'data-bar': counter.value };
      return <button data-foo={counter.value} {...props} onClick$={() => counter.value++}></button>;
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button data-foo="0" data-bar="0"></button>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <button data-foo="2" data-bar="2"></button>
      </Component>
    );
  });

  it('should add and remove attribute', async () => {
    const Cmp = component$(() => {
      const hide = useSignal(false);
      const required = useSignal(true);
      return (
        <>
          <button
            onClick$={() => {
              hide.value = !hide.value;
            }}
          ></button>
          <span onClick$={() => (required.value = !required.value)}></span>
          {hide.value ? <input id="input" /> : <input id="input" attr-test={required.value} />}
        </>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <span></span>
          <input id="input" attr-test={true} />
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <span></span>
          <input id="input" />
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <span></span>
          <input id="input" attr-test={true} />
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'span', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <span></span>
          <input id="input" attr-test={false} />
        </Fragment>
      </Component>
    );
  });

  it('should update signal-based var prop', async () => {
    const PasswordInput = component$<PropsOf<'input'>>((props) => {
      const showPassword = useSignal<boolean>(false);
      const inputType = useComputed$(() => (showPassword.value ? 'text' : 'password'));
      return (
        <>
          <input type={inputType.value} {...props} />
          <button
            onClick$={() => {
              showPassword.value = !showPassword.value;
            }}
          ></button>
        </>
      );
    });

    const { vNode, document } = await render(<PasswordInput />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <input type="password" />
          <button></button>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <input type="text" />
          <button></button>
        </Fragment>
      </Component>
    );
  });

  it('should add and remove var props on destination vnode', async () => {
    const Tab = component$((props: any) => {
      return <button {...props} onClick$={() => props.onClick$()}></button>;
    });

    const Wrapper = component$(() => {
      const selected = useSignal(0);
      return (
        <>
          <Tab
            data-selected={selected.value === 0}
            id="button-0"
            onClick$={() => (selected.value = 0)}
          />
          <Tab
            data-selected={selected.value === 1}
            id="button-1"
            onClick$={() => (selected.value = 1)}
          />
        </>
      );
    });

    const { vNode, document } = await render(<Wrapper />, { debug });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment>
          <Component>
            <button data-selected id="button-0"></button>
          </Component>
          <Component>
            <button id="button-1"></button>
          </Component>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button[id=button-1]', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment>
          <Component>
            <button id="button-0"></button>
          </Component>
          <Component>
            <button data-selected id="button-1"></button>
          </Component>
        </Fragment>
      </Component>
    );
  });

  it('should render array of classes from rest props', async () => {
    const ctxId = createContextId<any>('abcd');
    const TabCmp = component$<any>(({ tabId, ...props }) => {
      const ctxObj = useContext(ctxId);

      const computedClass = useComputed$(() => {
        return ctxObj.selected.value === Number(tabId) ? 'selected' : '';
      });

      return (
        <button
          id={tabId}
          onClick$={() => ctxObj.onSelect$(tabId)}
          class={[props.class, computedClass.value]}
        >
          <Slot />
        </button>
      );
    });

    const ParentComponent = component$(() => {
      const selected = useSignal(0);
      const ctxObj = {
        selected,
        onSelect$: $((tabId: number) => {
          selected.value = Number(tabId);
        }),
      };
      useContextProvider(ctxId, ctxObj);
      return (
        <>
          {selected.value}
          <TabCmp tabId={0} class={selected.value === 0 ? 'custom' : ''}>
            TAB 1
          </TabCmp>
          <TabCmp tabId={1} class={selected.value === 1 ? 'custom' : ''}>
            TAB 2
          </TabCmp>
        </>
      );
    });

    const { vNode, document } = await render(<ParentComponent />, { debug });

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Signal ssr-required>0</Signal>
          <Component ssr-required>
            <button id="0" class="custom selected">
              <Projection ssr-required>TAB 1</Projection>
            </button>
          </Component>
          <Component ssr-required>
            <button id="1" class="">
              <Projection ssr-required>TAB 2</Projection>
            </button>
          </Component>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button[id=1]', 'click');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Signal ssr-required>1</Signal>
          <Component ssr-required>
            <button id="0" class="">
              <Projection ssr-required>TAB 1</Projection>
            </button>
          </Component>
          <Component ssr-required>
            <button id="1" class="custom selected">
              <Projection ssr-required>TAB 2</Projection>
            </button>
          </Component>
        </Fragment>
      </Component>
    );
  });

  describe('spread props', () => {
    describe('class attribute from component props', () => {
      it('should use class attribute from element', async () => {
        const Cmp = component$((props: PropsOf<'div'>) => {
          return <div {...props} class={[props.class, 'component']} />;
        });

        const Parent = component$(() => {
          return <Cmp class="test" />;
        });

        const { vNode } = await render(<Parent />, { debug });
        expect(vNode).toMatchVDOM(
          <Component>
            <Component>
              <div class="test component"></div>
            </Component>
          </Component>
        );
      });

      it('should use class attribute from props', async () => {
        const Cmp = component$((props: PropsOf<'div'>) => {
          return <div class={[props.class, 'component']} {...props} />;
        });

        const Parent = component$(() => {
          return <Cmp class="test" />;
        });

        const { vNode } = await render(<Parent />, { debug });
        expect(vNode).toMatchVDOM(
          <Component>
            <Component>
              <div class="test"></div>
            </Component>
          </Component>
        );
      });
    });

    describe('class attribute without component props', () => {
      it('should use class attribute from props', async () => {
        const Cmp = component$((props: PropsOf<'div'>) => {
          return <div class="test component" {...props} />;
        });

        const Parent = component$(() => {
          return <Cmp class="test" />;
        });

        const { vNode } = await render(<Parent />, { debug });
        expect(vNode).toMatchVDOM(
          <Component>
            <Component>
              <div class="test"></div>
            </Component>
          </Component>
        );
      });

      it('should use class attribute from element', async () => {
        const Cmp = component$((props: PropsOf<'div'>) => {
          return <div {...props} class="test component" />;
        });

        const Parent = component$(() => {
          return <Cmp class="test" />;
        });

        const { vNode } = await render(<Parent />, { debug });
        expect(vNode).toMatchVDOM(
          <Component>
            <Component>
              <div class="test component"></div>
            </Component>
          </Component>
        );
      });
    });

    it('should handle multiple spread component props', async () => {
      const Cmp = component$((props: PropsOf<'div'>) => {
        return <div {...props} class="test component" {...props} />;
      });

      const Parent = component$(() => {
        return <Cmp class="test" />;
      });

      const { vNode } = await render(<Parent />, { debug });

      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <div class="test"></div>
          </Component>
        </Component>
      );
    });

    it('should handle multiple spread component and element props', async () => {
      const Cmp = component$((props: PropsOf<'div'>) => {
        const attrs: Record<string, any> = {
          class: 'test2',
        };
        return <div {...props} class="test component" {...attrs} />;
      });

      const Parent = component$(() => {
        return <Cmp class="test" />;
      });

      const { vNode } = await render(<Parent />, { debug });

      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <div class="test2"></div>
          </Component>
        </Component>
      );
    });

    it('should handle multiple spread element and component props', async () => {
      const Cmp = component$((props: PropsOf<'div'>) => {
        const attrs: Record<string, any> = {
          class: 'test2',
        };
        return <div {...attrs} class="test component" {...props} />;
      });

      const Parent = component$(() => {
        return <Cmp class="test" />;
      });

      const { vNode } = await render(<Parent />, { debug });

      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <div class="test"></div>
          </Component>
        </Component>
      );
    });

    it('should handle multiple spread element and component props before normal props', async () => {
      const Cmp = component$((props: PropsOf<'div'>) => {
        const attrs: Record<string, any> = {
          class: 'test2',
        };
        return <div {...attrs} {...props} class="test component" />;
      });

      const Parent = component$(() => {
        return <Cmp class="test" />;
      });

      const { vNode } = await render(<Parent />, { debug });

      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <div class="test component"></div>
          </Component>
        </Component>
      );
    });

    it('should handle multiple spread element and component props after normal props', async () => {
      const Cmp = component$((props: PropsOf<'div'>) => {
        const attrs: Record<string, any> = {
          class: 'test2',
        };
        return <div class="test component" {...props} {...attrs} />;
      });

      const Parent = component$(() => {
        return <Cmp class="test" />;
      });

      const { vNode } = await render(<Parent />, { debug });

      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <div class="test2"></div>
          </Component>
        </Component>
      );
    });
  });

  describe('class attribute', () => {
    it('should render class attribute', async () => {
      const Cmp = component$(() => {
        return <span class="test-class"></span>;
      });

      const { vNode } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <span class="test-class"></span>
        </Component>
      );
    });

    it('should trim class attribute value', async () => {
      const Cmp = component$(() => {
        return <span class="   test-class   "></span>;
      });

      const { vNode } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <span class="test-class"></span>
        </Component>
      );
    });

    it('should render class attribute from signal', async () => {
      const Cmp = component$(() => {
        const sigValue = useSignal('testA');
        return <button class={sigValue.value}></button>;
      });

      const { vNode } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button class="testA"></button>
        </Component>
      );
    });

    it('should render class attribute from array of strings', async () => {
      const Cmp = component$(() => {
        return <button class={['testA', 'testB']}></button>;
      });

      const { vNode } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button class="testA testB"></button>
        </Component>
      );
    });

    it('should render class attribute from array of mixed signals and strings', async () => {
      const Cmp = component$(() => {
        const sigValue = useSignal('testA');
        return <button class={[sigValue.value, 'testB']}></button>;
      });

      const { vNode } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button class="testA testB"></button>
        </Component>
      );
    });

    it('should render class attribute from objects ', async () => {
      const Cmp = component$(() => {
        return (
          <button
            class={{
              testA: true,
              testB: false,
            }}
          ></button>
        );
      });

      const { vNode } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button class="testA"></button>
        </Component>
      );
    });

    it('should render class attribute from object', async () => {
      const Cmp = component$(() => {
        const renderClass = useSignal(true);
        return (
          <button
            class={{
              testA: true,
              testB: false,
              toggle: renderClass.value,
            }}
            onClick$={() => (renderClass.value = !renderClass.value)}
          ></button>
        );
      });

      const { vNode, document } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button class="testA toggle"></button>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button class="testA"></button>
        </Component>
      );
    });
  });
});
