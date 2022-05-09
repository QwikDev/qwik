import { h, Host, useStore } from '@builder.io/qwik';
import { useCleanup$, useClientEffect$, useWatch$ } from '../../core';
import { ElementFixture, trigger } from '../../testing/element-fixture';
import { expectDOM } from '../../testing/expect-dom.unit';
import { getTestPlatform } from '../../testing/platform';
import { useScopedStyles$, component$ } from '../component/component.public';
import { runtimeQrl } from '../import/qrl';
import { pauseContainer } from '../object/store.public';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useRef } from '../use/use-store.public';
import { ComponentScopedStyles, ComponentStylesPrefixContent } from '../util/markers';
import { useServerMount$ } from '../watch/watch.public';
import { Async, JSXPromise, PromiseValue } from './jsx/async.public';
import { Comment } from './jsx/jsx-runtime';
import { Slot } from './jsx/slot.public';
import { notifyRender } from './notify-render';
import { render } from './render.public';

describe('render', () => {
  let fixture: ElementFixture;
  beforeEach(() => (fixture = new ElementFixture()));
  describe('basic JSX', () => {
    it('should render basic content', async () => {
      await render(fixture.host, <div></div>);
      expectRendered(<div></div>);
      expect(fixture.host.getAttribute('q:version')).toEqual('');
      expect(fixture.host.getAttribute('q:container')).toEqual('resumed');

      pauseContainer(fixture.host);
      expect(fixture.host.getAttribute('q:container')).toEqual('paused');
    });

    it('should only render string/number', async () => {
      await render(
        fixture.host,
        <div>
          {'string'}
          {123}
          {false}
          {true}
          {null}
          {undefined}
          {[]}
          {function () {}}
        </div>
      );
      expectRendered(
        <div>
          {'string'}
          {'123'}
        </div>
      );
    });

    it('should serialize events correctly', async () => {
      await render(
        fixture.host,
        <div
          onMouseDown$={() => {}}
          onKeyUp$={() => {}}
          onDblClick$={() => {}}
          on-DblClick$={() => {}}
          onQVisible$={() => {}}
          document:onLoad$={() => {}}
          document:onScroll$={() => {}}
          document:on-Scroll$={() => {}}
          window:onScroll$={() => {}}
          window:on-Scroll$={() => {}}
        ></div>
      );
      const Div = 'div' as any;
      expectRendered(
        <Div
          on:mousedown="/runtimeQRL#*"
          on:keyup="/runtimeQRL#*"
          on:dblclick="/runtimeQRL#*"
          on:-dbl-click="/runtimeQRL#*"
          on:qvisible="/runtimeQRL#*"
          on-document:load="/runtimeQRL#*"
          on-document:scroll="/runtimeQRL#*"
          on-document:-scroll="/runtimeQRL#*"
          on-window:scroll="/runtimeQRL#*"
          on-window:-scroll="/runtimeQRL#*"
        ></Div>
      );
    });

    it('should render into a document', async () => {
      await render(
        fixture.document,
        <html>
          <body>WORKS</body>
        </html>
      );
      expect(fixture.document.body.innerHTML).toEqual('WORKS');
    });

    it('should render attributes', async () => {
      await render(fixture.host, <div id="abc" title="bar" preventDefault:click></div>);
      expectRendered(<div title="bar" id="abc"></div>);
    });

    it('should render style only for defined attributes', async () => {
      await render(
        fixture.host,
        <div id="both" style={{ color: 'red', display: 'block' }}>
          <div
            id="only-color"
            style={{ display: undefined as unknown as string, color: 'red' }}
          ></div>
          <div id="no-style" style={{ display: undefined as unknown as string }}></div>
        </div>
      );
      expectRendered(
        <div id="both" style="color:red;display:block">
          <div id="only-color" style="color:red"></div>
          <div id="no-style"></div>
        </div>
      );
    });

    it('should render children', async () => {
      await render(
        fixture.host,
        <div>
          <span>text</span>
        </div>
      );
      expectRendered(
        <div>
          <span>text</span>
        </div>
      );
    });

    it('should render svg', async () => {
      await render(
        fixture.host,
        <svg viewBox="0 0 100 100">
          <span>text</span>
        </svg>
      );
      expectRendered(
        <svg viewBox="0 0 100 100">
          <span>text</span>
        </svg>
      );
    });
  });

  describe('component', () => {
    it('should render a component', async () => {
      await render(fixture.host, <HelloWorld name="World" />);
      expectRendered(
        <hello-world>
          <span>
            {'Hello'} {'World'}
          </span>
        </hello-world>
      );
    });

    it('should render component external props', async () => {
      await render(
        fixture.host,
        <RenderProps
          thing="World"
          class="foo"
          id="123"
          q:slot="start"
          aria-hidden="true"
          data-value="hello world"
          key={'special'}
          host:title="Custom title"
          host:onClick$={() => {}}
          host:on-ClicK$={() => {}}
          document:onLoad$={() => {}}
          window:onScroll$={() => {}}
        />
      );
      expectRendered(
        <render-props
          q:obj=""
          q:host=""
          q:slot="start"
          q:key="special"
          class="foo"
          id="123"
          aria-hidden="true"
          data-value="hello world"
          title="Custom title"
          on:click="/runtimeQRL#*"
          on:-clic-k="/runtimeQRL#*"
          on-document:load="/runtimeQRL#*"
          on-window:scroll="/runtimeQRL#*"
        >
          <span>{'{"thing":"World"}'}</span>
        </render-props>
      );
    });

    it('should render a blank component', async () => {
      await render(fixture.host, <InnerHTMLComponent />);
      expectRendered(
        <div>
          <div>
            <span>WORKS</span>
          </div>
        </div>
      );
      notifyRender(getFirstNode(fixture.host));
      await getTestPlatform(fixture.document).flush();
      expectRendered(
        <div>
          <div>
            <span>WORKS</span>
          </div>
        </div>
      );
    });

    describe('handlers', () => {
      it('should process clicks', async () => {
        await render(fixture.host, <Counter step={5} />);
        expectRendered(
          <div>
            <button>-</button>
            <span>0</span>
            <button>+</button>
          </div>
        );
        await trigger(fixture.host, 'button.increment', 'click');
        expectRendered(
          <div>
            <button>-</button>
            <span>5</span>
            <button>+</button>
          </div>
        );
      });
    });
  });

  describe('<Slot>', () => {
    it('should project no content', async () => {
      await render(fixture.host, <Project></Project>);
      expectRendered(
        <project>
          <section>
            <q:slot>
              <q:fallback>..default..</q:fallback>
            </q:slot>
            <q:slot name="details">
              <q:fallback>..details..</q:fallback>
            </q:slot>
            <q:slot name="description">
              <q:fallback>..description..</q:fallback>
            </q:slot>
          </section>
        </project>
      );
    });

    it('should project un-named slot text', async () => {
      await render(fixture.host, <Project>projection</Project>);
      expectRendered(
        <project>
          <section>
            <q:slot>
              <q:fallback>..default..</q:fallback>
              projection
            </q:slot>
            <q:slot name="details">
              <q:fallback>..details..</q:fallback>
            </q:slot>
            <q:slot name="description">
              <q:fallback>..description..</q:fallback>
            </q:slot>
          </section>
        </project>
      );
    });

    it('should project un-named slot component', async () => {
      await render(
        fixture.host,
        <Project>
          <HelloWorld />
        </Project>
      );
    });

    it('should project named slot component', async () => {
      await render(
        fixture.host,
        <Project>
          PROJECTION
          <span q:slot="details">DETAILS</span>
          <span q:slot="description">DESCRIPTION</span>
        </Project>
      );
      expectRendered(
        <project>
          <section>
            <q:slot>
              <q:fallback>..default..</q:fallback>
              PROJECTION
            </q:slot>
            <q:slot name="details">
              <q:fallback>..details..</q:fallback>
              <span q:slot="details">DETAILS</span>
            </q:slot>
            <q:slot name="description">
              <q:fallback>..description..</q:fallback>
              <span q:slot="description">DESCRIPTION</span>
            </q:slot>
          </section>
        </project>
      );
    });

    it.todo('should render nested component when it is projected by parent');
    it('should project multiple slot with same name', async () => {
      await render(
        fixture.host,
        <Project>
          <span q:slot="details">DETAILS1</span>
          <span q:slot="details">DETAILS2</span>
          <span q:slot="ignore">IGNORE</span>
        </Project>
      );
      expectRendered(
        <project>
          <template q:slot="ignore">
            <span q:slot="ignore">IGNORE</span>
          </template>
          <section>
            <q:slot>
              <q:fallback>..default..</q:fallback>
            </q:slot>
            <q:slot name="details">
              <q:fallback>..details..</q:fallback>
              <span q:slot="details">DETAILS1</span>
              <span q:slot="details">DETAILS2</span>
            </q:slot>
            <q:slot name="description">
              <q:fallback>..description..</q:fallback>
            </q:slot>
          </section>
        </project>
      );
    });
    it('should not destroy projection when <Project> reruns', async () => {
      await render(
        fixture.host,
        <SimpleProject>
          <span>PROJECTION</span>
        </SimpleProject>
      );
      expectRendered(
        <project>
          <section>
            <q:slot>
              <q:fallback>..default..</q:fallback>
              <span>PROJECTION</span>
            </q:slot>
          </section>
        </project>
      );
      notifyRender(getFirstNode(fixture.host));
      await getTestPlatform(fixture.document).flush();
      expectRendered(
        <project>
          <section>
            <q:slot>
              <q:fallback>..default..</q:fallback>
              <span>PROJECTION</span>
            </q:slot>
          </section>
        </project>
      );
    });
  });
  describe('<Host>', () => {
    it('should render into host component', async () => {
      await render(
        fixture.host,
        <HostFixture
          hostAttrs={JSON.stringify({
            id: 'TEST',
            class: { thing: true },
            name: 'NAME',
          })}
          content="CONTENT"
        />
      );
      expectRendered(
        <host-fixture id="TEST" name="NAME" class="thing">
          CONTENT
        </host-fixture>
      );
    });
  });

  describe.skip('<Async>', () => {
    it('should render a promise', async () => {
      await render(fixture.host, <div>{Promise.resolve('WORKS')}</div>);
      expectRendered(
        <div>
          {/<node:.*>/}
          WORKS
          {/<\/node:.*>/}
        </div>
      );
    });

    it('should render pending then resolution', async () => {
      let resolve: (_: string | PromiseLike<string>) => void;
      const promise = new Promise<string>((res) => (resolve = res)) as JSXPromise<string>;
      promise.whilePending = 'pending...';
      await render(fixture.host, <div>{promise}</div>);
      expectRendered(
        <div>
          {/<node:.*>/}
          pending...
          {/<\/node:.*>/}
        </div>
      );
      await resolve!('WORKS');
      expectRendered(
        <div>
          {/<node:.*>/}
          WORKS
          {/<\/node:.*>/}
        </div>
      );
    });

    it('should render pending then rejection', async () => {
      let resolve: (_: string | PromiseLike<string>) => void;
      const promise = new Promise<string>((res) => (resolve = res)) as JSXPromise<string>;
      promise.whilePending = 'pending...';
      await render(fixture.host, <div>{promise}</div>);
      expectRendered(
        <div>
          {/<node:.*>/}
          pending...
          {/<\/node:.*>/}
        </div>
      );
      await resolve!(Promise.reject('REJECTION'));
      await delay(0);
      expectRendered(
        <div>
          {/<node:.*>/}
          REJECTION
          {/<\/node:.*>/}
        </div>
      );
    });

    it('should render', async () => {
      let resolve: (value: string | PromiseLike<string>) => void;
      const promise = new Promise<string>((res) => (resolve = res));
      await render(
        fixture.host,
        <div>
          <Async resolve={promise}>
            {(promise: PromiseValue<string>) => (
              <>{promise.isPending ? 'pending' : promise.value}</>
            )}
          </Async>
        </div>
      );
      expectRendered(
        <div>
          {/<node:.*>/}
          pending
          {/<\/node:.*>/}
        </div>
      );
      await resolve!('WORKS');
      await delay(0);
      expectRendered(
        <div>
          {/<node:.*>/}
          WORKS
          {/<\/node:.*>/}
        </div>
      );
    });
  });

  it('should render comment', async () => {
    await render(
      fixture.host,
      <div>
        <Comment text="Some comment"></Comment>
      </div>
    );
    expectRendered(
      <div>
        <Comment text="Some comment"></Comment>
      </div>
    );
  });

  it('should render a component with hooks', async () => {
    await render(fixture.host, <Hooks />);
    expectRendered(
      <div>
        <div id="effect"></div>
        <div id="effect-destroy"></div>

        <div id="watch">true</div>
        <div id="watch-destroy"></div>

        <div id="server-mount">true</div>
        <div id="cleanup"></div>

        <div id="reference">true</div>
      </div>
    );

    pauseContainer(fixture.host);
    expectRendered(
      <div>
        <div id="effect"></div>
        <div id="effect-destroy"></div>

        <div id="watch">true</div>
        <div id="watch-destroy">true</div>

        <div id="server-mount">true</div>
        <div id="cleanup">true</div>

        <div id="reference">true</div>
      </div>
    );
  });

  describe('styling', () => {
    it('should insert a style', async () => {
      await render(fixture.host, <HelloWorld name="World" />);
      const hellWorld = fixture.host.querySelector('hello-world')!;
      const scopedStyleId = hellWorld.getAttribute(ComponentScopedStyles);
      expect(scopedStyleId).toBeDefined();
      const style = fixture.document.body.parentElement!.querySelector(
        `style[q\\:style="${scopedStyleId}"]`
      );
      expect(style?.textContent).toContain('color: red');
      expectRendered(
        <hello-world>
          <span class={ComponentStylesPrefixContent + scopedStyleId}>
            {'Hello'} {'World'}
          </span>
        </hello-world>
      );
    });
  });

  describe('SVG element', () => {
    it('should render #text nodes', async () => {
      const lines = ['hola', 'adios'];
      await render(
        fixture.host,
        <svg viewBox="0 0 100 4" class={'svg-container'}>
          {lines.map((a) => {
            return (
              <text class={'svg-text'} style={{ color: a }}>
                Hola {a}
              </text>
            );
          })}
        </svg>
      );
      expectRendered(
        <svg viewBox="0 0 100 4" class="svg-container">
          <text class={'svg-text'} style="color:hola">
            Hola {'hola'}
          </text>
          <text class={'svg-text'} style="color:adios">
            Hola {'adios'}
          </text>
        </svg>
      );

      // Ensure all SVG elements have the SVG namespace
      const namespaces = Array.from(fixture.host.querySelectorAll('text')).map(
        (e: any) => e.namespaceURI
      );
      expect(namespaces).toEqual(['http://www.w3.org/2000/svg', 'http://www.w3.org/2000/svg']);
    });

    it('should render camelCase attributes', async () => {
      await render(
        fixture.host,
        <svg id="my-svg" viewBox="0 0 100 4" preserveAspectRatio="none">
          <a href="/path"></a>
        </svg>
      );
      expectRendered(
        <svg id="my-svg" preserveAspectRatio="none" viewBox="0 0 100 4">
          <a href="/path"></a>
        </svg>
      );
    });

    it('should render path', async () => {
      await render(
        fixture.host,
        <div>
          <a href="#">Dude!!</a>
          <svg id="my-svg" viewBox="0 0 100 4" preserveAspectRatio="none">
            <path
              id="my-svg-path"
              d="M 0,2 L 100,2"
              stroke="#FFEA82"
              stroke-width="4"
              fill-opacity="0"
            />
          </svg>
        </div>
      );
      expectRendered(
        <div>
          <a href="#">Dude!!</a>
          <svg id="my-svg" viewBox="0 0 100 4" preserveAspectRatio="none">
            <path
              id="my-svg-path"
              d="M 0,2 L 100,2"
              stroke="#FFEA82"
              stroke-width="4"
              fill-opacity="0"
            />
          </svg>
        </div>
      );
    });

    it('should render foreignObject properly', async () => {
      const Text = 'text' as any;
      await render(
        fixture.host,
        <div class="is-html">
          <Text class="is-html" shouldKebab="true">
            Start
          </Text>
          <svg class="is-svg" preserveAspectRatio="true">
            <Text class="is-svg" shouldCamelCase="true">
              start
            </Text>
            <foreignObject class="is-svg">
              <div class="is-html">hello</div>
              <svg class="is-svg">
                <feGaussianBlur class="is-svg"></feGaussianBlur>
                <foreignObject class="is-svg">
                  <foreignObject class="is-html"></foreignObject>
                  <div class="is-html">Still outside svg</div>
                </foreignObject>
              </svg>
              <feGaussianBlur class="is-html">bye</feGaussianBlur>
            </foreignObject>
            <text className="is-svg">Hello</text>
            <text className="is-svg">Bye</text>
          </svg>
          <text class="is-html">end</text>
        </div>
      );
      for (const el of Array.from(fixture.host.querySelectorAll('.is-html'))) {
        expect(el).toMatchObject({ namespaceURI: 'http://www.w3.org/1999/xhtml' });
      }
      for (const el of Array.from(fixture.host.querySelectorAll('.is-svg'))) {
        expect(el).toMatchObject({ namespaceURI: 'http://www.w3.org/2000/svg' });
      }

      expectRendered(
        <div class="is-html">
          <Text class="is-html" shouldkebab="true">
            Start
          </Text>
          <svg class="is-svg" preserveAspectRatio="true">
            <Text class="is-svg" shouldCamelCase="true">
              start
            </Text>
            <foreignObject class="is-svg">
              <div class="is-html">hello</div>
              <svg class="is-svg">
                <feGaussianBlur class="is-svg"></feGaussianBlur>
                <foreignObject class="is-svg">
                  <foreignobject class="is-html"></foreignobject>
                  <div class="is-html">Still outside svg</div>
                </foreignObject>
              </svg>
              <fegaussianblur class="is-html">bye</fegaussianblur>
            </foreignObject>
            <text class="is-svg">Hello</text>
            <text class="is-svg">Bye</text>
          </svg>
          <text class="is-html">end</text>
        </div>
      );
    });
  });

  function expectRendered(expected: h.JSX.Element, expectedErrors: string[] = []) {
    const firstNode = getFirstNode(fixture.host);
    return expectDOM(firstNode, expected, expectedErrors);
  }
});

