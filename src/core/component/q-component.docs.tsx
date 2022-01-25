//
// This file stores example snippets which are found in the docs.
//
// Edit the snippet here and verify that it compiles, than paste
// it to the desired comment location
//

import { Fragment, h, qComponent } from '@builder.io/qwik';
import { useStore } from '../use/use-state.public';
import { onRender } from './q-component.public';

//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////
// DOCS: qComponent
//////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////

//
// <docs anchor="component">
export const Counter = qComponent((props: { value?: number; step?: number }) => {
  const state = useStore({ count: props.value || 0 });
  return onRender(() => (
    <div>
      <span>{state.count}</span>
      <button on:click={() => (state.count += props.step || 1)}>+</button>
    </div>
  ));
});
// </docs>
//

//
// <docs anchor="component-usage">
export const OtherComponent = qComponent(() => {
  return onRender(() => <Counter value={100} />);
});
// </docs>
//

() => {
  //
  // <docs anchor="on-render">
  const Counter = qComponent((props: { name: string }) => {
    return onRender(() => <div>{props.name}</div>);
  });
  // </docs>
  //
  return Counter;
};

() => {
  //
  // <docs anchor="on-mount">
  const Counter = qComponent(() => {
    const state = useStore({ count: 0 });
    return onRender(() => <div>{state.count}</div>);
  });
  // </docs>
  //
  return Counter;
};

(other: [Record<string, any>]) => {
  //
  // <docs anchor="props">
  const MyComp = qComponent((props: { title: 'MyTitle'; label: 'defaultLabel' }) => {
    return onRender(() => <span title={props.label}></span>);
  });
  // </docs>
  //
  return [MyComp, other];
};
