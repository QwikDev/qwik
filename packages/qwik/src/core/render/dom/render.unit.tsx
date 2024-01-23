import { ElementFixture, trigger } from '../../../testing/element-fixture';
import { expectDOM } from '../../../testing/expect-dom';
import { component$ } from '../../component/component.public';
import { inlinedQrl } from '../../qrl/qrl';
import { useLexicalScope } from '../../use/use-lexical-scope.public';
import { useStore } from '../../use/use-store.public';
import { useVisibleTask$, useTask$ } from '../../use/use-task';
import { useOn } from '../../use/use-on';
import { Slot } from '../jsx/slot.public';
import { render } from './render.public';
import { useStylesQrl, useStylesScopedQrl } from '../../use/use-styles';
import { pauseContainer } from '../../container/pause';
import { useSignal } from '../../use/use-signal';
import { assert, test, suite } from 'vitest';
import { createDOM } from '../../../testing/library';
import { renderToString } from '../../../server/render';
import { createDocument } from '../../../testing/document';

test('should render basic content', async () => {
  const fixture = new ElementFixture();
  await render(fixture.host, <div></div>);
  await expectRendered(fixture, '<div></div>');
  assert.equal(fixture.host.getAttribute('q:version'), 'dev');
  assert.equal(fixture.host.getAttribute('q:container'), 'resumed');

  await pauseContainer(fixture.host);
  assert.equal(fixture.host.getAttribute('q:container'), 'paused');
});

test('should only render string/number', async () => {
  const fixture = new ElementFixture();
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
    </div>
  );
  await expectRendered(fixture, '<div>string123</div>');
});

test('should serialize events correctly', async () => {
  const fixture = new ElementFixture();
  await render(
    fixture.host,
    <div
      onMouseDown$={() => {}}
      onKeyUp$={() => {}}
      onDblClick$={() => {}}
      on-DblClick$={() => {}}
      onQVisible$={() => {}}
      document:onLoad$={() => {}}
      document:onThing$={() => {}}
      document:on-Thing$={() => {}}
      window:onScroll$={() => {}}
      window:on-Scroll$={() => {}}
    ></div>
  );
  await expectRendered(
    fixture,
    `
      <div
        on-document:load=""
        on-document:thing=""
        on-document:-thing=""
        on-window:scroll=""
        on-window:-scroll=""
    ></div>
    `
  );
});
test('should serialize boolean attributes correctly', async () => {
  const fixture = new ElementFixture();
  await render(fixture.host, <input required={true} disabled={false}></input>);
  await expectRendered(fixture, '<input required="" />');
});

test('should render aria', async () => {
  const fixture = new ElementFixture();
  await render(
    fixture.host,
    <div
      id="abc"
      title="bar"
      aria-required={true}
      aria-busy={false}
      role=""
      preventdefault:click
      aria-hidden={undefined}
    ></div>
  );
  await expectRendered(
    fixture,
    '<div id="abc" title="bar" aria-required="true" aria-busy="false" role="" preventdefault:click=""></div>'
  );
});

test('should render into a document', async () => {
  const fixture = new ElementFixture();
  fixture.document.head.appendChild(fixture.document.createElement('existing'));
  await render(
    fixture.document,
    <Transparent>
      <head>
        <title>Replace</title>
        <div>
          <div></div>
        </div>
      </head>
      <body>WORKS</body>
    </Transparent>
  );
  await expectDOM(
    fixture.document.documentElement,
    `
  <html q:version="dev" q:container="resumed" q:render="dom-dev">
  <!--qv -->
  <!--qv q:key q:sref=0 q:s-->
    <head>
      <title></title>
      <existing></existing>
      <title>Replace</title>
      <div><div></div></div>
    </head>
    <body>
      WORKS
    </body>
    <!--/qv-->
    <!--/qv-->
  </html>`
  );
});

test('should render attributes', async () => {
  const fixture = new ElementFixture();
  await render(fixture.host, <div id="abc" title="bar" preventdefault:click></div>);
  await expectRendered(fixture, '<div id="abc" title="bar" preventdefault:click=""></div>');
});

test('should render style only for defined attributes', async () => {
  const fixture = new ElementFixture();
  await render(
    fixture.host,
    <div id="both" style={{ color: 'red', display: 'block' }}>
      <div id="only-color" style={{ display: undefined as unknown as string, color: 'red' }}></div>
      <div id="no-style" style={{ display: undefined as unknown as string }}></div>
    </div>
  );
  await expectRendered(
    fixture,
    `
      <div id="both" style="color: red; display: block">
        <div id="only-color" style="color: red"></div>
        <div id="no-style" style=""></div>
      </div>`
  );
});

