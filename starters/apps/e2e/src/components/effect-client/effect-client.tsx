/* eslint-disable */
import {
  component$,
  useClientEffect$,
  useEffect$,
  useServer$,
  useStore,
  useStyles$,
} from '@builder.io/qwik';

export const EffectClient = component$(() => {
  useStyles$(`.box {
    background: blue;
    width: 100px;
    height: 100px;
    margin: 10px;
  }`);
  console.log('<EffectClient> renders');
  return (
    <div>
      <div class="box" />
      <div class="box" />
      <div class="box" />
      <div class="box" />
      <div class="box" />
      <div class="box" />
      <div class="box" />
      <div class="box" />
      <div class="box" />
      <div class="box" />

      <Timer />
    </div>
  );
});

export const Timer = component$(() => {
  console.log('<Timer> renders');

  const state = useStore({
    count: 0,
  });

  // Double count watch
  useClientEffect$(() => {
    const timer = setInterval(() => {
      state.count++;
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  });

  return <div>{state.count}</div>;
});
