import { $, component$, useSignal } from '@qwik.dev/core';
import { openFeature } from './heavy-feature';

function invoke(callback) {
  return callback();
}
function useCustomHook(callback) {
  return invoke(callback);
}
function Consumer(props) {
  return props.onClick$();
}

export const App = component$(() => {
  const count = useSignal(0);
  const click = $(() => openFeature(count.value));
  const wrapped = $(() => openFeature(count.value));
  const render = $(() => count.value);
  const hookRead = $(() => count.value);
  const mixed = $(() => count.value);
  const custom = $(() => count.value);
  render();
  useCustomHook(hookRead);
  mixed();
  return (
    <>
      <button onClick$={click}>direct</button>
      <button onClick$={wrapped}>wrapped</button>
      <button onClick$={mixed}>mixed</button>
      <Consumer onClick$={custom} />
    </>
  );
});