test('should render style css variables correctly', async () => {
  const fixture = new ElementFixture();
  await render(
    fixture.host,
    <div
      style={{
        top: 0,
        '--stuff-nu': -1,
        '--stuff-hey': 'hey',
        '--stuffCase': 'foo',
      }}
    />
  );
  await expectRendered(
    fixture,
    `<div style="top: 0; --stuff-nu: -1; --stuff-hey: hey; --stuffCase: foo"></div>`
  );
});

test('should render children', async () => {
  const fixture = new ElementFixture();
  await render(
    fixture.host,
    <div>
      <span>text</span>
    </div>
  );
  await expectRendered(fixture, '<div><span>text</span></div>');
});

test('should render svg', async () => {
  const fixture = new ElementFixture();
  await render(
    fixture.host,
    <svg viewBox="0 0 100 100">
      <span>text</span>
    </svg>
  );
  await expectRendered(fixture, '<svg viewBox="0 0 100 100"><span>text</span></svg>');
});

test('should render a component', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <HelloWorld name="World" />);
  await expectRendered(fixture, '<span>Hello World</span>');
});

test('should render a component with scoped styles', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <HelloWorldScoped />);
  await expectDOM(
    fixture.host,
    `
  <host q:version="dev" q:container="resumed" q:render="dom-dev">
    <style q:style="ml52vk-0" hidden="">
      .stuff.⭐️ml52vk-0 {
        color: red;
      }
    </style>
    <!--qv -->
    <div class="⭐️ml52vk-0">
      <div class="⭐️ml52vk-0 stuff" aria-hidden="true">
        Hello
        <button class="⭐️ml52vk-0">
          Toggle
        </button>
      </div>
    </div>
    <!--/qv-->
  </host>
  `
  );
  await trigger(fixture.host, 'button', 'click');
  await expectDOM(
    fixture.host,
    `
  <host q:version="dev" q:container="resumed" q:render="dom-dev">
    <style q:style="ml52vk-0" hidden="">
      .stuff.⭐️ml52vk-0 {
        color: red;
      }
    </style>
    <!--qv -->
    <div class="⭐️ml52vk-0">
      <div class="⭐️ml52vk-0">
        Hello
        <button class="⭐️ml52vk-0">
          Toggle
        </button>
      </div>
    </div>
    <!--/qv-->
  </host>
  `
  );
});

test('should render component external props', async () => {
  const fixture = new ElementFixture();

  await render(
    fixture.host,
    <RenderProps thing="World" q:slot="start" innerHTML="123" dangerouslySetInnerHTML="432" />
  );
  await expectRendered(
    fixture,
    '<render-props><span>{"thing":"World","innerHTML":"123","dangerouslySetInnerHTML":"432"}</span></render-props>'
  );
});

test('should render a blank component', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <InnerHTMLComponent />);
  await expectRendered(fixture, `<div><span>WORKS</span></div>`);
});

test('should render a div then a component', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <ToggleRootComponent />);
  await expectDOM(
    fixture.host,
    `
    <host q:version="dev" q:container="resumed" q:render="dom-dev">
      <!--qv -->
      <div aria-hidden="false">
        <div class="normal">Normal div</div>
        <button>toggle</button>
      </div>
      <!--/qv-->
    </host>`
  );
  await trigger(fixture.host, 'button', 'click');
  await expectDOM(
    fixture.host,
    `
    <host q:version="dev" q:container="resumed" q:render="dom-dev">
      <!--qv -->
      <div aria-hidden="true">
        <!--qv -->
        <div><div>this is ToggleChild</div></div>
        <!--/qv-->
        <button>toggle</button>
      </div>
      <!--/qv-->
    </host>
    `
  );
});

test('should process clicks', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <Counter step={5} />);
  await expectDOM(
    fixture.host,
    `
    <host q:version="dev" q:container="resumed" q:render="dom-dev">
      <!--qv -->
      <button class="decrement">-</button>
      <span>0</span>
      <button class="increment">+</button>
      <!--/qv-->
    </host>`
  );
  await trigger(fixture.host, 'button.increment', 'click');
  await expectDOM(
    fixture.host,
    `
    <host q:version="dev" q:container="resumed" q:render="dom-dev">
      <!--qv -->
      <button class="decrement">-</button>
      <span>5</span>
      <button class="increment">+</button>
      <!--/qv-->
    </host>`
  );
});

