import { ElementFixture, trigger } from '../../../testing/element-fixture';
import { expectDOM } from '../../../testing/expect-dom.unit';
import { component$ } from '../../component/component.public';
import { inlinedQrl } from '../../qrl/qrl';
import { useLexicalScope } from '../../use/use-lexical-scope.public';
import { useStore } from '../../use/use-store.public';
import { useClientEffect$, useWatch$ } from '../../use/use-watch';
import { useCleanup$, useOn } from '../../use/use-on';
import { Slot } from '../jsx/slot.public';
import { render } from './render.public';
import { useStylesQrl, useStylesScopedQrl } from '../../use/use-styles';
import { equal, match } from 'uvu/assert';
import { suite } from 'uvu';
import { useRef } from '../../use/use-ref';
import { pauseContainer } from '../../container/pause';

const renderSuite = suite('render');
renderSuite('should render basic content', async () => {
  const fixture = new ElementFixture();
  await render(fixture.host, <div></div>);
  await expectRendered(fixture, '<div></div>');
  equal(fixture.host.getAttribute('q:version'), 'dev');
  equal(fixture.host.getAttribute('q:container'), 'resumed');

  await pauseContainer(fixture.host);
  equal(fixture.host.getAttribute('q:container'), 'paused');
});

renderSuite('should only render string/number', async () => {
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
      {function () {}}
    </div>
  );
  await expectRendered(fixture, '<div>string123</div>');
});

