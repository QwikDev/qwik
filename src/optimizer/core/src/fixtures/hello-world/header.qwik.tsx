/* eslint-disable */
import { qComponent, qHook, h } from '@builder.io/qwik';

export const Header = qComponent({
  onMount: qHook(() => {
    console.log('mount');
  }),
  onRender: qHook(() => {
    return (
      <>
        <div onClick={qHook((ctx) => console.log(ctx))} />
        <div onClick={qHook((ctx) => console.log(ctx))} />
      </>
    );
  }),
});
