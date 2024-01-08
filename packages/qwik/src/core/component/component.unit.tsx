import { createDOM } from '../../testing/library';
import { expectDOM } from '../../testing/expect-dom';
import { inlinedQrl } from '../qrl/qrl';
import { useStylesQrl } from '../use/use-styles';
import { type PropsOf, component$, type PropFunctionProps } from './component.public';
import { useStore } from '../use/use-store.public';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { describe, test, expectTypeOf } from 'vitest';
import type { InputHTMLAttributes } from '../render/jsx/types/jsx-generated';
import type { QwikIntrinsicElements } from '../render/jsx/types/jsx-qwik-elements';
import type { PropFunction, QRL } from '../qrl/qrl.public';

describe('q-component', () => {
  /**
   * Applying new unit test library/layer
   *
   * `@builder.io/qwik/testing` ==> ../../testing/library
   */
  test('should declare and render basic component', async () => {
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

  test('should render Counter and accept events', async () => {
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

  test('should render a collection of todo items', async () => {
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

  test('types work as expected', () => () => {
    // Let's keep one of these old type exports around for now.
    const Input1 = component$<InputHTMLAttributes<HTMLInputElement>>((props) => {
      return <input {...props} />;
    });

    const Input2 = component$((props: PropFunctionProps<PropsOf<'input'>>) => {
      return <input {...props} />;
    });

    type Input5Props = {
      type: 'text' | 'number';
    } & Partial<PropsOf<'input'>>;

    const Input5 = component$<Input5Props>(({ type, ...props }) => {
      return <input type={type} {...props} />;
    });

    type Input6Props = {
      type: 'text' | 'number';
    } & QwikIntrinsicElements['input'];

    const Input6 = component$<Input6Props>(({ type, ...props }) => {
      return (
        <div>
          <input type={type} {...props} />
        </div>
      );
    });

    component$(() => {
      return (
        <>
          <Input1
            style={{
              paddingInlineEnd: '10px',
            }}
            value="1"
          />
          <Input2 value="2" />
          <Input5 value="5" type="text" />
          <Input6 value="6" type="number" />
        </>
      );
    });
  });

  test('custom function types should work', () => () => {
    type TestProps = PropsOf<'h1'> & {
      plain$?: () => void;
      qrl$?: QRL<() => void>;
    };
    const Test1 = component$<TestProps>(({ plain$, qrl$, ...props }) => {
      return (
        <>
          <h1 onClick$={plain$} onDblClick$={qrl$} {...props}>
            Hi 👋
          </h1>
        </>
      );
    });
    expectTypeOf<TestProps['plain$']>().toMatchTypeOf<Parameters<typeof Test1>[0]['plain$']>();
    expectTypeOf<TestProps['qrl$']>().toMatchTypeOf<Parameters<typeof Test1>[0]['qrl$']>();
    expectTypeOf<Parameters<typeof Test1>[0]['plain$']>().toEqualTypeOf<
      (() => void) | QRL<() => void> | undefined
    >();
    expectTypeOf<Parameters<typeof Test1>[0]['qrl$']>().toEqualTypeOf<
      (() => void) | QRL<() => void> | undefined
    >();

    const Test2 = component$(({ plain$, qrl$, ...props }: TestProps) => {
      return (
        <>
          <h1 onClick$={plain$} onDblClick$={qrl$} {...props}>
            Hi 👋
          </h1>
        </>
      );
    });
    expectTypeOf<TestProps['plain$']>().toMatchTypeOf<Parameters<typeof Test2>[0]['plain$']>();
    expectTypeOf<TestProps['qrl$']>().toMatchTypeOf<Parameters<typeof Test2>[0]['qrl$']>();
    expectTypeOf<Parameters<typeof Test2>[0]['plain$']>().toEqualTypeOf<
      (() => void) | QRL<() => void> | undefined
    >();
    expectTypeOf<Parameters<typeof Test2>[0]['qrl$']>().toEqualTypeOf<
      (() => void) | QRL<() => void> | undefined
    >();
    component$(() => {
      return (
        <>
          <Test1 />
          <Test2 />
        </>
      );
    });
  });

  test('PropFunction should work', () => () => {
    type TestProps = PropsOf<'h1'> & {
      test$?: PropFunction<() => void>;
    };
    const Test1 = component$<TestProps>(({ test$, ...props }) => {
      return (
        <>
          <h1 onClick$={test$} {...props}>
            Hi 👋
          </h1>
        </>
      );
    });
    expectTypeOf<TestProps['test$']>().toMatchTypeOf<Parameters<typeof Test1>[0]['test$']>();
    expectTypeOf<QRL<() => void>>().toMatchTypeOf<Parameters<typeof Test1>[0]['test$']>();
  });
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
