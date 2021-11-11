import { Fragment, h, qHook, qObject } from '@builder.io/qwik';
import { ElementFixture, trigger } from '../../testing/element_fixture';
import { expectDOM } from '../../testing/expect-dom.unit';
import { qRender } from '../render/q-render.public';
import { TEST_CONFIG } from '../util/test_config';
import { qComponent } from './q-component.public';
import { qStyles } from './qrl-styles';

describe('q-component', () => {
  it('should declare and render basic component', async () => {
    const fixture = new ElementFixture(TEST_CONFIG);
    await qRender(fixture.host, <HelloWorld></HelloWorld>);
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
    const fixture = new ElementFixture(TEST_CONFIG);
    await qRender(fixture.host, <MyCounter step={5} value={15} />);
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
    const host = new ElementFixture(TEST_CONFIG).host;
    const items = qObject({
      items: [
        qObject({
          done: true,
          title: 'Task 1',
        }),
        qObject({
          done: false,
          title: 'Task 2',
        }),
      ],
    });
    await qRender(host, <Items items={items} />);
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
export const HelloWorld = qComponent({
  onRender: qHook(() => {
    return <span>Hello World</span>;
  }),
  styles: qStyles('./mock.unit.css#ABC123'),
});

/////////////////////////////////////////////////////////////////////////////
// <Greeter salutation="" name=""/>

export const Greeter = qComponent<{ salutation?: string; name?: string }, { count: number }>({
  onMount: qHook(() => ({ count: 0 })),
  onRender: qHook((props, state) => (
    <div>
      {props.salutation} {props.name} ({state.count})
    </div>
  )),
});

//////////////////////////////////////////////
// import { QComponent, qComponent, qView, qHandler, getState, markDirty } from '@builder.io/qwik';

// Component view may need additional handlers describing the component's behavior.
export const MyCounter_update = qHook<typeof MyCounter, { dir: number }>((props, state, args) => {
  state.count += args.dir * (props.step || 1);
});

// Finally tie it all together into a component.
export const MyCounter = qComponent<{ step?: number; value?: number }, { count: number }>({
  tagName: 'my-counter',
  onMount: qHook((props) => ({ count: props.value || 0 })),
  onRender: qHook((props, state) => (
    <div>
      <button class="decrement" on:click={MyCounter_update.with({ dir: -1 })}>
        -
      </button>
      <span>{state.count}</span>
      <button class="increment" on:click={MyCounter_update.with({ dir: +1 })}>
        +
      </button>
    </div>
  )),
});

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

export const ItemDetail = qComponent<{ itemObj: ItemObj }, { editing: boolean }>({
  tagName: 'item-detail',
  onMount: qHook(() => ({ editing: false })),
  onRender: qHook((props) => (
    <>
      <input type="checkbox" checked={props.itemObj.done} />
      <span>{props.itemObj.title || 'loading...'}</span>
    </>
  )),
});

/////////////////////////////////////////////////////////////////////////////

export const Items = qComponent<{ items: ItemsObj }, { editing: boolean }>({
  tagName: 'items',
  onMount: qHook(() => ({ editing: false })),
  onRender: qHook((props) => (
    <>
      {props.items.items.map((item) => (
        <ItemDetail itemObj={item} />
      ))}
      Total: {props.items.items.length}
    </>
  )),
});

function delay(miliseconds: number): Promise<void> {
  return new Promise((res) => setTimeout(res, miliseconds));
}