test('should project no content', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <Project></Project>);
  await expectRendered(
    fixture,
    `
      <section>
        <!--qv q:key q:sref=0 q:s-->
        <!--/qv-->
        <!--qv q:key=details q:sref=0 q:s-->
        <!--/qv-->
        <!--qv q:key=description q:sref=0 q:s-->
        <!--/qv-->
      </section>`
  );
});

test('should project un-named slot text', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <Project>projection</Project>);
  await expectRendered(
    fixture,
    `
      <section>
        <!--qv q:key q:sref=0 q:s-->
        projection
        <!--/qv-->
        <!--qv q:key=details q:sref=0 q:s-->
        <!--/qv-->
        <!--qv q:key=description q:sref=0 q:s-->
        <!--/qv-->
      </section>`
  );
});

test('should project un-named slot component', async () => {
  const fixture = new ElementFixture();

  await render(
    fixture.host,
    <Project>
      <HelloWorld />
    </Project>
  );
});

test('should render host events on the first element', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <UseEvents />);
  await expectDOM(
    fixture.host,
    `
  <host q:version="dev" q:container="resumed" q:render="dom-dev">
    <!--qv -->
    hello
    <div>
      thing
    </div>
    stuff
    <!--/qv-->
  </host>`
  );
});

test('should project named slot component', async () => {
  const fixture = new ElementFixture();

  await render(
    fixture.host,
    <Project>
      PROJECTION
      <span q:slot="details">DETAILS</span>
      <span q:slot="description">DESCRIPTION</span>
    </Project>
  );
  await expectRendered(
    fixture,
    `
      <section>
        <!--qv q:key q:sref=0 q:s-->
        PROJECTION
        <!--/qv-->
        <!--qv q:key=details q:sref=0 q:s-->
        <span q:slot="details">DETAILS</span>
        <!--/qv-->
        <!--qv q:key=description q:sref=0 q:s-->
        <span q:slot="description">DESCRIPTION</span>
        <!--/qv-->
      </section>`
  );
});

test('should project multiple slot with same name', async () => {
  const fixture = new ElementFixture();

  await render(
    fixture.host,
    <Project>
      <span q:slot="details">DETAILS1</span>
      <span q:slot="details">DETAILS2</span>
      <span q:slot="ignore">IGNORE</span>
    </Project>
  );
  await expectDOM(
    fixture.host,
    `
    <host q:version="dev" q:container="resumed" q:render="dom-dev">
      <!--qv -->
      <q:template q:slot="ignore" hidden="" aria-hidden="true">
        <span q:slot="ignore">IGNORE</span>
      </q:template>
      <section>
        <!--qv q:key q:sref=0 q:s-->
        <!--/qv-->
        <!--qv q:key=details q:sref=0 q:s-->
        <span q:slot="details">DETAILS1</span>
        <span q:slot="details">DETAILS2</span>
        <!--/qv-->
        <!--qv q:key=description q:sref=0 q:s-->
        <!--/qv-->
      </section>
      <!--/qv-->
    </host>
    `
  );
});
test('should not destroy projection when <Project> reruns', async () => {
  const fixture = new ElementFixture();

  await render(
    fixture.host,
    <SimpleProject>
      <span>PROJECTION</span>
    </SimpleProject>
  );
  await expectRendered(
    fixture,
    `
      <section>
        <!--qv q:key q:sref=0 q:s-->
        <span>PROJECTION</span>
        <!--/qv-->
      </section>`
  );
});

test('should render into host component', async () => {
  const fixture = new ElementFixture();

  await render(
    fixture.host,
    <divfixture
      on:click="./lazy.js"
      onscrolling="./test.js"
      hostAttrs={JSON.stringify({
        id: 'TEST',
        class: { thing: true },
        name: 'NAME',
      })}
      content="CONTENT"
    />
  );
  await expectRendered(
    fixture,
    `
      <divfixture
        on:click="./lazy.js"
        onscrolling="./test.js"
        hostattrs='{"id":"TEST","class":{"thing":true},"name":"NAME"}'
        content="CONTENT"
      >
      </divfixture>`
  );
});

test('should render a promise', async () => {
  const fixture = new ElementFixture();
  await render(fixture.host, <div>{Promise.resolve('WORKS')}</div>);
  await expectRendered(fixture, '<div>WORKS</div>');
});