function getFirstNode(el: Element) {
  let firstNode = el.firstElementChild!;
  while (firstNode.nodeName === 'STYLE') {
    firstNode = firstNode.nextElementSibling!;
  }
  return firstNode;
}
//////////////////////////////////////////////////////////////////////////////////////////
// Hello World
//////////////////////////////////////////////////////////////////////////////////////////
export const HelloWorld = component$(
  (props: { name?: string }) => {
    useScopedStyles$(`span.� { color: red; }`);
    const state = useStore({ salutation: 'Hello' });
    return (
      <span>
        {state.salutation} {props.name || 'World'}
      </span>
    );
  },
  {
    tagName: 'hello-world',
  }
);

//////////////////////////////////////////////////////////////////////////////////////////
// Hello World
//////////////////////////////////////////////////////////////////////////////////////////
export const RenderProps = component$(
  (props: { thing?: string }) => {
    return (
      <Host>
        <span>{JSON.stringify(props)}</span>
      </Host>
    );
  },
  {
    tagName: 'render-props',
  }
);

//////////////////////////////////////////////////////////////////////////////////////////
// Counter
//////////////////////////////////////////////////////////////////////////////////////////

export const Counter = component$((props: { step?: number }) => {
  const state = useStore({ count: 0 });
  const step = Number(props.step || 1);
  return (
    <>
      <button class="decrement" onClickQrl={runtimeQrl(Counter_add, [state, { value: -step }])}>
        -
      </button>
      <span>{state.count}</span>
      <button class="increment" onClickQrl={runtimeQrl(Counter_add, [state, { value: step }])}>
        +
      </button>
    </>
  );
});
export const Counter_add = () => {
  const [state, args] = useLexicalScope();
  state.count += args.value;
};