renderSuite('should serialize events correctly', async () => {
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
renderSuite('should serialize boolean attributes correctly', async () => {
  const fixture = new ElementFixture();
  await render(fixture.host, <input required={true} disabled={false}></input>);
  await expectRendered(fixture, '<input required="" />');
});

renderSuite('should render aria', async () => {
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

renderSuite('should render into a document', async () => {
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
  <!--qv q:key=sX:-->
  <!--qv q:key q:sref=0 q:s-->
    <head q:head="">
      <title></title>
      <existing></existing>
      <title q:head="">Replace</title>
      <div q:head=""><div></div></div>
    </head>
    <body>
      WORKS
    </body>
    <!--/qv-->
    <!--/qv-->
  </html>`
  );
});

renderSuite('should render attributes', async () => {
  const fixture = new ElementFixture();
  await render(fixture.host, <div id="abc" title="bar" preventdefault:click></div>);
  await expectRendered(fixture, '<div id="abc" title="bar" preventdefault:click=""></div>');
});

renderSuite('should render style only for defined attributes', async () => {
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

renderSuite('should render style css variables correctly', async () => {
  const fixture = new ElementFixture();
  await render(
    fixture.host,
    <div
      style={{
        '--stuff-hey': 'hey',
        '--stuffCase': 'foo',
      }}
    />
  );
  await expectRendered(fixture, `<div style="--stuff-hey: hey; --stuffCase: foo"></div>`);
});

renderSuite('should render children', async () => {
  const fixture = new ElementFixture();
  await render(
    fixture.host,
    <div>
      <span>text</span>
    </div>
  );
  await expectRendered(fixture, '<div><span>text</span></div>');
});

renderSuite('should render svg', async () => {
  const fixture = new ElementFixture();
  await render(
    fixture.host,
    <svg viewBox="0 0 100 100">
      <span>text</span>
    </svg>
  );
  await expectRendered(fixture, '<svg viewBox="0 0 100 100"><span>text</span></svg>');
});

renderSuite('should render a component', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <HelloWorld name="World" />);
  await expectRendered(fixture, '<span>Hello World</span>');
});

renderSuite('should render a component with scoped styles', async () => {
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
    <!--qv q:key=sX:-->
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
    <!--qv q:key=sX:-->
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

renderSuite('should render component external props', async () => {
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

renderSuite('should render a blank component', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <InnerHTMLComponent />);
  await expectRendered(fixture, `<div><span>WORKS</span></div>`);
});

renderSuite('should render a div then a component', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <ToggleRootComponent />);
  await expectDOM(
    fixture.host,
    `
    <host q:version="dev" q:container="resumed" q:render="dom-dev">
      <!--qv q:key=sX:-->
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
      <!--qv q:key=sX:-->
      <div aria-hidden="true">
        <!--qv q:key=sX:-->
        <div><div>this is ToggleChild</div></div>
        <!--/qv-->
        <button>toggle</button>
      </div>
      <!--/qv-->
    </host>
    `
  );
});

renderSuite('should process clicks', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <Counter step={5} />);
  await expectDOM(
    fixture.host,
    `
    <host q:version="dev" q:container="resumed" q:render="dom-dev">
      <!--qv q:key=sX:-->
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
      <!--qv q:key=sX:-->
      <button class="decrement">-</button>
      <span>5</span>
      <button class="increment">+</button>
      <!--/qv-->
    </host>`
  );
});

renderSuite('should project no content', async () => {
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

renderSuite('should project un-named slot text', async () => {
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

renderSuite('should project un-named slot component', async () => {
  const fixture = new ElementFixture();

  await render(
    fixture.host,
    <Project>
      <HelloWorld />
    </Project>
  );
});

renderSuite('should render host events on the first element', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <UseEvents />);
  await expectDOM(
    fixture.host,
    `
  <host q:version="dev" q:container="resumed" q:render="dom-dev">
    <!--qv q:key=sX:-->
    hello
    <div>
      thing
    </div>
    stuff
    <!--/qv-->
  </host>`
  );
});

renderSuite('should project named slot component', async () => {
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

renderSuite('should project multiple slot with same name', async () => {
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
      <!--qv q:key=sX:-->
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
      <q:template q:slot="ignore" hidden="" aria-hidden="true">
        <span q:slot="ignore">IGNORE</span>
      </q:template>
      <!--/qv-->
    </host>
    `
  );
});
renderSuite('should not destroy projection when <Project> reruns', async () => {
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

renderSuite('should render into host component', async () => {
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

renderSuite('should render a promise', async () => {
  const fixture = new ElementFixture();
  await render(fixture.host, <div>{Promise.resolve('WORKS')}</div>);
  await expectRendered(fixture, '<div>WORKS</div>');
});

renderSuite('should render a component with hooks', async () => {
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
      <div id="cleanup"></div>
      <div id="reference">true</div>
    </div>`
  );

  await pauseContainer(fixture.host);
  await expectRendered(
    fixture,
    `
    <div q:id="1" on:qvisible="/runtimeQRL#_[0]">
      <div id="effect" q:id="2">true</div>
      <div id="effect-destroy" q:id="3">true</div>
      <div id="watch">true</div>
      <div id="watch-destroy" q:id="4">true</div>
      <div id="server-mount">false</div>
      <div id="cleanup" q:id="5">true</div>
      <div id="reference">true</div>
    </div>`
  );
});

renderSuite('should insert a style', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <HelloWorld name="World" />);
  const style = fixture.document.querySelector(`style[q\\:style]`);
  match(style!.textContent!, 'color: red');
  await expectRendered(fixture, '<span>Hello World</span>');
});
renderSuite('should render #text nodes', async () => {
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
  equal(namespaces, ['http://www.w3.org/2000/svg', 'http://www.w3.org/2000/svg']);
});

renderSuite('should render class object correctly', async () => {
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

renderSuite('should render class array correctly', async () => {
  const fixture = new ElementFixture();

  await render(
    fixture.host,
    <div class={['stuff', '', 'm-0 p-2', null, 'active', undefined, 'container'] as any}></div>
  );
  await expectRendered(fixture, `<div class="stuff m-0 p-2 active container"></div>`);
});

renderSuite('should re-render classes correctly', async () => {
  const fixture = new ElementFixture();

  await render(fixture.host, <RenderClasses></RenderClasses>);
  await expectDOM(
    fixture.host,
    `
  <host q:version="dev" q:container="resumed" q:render="dom-dev">
    <!--qv q:key=sX:-->
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
    <!--qv q:key=sX:-->
    <button class="increment">+</button>
    <div class="other">Div 1</div>
    <div class="stuff m-0 p-2 active container almost-null">Div 2</div>
    <!--/qv-->
  </host>`
  );
});

renderSuite('should render camelCase attributes', async () => {
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

renderSuite('should render path', async () => {
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

renderSuite('should render foreignObject properly', async () => {
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
        <text className="is-svg">Hello</text>
        <text className="is-svg">Bye</text>
      </svg>
      <text class="is-html">end</text>
    </div>
  );
  for (const el of Array.from(fixture.host.querySelectorAll('.is-html'))) {
    equal(el.namespaceURI, 'http://www.w3.org/1999/xhtml', el.outerHTML);
  }
  for (const el of Array.from(fixture.host.querySelectorAll('.is-svg'))) {
    equal(el.namespaceURI, 'http://www.w3.org/2000/svg', el.outerHTML);
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
        <div>
          Hello
          <button onClick$={() => (state.cond = !state.cond)}>Toggle</button>
        </div>
      )}
      {!state.cond && (
        <div class="stuff" aria-hidden="true">
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
        className="increment"
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
        class={
          [
            'stuff',
            '',
            'm-0 p-2',
            state.count % 2 === 0 ? null : 'almost-null',
            'active',
            undefined,
            'container',
          ] as any
        }
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
        className="increment"
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
      <Slot>..default..</Slot>
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
  useClientEffect$(() => {
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

  return (
    <div>
      <div id="effect" ref={effectDiv}></div>
      <div id="effect-destroy" ref={effectDestroyDiv}></div>

      <div id="watch">{state.watch}</div>
      <div id="watch-destroy" ref={watchDestroyDiv}></div>

      <div id="server-mount">{state.server}</div>
      <div id="cleanup" ref={cleanupDiv}></div>

      <div id="reference">true</div>
    </div>
  );
});

renderSuite.run();