test('should render a component with hooks', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <Hooks />);
  await expectRendered(
    fixture,
    `
    <div>
      <div id="effect">true</div>
      <div id="effect-destroy"></div>
      <div id="watch">true</div>
      <div id="watch-destroy"></div>
      <div id="server-mount">false</div>
      <div id="reference">true</div>
    </div>`
  );

  await pauseContainer(fixture.host);
  await expectRendered(
    fixture,
    `
    <div>
      <div id="effect">true</div>
      <div id="effect-destroy">true</div>
      <div id="watch">true</div>
      <div id="watch-destroy">true</div>
      <div id="server-mount">false</div>
      <div id="reference">true</div>
    </div>`
  );
});

test('should insert a style', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <HelloWorld name="World" />);
  const style = fixture.document.querySelector(`style[q\\:style]`);
  assert.include(style!.textContent!, 'color: red');
  await expectRendered(fixture, '<span>Hello World</span>');
});
test('should render #text nodes', async () => {
  const fixture = new ElementFixture();

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
  await expectRendered(
    fixture,
    `
      <svg viewBox="0 0 100 4" class="svg-container">
        <text class="svg-text" style="color: hola">Hola hola</text>
        <text class="svg-text" style="color: adios">Hola adios</text>
      </svg>`
  );

  // Ensure all SVG elements have the SVG namespace
  const namespaces = Array.from(fixture.host.querySelectorAll('text')).map(
    (e: any) => e.namespaceURI
  );
  assert.deepEqual(namespaces, ['http://www.w3.org/2000/svg', 'http://www.w3.org/2000/svg']);
});

test('should render class object correctly', async () => {
  const fixture = new ElementFixture();

  await render(
    fixture.host,
    <div
      class={{
        stuff: true,
        other: false,
        'm-0 p-2': true,
      }}
    ></div>
  );
  await expectRendered(fixture, `<div class="stuff m-0 p-2"></div>`);
});

test('should render class array correctly', async () => {
  const fixture = new ElementFixture();

  await render(
    fixture.host,
    <div class={['stuff', '', 'm-0 p-2', null, 'active', undefined, 'container']}></div>
  );
  await expectRendered(fixture, `<div class="stuff m-0 p-2 active container"></div>`);
});

test('should re-render classes correctly', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <RenderClasses></RenderClasses>);
  await expectDOM(
    fixture.host,
    `
  <host q:version="dev" q:container="resumed" q:render="dom-dev">
    <!--qv -->
    <button class="increment">+</button>
    <div class="stuff m-0 p-2">Div 1</div>
    <div class="stuff m-0 p-2 active container">Div 2</div>
    <!--/qv-->
  </host>`
  );

  await trigger(fixture.host, 'button', 'click');

  await expectDOM(
    fixture.host,
    `
  <host q:version="dev" q:container="resumed" q:render="dom-dev">
    <!--qv -->
    <button class="increment">+</button>
    <div class="other">Div 1</div>
    <div class="stuff m-0 p-2 almost-null active container">Div 2</div>
    <!--/qv-->
  </host>`
  );
});

test('should render camelCase attributes', async () => {
  const fixture = new ElementFixture();

  await render(
    fixture.host,
    <svg id="my-svg" viewBox="0 0 100 4" preserveAspectRatio="none">
      <a href="/path"></a>
    </svg>
  );
  await expectRendered(
    fixture,
    `
      <svg id="my-svg" viewBox="0 0 100 4" preserveAspectRatio="none">
        <a href="/path"></a>
      </svg>`
  );
});

test('should render path', async () => {
  const fixture = new ElementFixture();

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
  await expectRendered(
    fixture,
    `
      <div>
        <a href="#">Dude!!</a>
        <svg id="my-svg" viewBox="0 0 100 4" preserveAspectRatio="none">
          <path
            id="my-svg-path"
            d="M 0,2 L 100,2"
            stroke="#FFEA82"
            stroke-width="4"
            fill-opacity="0"
          ></path>
        </svg>
      </div>`
  );
});

