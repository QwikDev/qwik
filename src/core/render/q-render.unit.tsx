import { Fragment, h, Host } from '@builder.io/qwik';
import { ElementFixture, trigger } from '../../testing/element_fixture';
import { expectDOM } from '../../testing/expect-dom';
import { qComponent } from '../component/q-component.public';
import { qHook } from '../component/qrl-hook.public';
import { qrlStyles } from '../component/qrl-styles';
import { TEST_CONFIG } from '../util/test_config';
import { Async, JSXPromise, PromiseValue } from './jsx/async.public';
import { Slot } from './jsx/slot.public';
import { qRender } from './q-render.public';
import { qNotifyRender } from './q-notify-render';
import { getTestPlatform } from '../../testing/platform';

describe('q-render', () => {
  let fixture: ElementFixture;
  beforeEach(() => (fixture = new ElementFixture(TEST_CONFIG)));
  describe('basic JSX', () => {
    it('should render basic content', async () => {
      await qRender(fixture.host, <div></div>);
      expectRendered(<div></div>);
    });

    it('should render into a document', () => {
      qRender(
        fixture.document,
        <html>
          <body>WORKS</body>
        </html>
      );
      expect(fixture.document.body.innerHTML).toEqual('WORKS');
    });

    it('should render attributes', async () => {
      await qRender(fixture.host, <div id="abc" title="bar"></div>);
      expectRendered(<div title="bar" id="abc"></div>);
    });

    it('should render children', async () => {
      await qRender(
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

  describe('<Slot>', () => {
    it('should project no content', async () => {
      await qRender(fixture.host, <Project></Project>);
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
      await qRender(fixture.host, <Project>projection</Project>);
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
      await qRender(
        fixture.host,
        <Project>
          <HelloWorld />
        </Project>
      );
    });
    it('should project named slot component', async () => {
      await qRender(
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
      await qRender(
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
      await qRender(
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
      qNotifyRender(fixture.host.firstElementChild!);
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
      await qRender(
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
      await qRender(fixture.host, <div>{Promise.resolve('WORKS')}</div>);
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
      await qRender(fixture.host, <div>{promise}</div>);
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
      await qRender(fixture.host, <div>{promise}</div>);
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
      await qRender(
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

  describe('component', () => {
    it('should render a child component', async () => {
      await qRender(fixture.host, <HelloWorld name="World" />);
      expectRendered(
        <hello-world on:q-render={HelloWorld.onRender}>
          <span>
            {'Hello'} {'World'}
          </span>
        </hello-world>
      );
    });

    describe('handlers', () => {
      it('should process clicks', async () => {
        await qRender(fixture.host, <Counter step={5} />);
        expectRendered(
          <div on:q-render={Counter.onRender}>
            <button on:click={Counter_add.with({ value: -5 })}>-</button>
            <span>0</span>
            <button on:click={Counter_add.with({ value: 5 })}>+</button>
          </div>
        );
        await trigger(fixture.host, 'button.increment', 'click');
        expectRendered(
          <div on:q-render={Counter.onRender}>
            <button on:click={Counter_add.with({ value: -5 })}>-</button>
            <span>5</span>
            <button on:click={Counter_add.with({ value: 5 })}>+</button>
          </div>
        );
      });
    });
    describe('styles', () => {
      it('should render a component with styles', async () => {
        await qRender(fixture.host, <HelloWorld name="World" />);
        expectRendered(
          <hello-world
            on:q-render={HelloWorld.onRender}
            q:style={HelloWorld.styles as any}
            class={HelloWorld.styleHostClass as any}
          >
            <span class={HelloWorld.styleClass as any}>
              {'Hello'} {'World'}
            </span>
          </hello-world>
        );
      });
    });
  });

  function expectRendered(expected: h.JSX.Element, expectedErrors: string[] = []) {
    return expectDOM(fixture.host.firstElementChild!, expected, expectedErrors);
  }
});
//////////////////////////////////////////////////////////////////////////////////////////
// Hello World
//////////////////////////////////////////////////////////////////////////////////////////
export const HelloWorld = qComponent<{ name?: string }, { salutation: string }>({
  tagName: 'hello-world',
  styles: qrlStyles<any>('./mock.unit.css#ABC123'),
  onMount: qHook(() => ({ salutation: 'Hello' })),
  onRender: qHook((props, state) => {
    return (
      <span>
        {state.salutation} {props.name || 'World'}
      </span>
    );
  }),
});

//////////////////////////////////////////////////////////////////////////////////////////
// Counter
//////////////////////////////////////////////////////////////////////////////////////////

export const Counter = qComponent<{ step?: number }, { count: number }>({
  onMount: qHook(() => ({ count: 0 })),
  onRender: qHook((props, state) => {
    const step = Number(props.step || 1);
    return (
      <>
        <button class="decrement" on:click={Counter_add.with({ value: -step })}>
          -
        </button>
        <span>{state.count}</span>
        <button class="increment" on:click={Counter_add.with({ value: step })}>
          +
        </button>
      </>
    );
  }),
});
export const Counter_add = qHook<typeof Counter, { value: number }>((props, state, args) => {
  state.count += args.value;
});

//////////////////////////////////////////////////////////////////////////////////////////
// Project
//////////////////////////////////////////////////////////////////////////////////////////
export const Project = qComponent({
  tagName: 'project',
  onRender: qHook(() => {
    return (
      <section>
        <Slot>..default..</Slot>
        <Slot name="details">..details..</Slot>
        <Slot name="description">..description..</Slot>
      </section>
    );
  }),
});

export const SimpleProject = qComponent({
  tagName: 'project',
  onRender: qHook(() => {
    return (
      <section>
        <Slot>..default..</Slot>
      </section>
    );
  }),
});

//////////////////////////////////////////////////////////////////////////////////////////
// HostFixture
//////////////////////////////////////////////////////////////////////////////////////////
export const HostFixture = qComponent<{ hostAttrs?: string; content?: string }>({
  tagName: 'host-fixture',
  onRender: qHook((props) => {
    return h(Host, JSON.parse(props.hostAttrs || '{}'), [props.content]);
  }),
});
function delay(time: number) {
  return new Promise((res) => setTimeout(res, time));
}
