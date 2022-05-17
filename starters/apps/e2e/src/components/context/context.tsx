import {
  useStore,
  component$,
  Host,
  createContext,
  useContextProvider,
  useContext,
} from '@builder.io/qwik';

export interface ContextI {
  displayName: string;
  count: number;
}

export const Context1 = createContext<ContextI>('ctx');
export const Context2 = createContext<ContextI>('ctx1');
export const Context3 = createContext<ContextI>('ctx2');

export const ContextRoot = component$(async () => {
  const state1 = useStore({ displayName: 'ROOT / state1', count: 0 });
  const state2 = useStore({ displayName: 'ROOT / state2', count: 0 });

  useContextProvider(Context1, state1);
  useContextProvider(Context2, state2);

  return (
    <Host>
      <button class="root-increment1" onClick$={() => state1.count++}>
        Increment State 1
      </button>
      <button class="root-increment2" onClick$={() => state2.count++}>
        Increment State 2
      </button>

      <Level2 />
      <Level2 />
    </Host>
  );
});

// This code will not work because its async before reading subs
export const Level2 = component$(() => {
  const level2State1 = useStore({ displayName: 'Level2 / state1', count: 0 });
  useContextProvider(Context1, level2State1);

  const state3 = useStore({ displayName: 'Level2 / state3', count: 0 });
  useContextProvider(Context3, state3);

  const state1 = useContext(Context1);
  const state2 = useContext(Context2);

  return (
    <Host>
      <h1>Level2</h1>
      <div class="level2-state1">
        {state1.displayName} = {state1.count}
      </div>
      <div class="level2-state2">
        {state2.displayName} = {state2.count}
      </div>

      <button class="level2-increment3" onClick$={() => state3.count++}>
        Increment
      </button>

      {Array.from({ length: state3.count }, () => {
        return <Level3></Level3>;
      })}
    </Host>
  );
});

export const Level3 = component$(() => {
  const state1 = useContext(Context1);
  const state2 = useContext(Context2);
  const state3 = useContext(Context3);

  return (
    <Host>
      <h2>Level3</h2>
      <div class="level3-state1">
        {state1.displayName} = {state1.count}
      </div>
      <div class="level3-state2">
        {state2.displayName} = {state2.count}
      </div>
      <div class="level3-state3">
        {state3.displayName} = {state3.count}
      </div>
    </Host>
  );
});