test('should render foreignObject properly', async () => {
  const fixture = new ElementFixture();

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
        <text class="is-svg">Hello</text>
        <text class="is-svg">Bye</text>
      </svg>
      <text class="is-html">end</text>
    </div>
  );
  for (const el of Array.from(fixture.host.querySelectorAll('.is-html'))) {
    assert.equal(el.namespaceURI, 'http://www.w3.org/1999/xhtml', el.outerHTML);
  }
  for (const el of Array.from(fixture.host.querySelectorAll('.is-svg'))) {
    assert.equal(el.namespaceURI, 'http://www.w3.org/2000/svg', el.outerHTML);
  }

  await expectRendered(
    fixture,
    `
    <div class="is-html">
      <text class="is-html" shouldkebab="true">Start</text>
      <svg class="is-svg" preserveAspectRatio="true">
        <text class="is-svg" shouldCamelCase="true">start</text>
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
    </div>`
  );
});

test('should clean up subscriptions after calling the returned cleanup function', async () => {
  const fixture = new ElementFixture();

  const spies = {
    cleanupSpy: false,
  };

  const { cleanup } = await render(fixture.host, <CleanupComponent spies={spies} />);

  cleanup();

  assert.equal(spies.cleanupSpy, true);
});

async function expectRendered(fixture: ElementFixture, expected: string) {
  const firstNode = getFirstNode(fixture.host);
  return await expectDOM(firstNode, expected);
}

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
export const HelloWorld = component$((props: { name?: string }) => {
  useStylesQrl(inlinedQrl(`span.� { color: red; }`, 'style-1'));
  const state = useStore({ salutation: 'Hello' });
  return (
    <span>
      {state.salutation} {props.name || 'World'}
    </span>
  );
});

//////////////////////////////////////////////////////////////////////////////////////////
// Hello World
//////////////////////////////////////////////////////////////////////////////////////////
export const HelloWorldScoped = component$(() => {
  useStylesScopedQrl(inlinedQrl(`.stuff { color: red; }`, 'style-scoped-1'));
  const state = useStore({ cond: false });
  return (
    <div>
      {state.cond && (
        <div key="a">
          Hello
          <button onClick$={() => (state.cond = !state.cond)}>Toggle</button>
        </div>
      )}
      {!state.cond && (
        <div key="b" class="stuff" aria-hidden="true">
          Hello
          <button onClick$={() => (state.cond = !state.cond)}>Toggle</button>
        </div>
      )}
    </div>
  );
});

//////////////////////////////////////////////////////////////////////////////////////////
// Hello World
//////////////////////////////////////////////////////////////////////////////////////////
export const RenderProps = component$((props: Record<string, any>) => {
  return (
    <render-props href={props.href}>
      <span>{JSON.stringify(props)}</span>
    </render-props>
  );
});

//////////////////////////////////////////////////////////////////////////////////////////
// Render Classes
//////////////////////////////////////////////////////////////////////////////////////////
export const RenderClasses = component$(() => {
  const state = useStore({
    count: 0,
  });
  return (
    <>
      <button
        class="increment"
        onClick$={inlinedQrl(Counter_add, 'Counteradd', [state, { value: 1 }])}
      >
        +
      </button>
      <div
        class={{
          stuff: state.count % 2 === 0,
          other: state.count % 2 === 1,
          'm-0 p-2': state.count % 2 === 0,
        }}
      >
        Div 1
      </div>
      <div
        class={[
          'stuff',
          '',
          'm-0 p-2',
          state.count % 2 === 0 ? null : 'almost-null',
          'active',
          undefined,
          'container',
        ]}
      >
        Div 2
      </div>
    </>
  );
});

//////////////////////////////////////////////////////////////////////////////////////////
// Counter
//////////////////////////////////////////////////////////////////////////////////////////

