/* eslint-disable */
import { component$, useClientEffect$, useStore, useStyles$ } from '@builder.io/qwik';

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
      <Eager></Eager>
    </div>
  );
});

export const Timer = component$(() => {
  console.log('<Timer> renders');

  const state = useStore({
    count: 0,
    msg: 'empty',
  });

  // Double count watch
  useClientEffect$(() => {
    state.msg = 'run';
  });

  // Double count watch
  useClientEffect$(() => {
    state.count = 10;
    const timer = setInterval(() => {
      state.count++;
    }, 500);
    return () => {
      clearInterval(timer);
    };
  });

  return (
    <div>
      <div id="counter">{state.count}</div>
      <div id="msg">{state.msg}</div>
    </div>
  );
});

export const Eager = component$(() => {
  console.log('<Timer> renders');

  const state = useStore({
    msg: 'empty',
  });

  // Double count watch
  useClientEffect$(
    () => {
      state.msg = 'run';
    },
    {
      eagerness: 'load',
    }
  );

  return (
    <div>
      <div id="eager-msg">{state.msg}</div>
    </div>
  );
});
