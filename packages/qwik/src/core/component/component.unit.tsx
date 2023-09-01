import { createDOM } from '../../testing/library';
import { expectDOM } from '../../testing/expect-dom.unit';
import { inlinedQrl } from '../qrl/qrl';
import { useStylesQrl } from '../use/use-styles';
import { type PropsOf, component$ } from './component.public';
import { suite } from 'uvu';
import { useStore } from '../use/use-store.public';
import { useLexicalScope } from '../use/use-lexical-scope.public';

/**
 * Applying new unit test library/layer
 * `@builder.io/qwik/testing`  ==>  ../../testing/library
 */
const qComponent = suite('q-component');
qComponent('should declare and render basic component', async () => {
  const { screen, render } = await createDOM();
  await render(<HelloWorld />);
  await expectDOM(
    screen,
    `
    <host q:version="dev" q:container="resumed" q:render="dom-dev">
        <style q:style="pfkgyr-0" hidden="">
          {}
        </style>
        <!--qv -->
        <span>Hello World</span>
        <!--/qv-->
      </host>`
  );
});

qComponent('should render Counter and accept events', async () => {
  const { screen, render, userEvent } = await createDOM();

  await render(<MyCounter step={5} value={15} />);
  await expectDOM(
    screen,
    `
    <host q:version="dev" q:container="resumed" q:render="dom-dev">
    <!--qv -->
    <my-counter>
      <button class="decrement">-</button>
      <span>15</span>
      <button class="increment">+</button>
    </my-counter>
    <!--/qv-->
  </host>`
  );
  await userEvent('button.decrement', 'click');
  await expectDOM(
    screen,
    `
<host q:version="dev" q:container="resumed" q:render="dom-dev">
  <!--qv -->
  <my-counter>
    <button
      class="decrement"
    >
      -
    </button>
    <span>10</span>
    <button
      class="increment"
    >
      +
    </button>
  </my-counter>
  <!--/qv-->
</host>`
  );
});

qComponent('should render a collection of todo items', async () => {
  const { screen, render } = await createDOM();

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
  await render(<Items items={items} />);
  await delay(0);
  await expectDOM(
    screen,
    `
    <host q:version="dev" q:container="resumed" q:render="dom-dev">
      <!--qv -->
      <items>
        <!--qv -->
        <item-detail>
          <input type="checkbox" checked="" />
          <span>Task 1</span>
        </item-detail>
        <!--/qv-->
        <!--qv -->
        <item-detail>
          <input type="checkbox" />
          <span>Task 2</span>
        </item-detail>
        <!--/qv-->
        Total: 2
      </items>
      <!--/qv-->
    </host>
    `
  );
});

/////////////////////////////////////////////////////////////////////////////
export const HelloWorld = component$(() => {
  useStylesQrl(inlinedQrl(`{}`, 'named-style'));
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
export const MyCounter = component$((props: { step?: number; value?: number }) => {
  const state = useStore({ count: props.value || 0 });
  return (
    <my-counter>
      <button
        class="decrement"
        onClick$={inlinedQrl(MyCounter_update, 'update', [props, state, { dir: -1 }])}
      >
        -
      </button>
      <span>{state.count}</span>
      <button
        class="increment"
        onClick$={inlinedQrl(MyCounter_update, 'update', [props, state, { dir: 1 }])}
      >
        +
      </button>
    </my-counter>
  );
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

export const ItemDetail = component$((props: { itemObj: ItemObj }) => {
  // const state = useStore({ editing: false });
  return (
    <item-detail>
      <input type="checkbox" checked={props.itemObj.done} />
      <span>{props.itemObj.title || 'loading...'}</span>
    </item-detail>
  );
});

/////////////////////////////////////////////////////////////////////////////

export const Items = component$((props: { items: ItemsObj }) => {
  // const state = useStore({ editing: false });
  return (
    <items>
      {props.items.items.map((item) => (
        <ItemDetail itemObj={item} />
      ))}
      Total: {props.items.items.length}
    </items>
  );
});

function delay(milliseconds: number): Promise<void> {
  return new Promise((res) => setTimeout(res, milliseconds));
}

qComponent.run();
