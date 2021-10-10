//
// This file stores example snippets which are found in the docs.
//
// Edit the snippet here and verify that it compiles, than paste
// it to the desired comment location
//

import { Fragment, h, qComponent, qHook, qRender } from '@builder.io/qwik';

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////
// DOCS: qComponent
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

//
// - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -

export const update = qHook<typeof Counter, { direction: number }>((props, state, args) => {
  state.count += args.direction * (props.step || 1);
});

export const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
  onMount: qHook((props) => ({ count: props.value || 0 })),
  onRender: qHook((props, state) => (
    <div>
      <button on:click={update.with({ direction: -1 })}>-</button>
      <span>{state.count}</span>
      <button on:click={update.with({ direction: +1 })}>+</button>
    </div>
  )),
});
// - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
//

const OtherComponent = qComponent({} as any);
//
// - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
export const otherOnRender = qHook<typeof OtherComponent>(() => <Counter value={100} />);
// - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
//

() => {
  //
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  const Counter = qComponent<{}, { count: number }>({
    onMount: qHook(() => ({ count: 0 })),
    onRender: qHook((props, state) => <div>{state.count}</div>),
  });
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  //
  return Counter;
};

() => {
  //
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  const Greeter = qComponent<{ name?: string }, { salutation: string }>({
    onMount: qHook(() => ({ salutation: 'Hello' })),
    onRender: qHook((props, state) => (
      <span>
        {state.salutation} {props.name || 'World'}!
      </span>
    )),
  });
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  //
  return Greeter;
};

() => {
  const other = {};
  //
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  const MyComp = qComponent({
    onRender: qHook(() => <span />),
    props: { title: 'MyTitle', label: 'defaultLabel' },
    ...other,
  });
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  //
  return MyComp;
};

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////
// DOCS: QComponentFacade
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

() => {
  //
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  const Greeter = qComponent<{ name?: string }, { salutation: string }>({
    onMount: qHook(() => ({ salutation: 'Hello' })),
    onRender: qHook((props, state) => (
      <span>
        {state.salutation} {props.name || 'World'}!
      </span>
    )),
  });
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  //
  //
  //
  return [otherOnRender, Greeter];
};

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////
// DOCS: QComponent
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

() => {
  //
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  const Greet = qComponent<{ name: string }>({
    onRender: qHook((props) => <span>Hello {props.name}</span>),
  });
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  //
  //
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  qRender(document.body, <Greet name="World" />);
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  //
  return otherOnRender;
};

() => {
  type Socket = any;
  function someCodeToConnectToServer(name: string, cb: (price: number) => void): Socket {
    return [name, cb]!;
  }
  //
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  interface StockProps {
    stock: string; // Stock ticker symbol
  }
  interface StockState {
    price: number; // Last price in cents
  }
  interface StockTransient {
    tickerStream: Socket; // Streaming service delivering stock prices
  }

  function StockRef(props: StockProps, state: StockState): StockTransient {
    return {
      tickerStream: someCodeToConnectToServer(props.stock, (price) => {
        // Writing to state will automatically schedule component for rendering.
        state.price = price;
      }),
    };
  }
  const useRef: any = () => null;
  const Stock = qComponent<StockProps, StockState>({
    onMount: qHook(() => ({ price: 0 })),
    onRender: qHook((props, state) => (
      <span>
        Stock {props.stock} {state.price} (cents)
      </span>
    )),
    onResume: qHook(() => {
      useRef(StockRef);
    }),
  });
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  //
  return [otherOnRender, Stock];
};

() => {
  //
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  const update = qHook<typeof Counter, { value: number }>((params: any, state: any) => {
    state.count += params.value;
  });
  const Counter = qComponent<{ initial: number }, { count: number }>({
    onMount: qHook((props) => ({
      count: props.initial || 0,
    })),
    onRender: qHook((props, state) => (
      <div>
        <button on:click={update.with({ value: -1 })}>-</button>
        <span>{state.count}</span>
        <button on:click={update.with({ value: +1 })}>+</button>
      </div>
    )),
  });
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  //
};

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////
// DOCS: OnMount
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

() => {
  //
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  const Greet = qComponent<{ name: string }, { salutation: string }>({
    onMount: qHook(() => {
      // Invoked on component creation before first render.
      // Main responsibility is to create component `STATE`
      return {
        salutation: 'Hello',
      }; // Must be of `STATE` shape (`StateOf<Greet>`)
    }),
    onRender: qHook((props, state) => (
      <span>
        {state.salutation} {props.name}!
      </span>
    )),
  });
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  //
  return [otherOnRender, Greet];
};

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////
// DOCS: OnRender
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

() => {
  //
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  const Greet = qComponent<{ name: string }>({
    onRender: qHook((props) => <span>Hello {props.name}!</span>),
  });
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  //
  return [Greet, otherOnRender];
};

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////
// DOCS: OnUnmount
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

() => {
  //
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  // STEP 1: Declare component shape
  // STEP 2: Declare `OnUnmount` hook
  // STEP 3: pass `on` into `qComponent`
  const Greet = qComponent<{ name: string }>({
    onRender: qHook((props) => <span>Hello {props.name}!</span>),
    onUnmount: qHook(() => {
      // Get notified of unmount
    }),
  });
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  //
  const condition = false as any;
  //
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  const otherOnRender = qHook(() => (condition ? <Greet name="World" /> : null));
  // - 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -- 8>< -
  //
  return otherOnRender;
};
