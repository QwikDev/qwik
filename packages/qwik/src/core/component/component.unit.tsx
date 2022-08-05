import { ElementFixture, trigger } from '../../testing/element-fixture';
import { expectDOM } from '../../testing/expect-dom.unit';
import { runtimeQrl } from '../import/qrl';
import { useStylesQrl } from '../use/use-styles';
import { PropsOf, component$ } from './component.public';
import { suite } from 'uvu';
import { useStore } from '../use/use-store.public';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { render } from '../render/dom/render.public';

const qComponent = suite('q-component');
qComponent('should declare and render basic component', async () => {
  const fixture = new ElementFixture();
  await render(fixture.host, <HelloWorld></HelloWorld>);
  const Host = 'q:host' as any;
  await expectDOM(
    fixture.host,
    <host>
      <Host>
        <span>Hello World</span>
      </Host>
    </host>
  );
});

qComponent('should render Counter and accept events', async () => {
  const fixture = new ElementFixture();
  await render(fixture.host, <MyCounter step={5} value={15} />);
  await expectDOM(
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
  await expectDOM(
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

qComponent('should render a collection of todo items', async () => {
  const host = new ElementFixture().host;
  const items = {
    items: [
      {
        done: true,
        title: 'Task 1',
      },
      {
        done: false,
        title: 'Task 2',
      },
    ],
  };
  await render(host, <Items items={items} />);
  await delay(0);
  await expectDOM(
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

/////////////////////////////////////////////////////////////////////////////
export const HelloWorld = component$(() => {
  useStylesQrl(runtimeQrl(`{}`));
  return <span>Hello World</span>;
});

/////////////////////////////////////////////////////////////////////////////
// <Greeter salutation="" name=""/>

export const Greeter = component$((props: { salutation?: string; name?: string }) => {
  const state = useStore({ count: 0 });
  return (
    <div>
      {' '}
      {props.salutation} {props.name} ({state.count}){' '}
    </div>
  );
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
export const MyCounter = component$(
  (props: { step?: number; value?: number }) => {
    const state = useStore({ count: props.value || 0 });
    return (
      <div>
        <button
          class="decrement"
          onClick$={runtimeQrl(MyCounter_update, [props, state, { dir: -1 }])}
        >
          -
        </button>
        <span>{state.count}</span>
        <button
          class="increment"
          onClick$={runtimeQrl(MyCounter_update, [props, state, { dir: -1 }])}
        >
          +
        </button>
      </div>
    );
  },
  {
    tagName: 'my-counter',
  }
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

export const ItemDetail = component$(
  (props: { itemObj: ItemObj }) => {
    // const state = useStore({ editing: false });
    return (
      <>
        <input type="checkbox" checked={props.itemObj.done} />
        <span>{props.itemObj.title || 'loading...'}</span>
      </>
    );
  },
  {
    tagName: 'item-detail',
  }
);

/////////////////////////////////////////////////////////////////////////////

export const Items = component$(
  (props: { items: ItemsObj }) => {
    // const state = useStore({ editing: false });
    return (
      <>
        {props.items.items.map((item) => (
          <ItemDetail itemObj={item} />
        ))}
        Total: {props.items.items.length}
      </>
    );
  },
  {
    tagName: 'items',
  }
);

function delay(miliseconds: number): Promise<void> {
  return new Promise((res) => setTimeout(res, miliseconds));
}

qComponent.run();
