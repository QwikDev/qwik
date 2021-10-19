//
// This file stores example snippets which are found in the docs.
//
// Edit the snippet here and verify that it compiles, than paste
// it to the desired comment location
//

import { Fragment, h, qComponent, qHook } from '@builder.io/qwik';

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////
// DOCS: qComponent
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

//
// <docs anchor="component">
export const Counter = qComponent<{ value?: number; step?: number }, { count: number }>({
  onMount: qHook((props) => ({ count: props.value || 0 })),
  onRender: qHook((props, state) => (
    <div>
      <span>{state.count}</span>
      <button
        on:click={qHook<typeof Counter>((props, state) => {
          state.count += props.step || 1;
        })}
      >
        +
      </button>
    </div>
  )),
});
// </docs>
//

//
// <docs anchor="component-usage">
export const OtherComponent = qComponent({
  onRender: qHook(() => <Counter value={100} />),
});
// </docs>
//

() => {
  //
  // <docs anchor="on-render">
  const Counter = qComponent<{ name: string }>({
    onRender: qHook((props) => <div>{props.name}</div>),
  });
  // </docs>
  //
  return Counter;
};

() => {
  //
  // <docs anchor="on-mount">
  const Counter = qComponent<{}, { count: number }>({
    onMount: qHook(() => ({ count: 0 })),
    onRender: qHook((props, state) => <div>{state.count}</div>),
  });
  // </docs>
  //
  return Counter;
};

(other: any) => {
  //
  // <docs anchor="props">
  const MyComp = qComponent({
    props: { title: 'MyTitle', label: 'defaultLabel' },
    ...other,
  });
  // </docs>
  //
  return MyComp;
};
