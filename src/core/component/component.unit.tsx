import { useLexicalScope, createStore } from '@builder.io/qwik';
import { ElementFixture, trigger } from '../../testing/element_fixture';
import { expectDOM } from '../../testing/expect-dom.unit';
import { runtimeQrl } from '../import/qrl';
import { $ } from '../import/qrl.public';
import { render } from '../render/render.public';
import { PropsOf, component, withStyles, onRender$, component$ } from './component.public';

describe('q-component', () => {
  it('should declare and render basic component', async () => {
    const fixture = new ElementFixture();
    await render(fixture.host, <HelloWorld></HelloWorld>);
    expectDOM(
      fixture.host,
      <host>
        <div on:q-render>
          <span>Hello World</span>
        </div>
      </host>
    );
  });

  it('should render Counter and accept events', async () => {
    const fixture = new ElementFixture();
    await render(fixture.host, <MyCounter step={5} value={15} />);
    expectDOM(
      fixture.host,
      <host>
        <my-counter>
          <div>
            <button>-</button>
            <span>15</span>
            <button>+</button>
          </div>
        </my-counter>
      </host>
    );
    await trigger(fixture.host, 'button.decrement', 'click');
    expectDOM(
      fixture.host,
      <host>
        <my-counter>
          <div>
            <button>-</button>
            <span>10</span>
            <button>+</button>
          </div>
        </my-counter>
      </host>
    );
  });

  it('should render a collection of todo items', async () => {
    const host = new ElementFixture().host;
    const items = createStore({
      items: [
        createStore({
          done: true,
          title: 'Task 1',
        }),
        createStore({
          done: false,
          title: 'Task 2',
        }),
      ],
    });
    await render(host, <Items items={items} />);
    await delay(0);
    expectDOM(
      host,
      <host>
        <items>
          <item-detail>
            <input type="checkbox" checked />
            <span>Task 1</span>
          </item-detail>
          <item-detail>
            <input type="checkbox" />
            <span>Task 2</span>
          </item-detail>
          Total: {'2'}
        </items>
      </host>
    );
  });
});

/////////////////////////////////////////////////////////////////////////////
export const HelloWorld = component$(() => {
  withStyles(runtimeQrl(`{}`));
  return onRender$(() => {
    return <span>Hello World</span>;
  });
});

/////////////////////////////////////////////////////////////////////////////
// <Greeter salutation="" name=""/>

export const Greeter = component$((props: { salutation?: string; name?: string }) => {
  const state = createStore({ count: 0 });
  return onRender$(() => (
    <div>
      {' '}
      {props.salutation} {props.name} ({state.count}){' '}
    </div>
  ));
});

//////////////////////////////////////////////
// import { QComponent, component, qView, qHandler, getState, markDirty } from '@builder.io/qwik';

// Component view may need additional handlers describing the component's behavior.
export const MyCounter_update = () => {
  const [props, state, args] =
    useLexicalScope<[PropsOf<typeof MyCounter>, { count: number }, { dir: number }]>();
  state.count += args.dir * (props.step || 1);
};

// Finally tie it all together into a component.
export const MyCounter = component(
  'my-counter',
  $((props: { step?: number; value?: number }) => {
    const state = createStore({ count: props.value || 0 });
    return onRender$(() => (
      <div>
        <button
          class="decrement"
          on:click={runtimeQrl(MyCounter_update, [props, state, { dir: -1 }])}
        >
          -
        </button>
        <span>{state.count}</span>
        <button
          class="increment"
          on:click={runtimeQrl(MyCounter_update, [props, state, { dir: -1 }])}
        >
          +
        </button>
      </div>
    ));
  })
);

/////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////

interface ItemObj {
  title: string;
  done: boolean;
}

interface ItemsObj {
  items: ItemObj[];
}

/////////////////////////////////////////////////////////////////////////////

export const ItemDetail = component(
  'item-detail',
  $((props: { itemObj: ItemObj }) => {
    // const state = createStore({ editing: false });
    return onRender$(() => (
      <>
        <input type="checkbox" checked={props.itemObj.done} />
        <span>{props.itemObj.title || 'loading...'}</span>
      </>
    ));
  })
);

/////////////////////////////////////////////////////////////////////////////

export const Items = component(
  'items',
  $((props: { items: ItemsObj }) => {
    // const state = createStore({ editing: false });
    return onRender$(() => (
      <>
        {props.items.items.map((item) => (
          <ItemDetail itemObj={item} />
        ))}
        Total: {props.items.items.length}
      </>
    ));
  })
);

function delay(miliseconds: number): Promise<void> {
  return new Promise((res) => setTimeout(res, miliseconds));
}
