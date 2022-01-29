import { h, Host, useStore } from '@builder.io/qwik';
import { ElementFixture, trigger } from '../../testing/element_fixture';
import { expectDOM } from '../../testing/expect-dom.unit';
import { getTestPlatform } from '../../testing/platform';
import { component, onRender$, withScopedStyles$, component$ } from '../component/component.public';
import { runtimeQrl } from '../import/qrl';
import { $ } from '../import/qrl.public';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { AttributeMarker } from '../util/markers';
import { Async, JSXPromise, PromiseValue } from './jsx/async.public';
import { Slot } from './jsx/slot.public';
import { notifyRender } from './notify-render';
import { render } from './render.public';

describe('q-render', () => {
  let fixture: ElementFixture;
  beforeEach(() => (fixture = new ElementFixture()));
  describe('basic JSX', () => {
    it('should render basic content', async () => {
      await render(fixture.host, <div></div>);
      expectRendered(<div></div>);
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

    it('should render into a document', () => {
      render(
        fixture.document,
        <html>
          <body>WORKS</body>
        </html>
      );
      expect(fixture.document.body.innerHTML).toEqual('WORKS');
    });

    it('should render attributes', async () => {
      await render(fixture.host, <div id="abc" title="bar"></div>);
      expectRendered(<div title="bar" id="abc"></div>);
    });

    it('should render children', async () => {
      await render(
        fixture.host,
        <div>
          <span>text</span>
        </div>
      );
      expectDOM(
        fixture.host.firstElementChild!,
        <div>
          <span>text</span>
        </div>
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
            <q:slot>..default..</q:slot>
            <q:slot name="details">..details..</q:slot>
            <q:slot name="description">..description..</q:slot>
          </section>
        </project>
      );
    });

    it('should project un-named slot text', async () => {
      await render(fixture.host, <Project>projection</Project>);
      expectRendered(
        <project>
          <template q:slot=""></template>
          <section>
            <q:slot>projection</q:slot>
            <q:slot name="details">..details..</q:slot>
            <q:slot name="description">..description..</q:slot>
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
          <template q:slot=""></template>
          <section>
            <q:slot>PROJECTION</q:slot>
            <q:slot name="details">
              <span q:slot="details">DETAILS</span>
            </q:slot>
            <q:slot name="description">
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
          <template q:slot="">
            <span q:slot="ignore">IGNORE</span>
          </template>
          <section>
            <q:slot>..default..</q:slot>
            <q:slot name="details">
              <span q:slot="details">DETAILS1</span>
              <span q:slot="details">DETAILS2</span>
            </q:slot>
            <q:slot name="description">..description..</q:slot>
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
          <template q:slot=""></template>
          <section>
            <q:slot>PROJECTION</q:slot>
          </section>
        </project>
      );
      notifyRender(fixture.host.firstElementChild!);
      await getTestPlatform(fixture.document).flush();
      expectRendered(
        <project>
          <template q:slot=""></template>
          <section>
            <q:slot>PROJECTION</q:slot>
          </section>
        </project>
      );
    });
  });
  describe('<Host>', () => {
    it('should render into host component', async () => {
      await render(
        fixture.host,
        <HostFixture hostAttrs={JSON.stringify({ id: 'TEST', name: 'NAME' })} content="CONTENT" />
      );
      expectRendered(
        <host-fixture id="TEST" name="NAME">
          CONTENT
        </host-fixture>
      );
    });
  });

  describe('<Async>', () => {
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

  describe('styling', () => {
    it('should insert a style', async () => {
      await render(fixture.host, <HelloWorld name="World" />);
      const hellWorld = fixture.host.querySelector('hello-world')!;
      const scopedStyleId = hellWorld.getAttribute(AttributeMarker.ComponentScopedStyles);
      expect(scopedStyleId).toBeDefined();
      const style = fixture.document.body.parentElement!.querySelector(
        `style[q\\:style="${scopedStyleId}"]`
      );
      expect(style?.textContent).toContain('color: red');
      expectRendered(
        <hello-world>
          <span class={AttributeMarker.ComponentStylesPrefixContent + scopedStyleId}>
            {'Hello'} {'World'}
          </span>
        </hello-world>
      );
    });
  });

  function expectRendered(expected: h.JSX.Element, expectedErrors: string[] = []) {
    return expectDOM(fixture.host.firstElementChild!, expected, expectedErrors);
  }
});
//////////////////////////////////////////////////////////////////////////////////////////
// Hello World
//////////////////////////////////////////////////////////////////////////////////////////
export const HelloWorld = component(
  'hello-world',
  $((props: { name?: string }) => {
    withScopedStyles$(`span.� { color: red; }`);
    const state = useStore({ salutation: 'Hello' });
    return onRender$(() => {
      return (
        <span>
          {state.salutation} {props.name || 'World'}
        </span>
      );
    });
  })
);

//////////////////////////////////////////////////////////////////////////////////////////
// Counter
//////////////////////////////////////////////////////////////////////////////////////////

export const Counter = component$((props: { step?: number }) => {
  const state = useStore({ count: 0 });
  return onRender$(() => {
    const step = Number(props.step || 1);
    return (
      <>
        <button class="decrement" on:click={runtimeQrl(Counter_add, [state, { value: -step }])}>
          -
        </button>
        <span>{state.count}</span>
        <button class="increment" on:click={runtimeQrl(Counter_add, [state, { value: step }])}>
          +
        </button>
      </>
    );
  });
});
export const Counter_add = () => {
  const [state, args] = useLexicalScope();
  state.count += args.value;
};

//////////////////////////////////////////////////////////////////////////////////////////
// Project
//////////////////////////////////////////////////////////////////////////////////////////
export const Project = component(
  'project',
  $(() => {
    return onRender$(() => {
      return (
        <section>
          <Slot>..default..</Slot>
          <Slot name="details">..details..</Slot>
          <Slot name="description">..description..</Slot>
        </section>
      );
    });
  })
);

export const SimpleProject = component(
  'project',
  $(() => {
    return onRender$(() => {
      return (
        <section>
          <Slot>..default..</Slot>
        </section>
      );
    });
  })
);

//////////////////////////////////////////////////////////////////////////////////////////
// HostFixture
//////////////////////////////////////////////////////////////////////////////////////////
export const HostFixture = component(
  'host-fixture',
  $((props: { hostAttrs?: string; content?: string }) => {
    return onRender$(() => {
      return h(Host, JSON.parse(props.hostAttrs || '{}'), [props.content]);
    });
  })
);

function delay(time: number) {
  return new Promise((res) => setTimeout(res, time));
}