export const Counter = component$((props: { step?: number }) => {
  const state = useStore({ count: 0 });
  const step = Number(props.step || 1);
  return (
    <>
      <button
        class="decrement"
        onClick$={inlinedQrl(Counter_add, 'Counteradd', [state, { value: -step }])}
      >
        -
      </button>
      <span>{state.count}</span>
      <button
        class="increment"
        onClick$={inlinedQrl(Counter_add, 'Counteradd', [state, { value: step }])}
      >
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
export const Project = component$(() => {
  return (
    <section>
      <Slot></Slot>
      <Slot name="details"></Slot>
      <Slot name="description"></Slot>
    </section>
  );
});

export const SimpleProject = component$(() => {
  return (
    <section>
      <Slot></Slot>
    </section>
  );
});

//////////////////////////////////////////////////////////////////////////////////////////
// HostFixture
//////////////////////////////////////////////////////////////////////////////////////////
export const HostFixture = component$((props: { hostAttrs?: string; content?: string }) => {
  return <div {...JSON.parse(props.hostAttrs || '{}')}>{props.content}</div>;
});

//////////////////////////////////////////////////////////////////////////////////////////
export const InnerHTMLComponent = component$(() => {
  const html = '<span>WORKS</span>';
  return (
    <div dangerouslySetInnerHTML={html}>
      <div>not rendered</div>
    </div>
  );
});

//////////////////////////////////////////////////////////////////////////////////////////

export const ToggleRootComponent = component$(() => {
  const state = useStore({
    cond: false,
  });
  return (
    <div aria-hidden={state.cond ? 'true' : 'false'}>
      {state.cond ? <ToggleChild /> : <div class="normal">Normal div</div>}
      <button onClick$={() => (state.cond = !state.cond)}>toggle</button>
    </div>
  );
});

export const ToggleChild = component$(() => {
  return (
    <div>
      <div>this is ToggleChild</div>
    </div>
  );
});

export const Transparent = component$(() => {
  return <Slot></Slot>;
});

export const UseEvents = component$(() => {
  useVisibleTask$(() => {
    console.warn('hello');
  });
  useOn(
    'click',
    inlinedQrl(() => {
      console.warn('click');
    }, 'use-on-click')
  );
  return (
    <>
      hello
      <div>thing</div>
      stuff
    </>
  );
});

//////////////////////////////////////////////////////////////////////////////////////////
export const Hooks = component$(() => {
  const taskDestroyDiv = useSignal<HTMLElement>();
  const visibleTaskDiv = useSignal<HTMLElement>();
  const visibleTaskDestroyDiv = useSignal<HTMLElement>();

  const state = useStore({
    task: 'false',
    server: 'false',
  });

  useTask$(() => {
    state.task = 'true';
    return () => {
      taskDestroyDiv.value!.textContent = 'true';
    };
  });

  useVisibleTask$(() => {
    visibleTaskDiv.value!.textContent = 'true';
    return () => {
      visibleTaskDestroyDiv.value!.textContent = 'true';
    };
  });

  return (
    <div>
      <div id="effect" ref={visibleTaskDiv}></div>
      <div id="effect-destroy" ref={visibleTaskDestroyDiv}></div>

      <div id="watch">{state.task}</div>
      <div id="watch-destroy" ref={taskDestroyDiv}></div>

      <div id="server-mount">{state.server}</div>

      <div id="reference">true</div>
    </div>
  );
});

//////////////////////////////////////////////////////////////////////////////////////////

export const CleanupComponent = component$((props: { spies: { cleanupSpy: boolean } }) => {
  useTask$(({ cleanup }) => {
    cleanup(() => {
      props.spies.cleanupSpy = true;
    });
  });

  return (
    <div>
      <div id="cleanup">true</div>
    </div>
  );
});

suite('should properly render styles from style prop', () => {
  const RenderJSX = component$(() => {
    const pStyles = {
      fontSize: 30, // auto-converted to px
      fontWeight: 800, // shouldn't get converted to px
    };
    return (
      <main id="root">
        <div
          style={{
            marginTop: 50, // auto-converted to px
            height: 200, // auto-converted to px
            width: 200, // auto-converted to px
            backgroundColor: 'red',
          }}
        >
          <p style={pStyles}>Big square</p>
        </div>
      </main>
    );
  });

  test('SSR jsx style render', async () => {
    const output = await renderToString(<RenderJSX />, { containerTagName: 'div' });
    const document = createDocument();
    document.body.innerHTML = output.html;
    const main = document.querySelector('#root')!;
    const resultHTML = `<div style="margin-top:50px;height:200px;width:200px;background-color:red"><p style="font-size:30px;font-weight:800">Big square</p></div>`;
    assert.equal(main.innerHTML, resultHTML);
  });

  test('CSR jsx style render', async () => {
    const { screen, render } = await createDOM();

    await render(<RenderJSX />);
    const main = screen.querySelector('#root')!;
    const resultHTML = `<div style="margin-top:50px;height:200px;width:200px;background-color:red"><p style="font-size:30px;font-weight:800">Big square</p></div>`;
    assert.equal(main.innerHTML, resultHTML);
  });
});

test('should render value="" on option', async () => {
  const { screen, render } = await createDOM();

  await render(
    <select>
      <option value="">Empty</option>
    </select>
  );
  const option = screen.querySelector('option')!;
  assert.isTrue(option.hasAttribute('value'));
  assert.equal(option.getAttribute('value'), '');
  assert.equal(option.outerHTML, '<option value="">Empty</option>');
});