//////////////////////////////////////////////////////////////////////////////////////////
// Project
//////////////////////////////////////////////////////////////////////////////////////////
export const Project = component$(
  () => {
    return (
      <section>
        <Slot>..default..</Slot>
        <Slot name="details">..details..</Slot>
        <Slot name="description">..description..</Slot>
      </section>
    );
  },
  {
    tagName: 'project',
  }
);

export const SimpleProject = component$(
  () => {
    return (
      <section>
        <Slot>..default..</Slot>
      </section>
    );
  },
  {
    tagName: 'project',
  }
);

//////////////////////////////////////////////////////////////////////////////////////////
// HostFixture
//////////////////////////////////////////////////////////////////////////////////////////
export const HostFixture = component$(
  (props: { hostAttrs?: string; content?: string }) => {
    return <Host {...JSON.parse(props.hostAttrs || '{}')}>{props.content}</Host>;
  },
  {
    tagName: 'host-fixture',
  }
);

function delay(time: number) {
  return new Promise((res) => setTimeout(res, time));
}

//////////////////////////////////////////////////////////////////////////////////////////
export const InnerHTMLComponent = component$(async () => {
  const html = '<span>WORKS</span>';
  return (
    <div innerHTML={html}>
      <div>not rendered</div>
    </div>
  );
});

//////////////////////////////////////////////////////////////////////////////////////////
export const Hooks = component$(() => {
  const watchDestroyDiv = useRef();
  const effectDiv = useRef();
  const effectDestroyDiv = useRef();
  const cleanupDiv = useRef();

  const state = useStore({
    watch: 'false',
    server: 'false',
  });

  useCleanup$(() => {
    cleanupDiv.current!.textContent = 'true';
  });

  useWatch$(() => {
    state.watch = 'true';
    return () => {
      watchDestroyDiv.current!.textContent = 'true';
    };
  });

  useClientEffect$(() => {
    effectDiv.current!.textContent = 'true';
    return () => {
      effectDestroyDiv.current!.textContent = 'true';
    };
  });

  useServerMount$(() => {
    state.server = 'true';
  });

  return (
    <Host>
      <div id="effect" ref={effectDiv}></div>
      <div id="effect-destroy" ref={effectDestroyDiv}></div>

      <div id="watch">{state.watch}</div>
      <div id="watch-destroy" ref={watchDestroyDiv}></div>

      <div id="server-mount">{state.server}</div>
      <div id="cleanup" ref={cleanupDiv}></div>

      <div id="reference">true</div>
    </Host>
  );
});
