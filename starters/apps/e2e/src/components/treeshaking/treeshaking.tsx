/* eslint-disable */
import { component$, useStore, Host, createContext, useContextProvider } from '@builder.io/qwik';

export const LOGS = createContext<{ content: string }>('qwik.logs.resource');

export const TreeshakingApp = component$(() => {
  const logs = {
    content: '',
  };
  useContextProvider(LOGS, logs);

  const state = useStore({
    text: 'text',
  });
  return (
    <Host>
      <Child text={state} />
    </Host>
  );
});

export const Child = component$((props: { text: { text: string } }) => {
  const state = useStore({
    text: 'child',
  });

  return (
    <Host>
      <span onClick$={() => console.log('hola')}>Text: {props.text.text}</span>
      <span>Child: {state.text}</span>
    </Host>
  );
});
