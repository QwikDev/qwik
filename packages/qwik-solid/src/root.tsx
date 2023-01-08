import { App } from './examples/app';
import { generateHydrationScript } from 'solid-js/web';
import { component$, useSignal, useStore } from '@builder.io/qwik';

export const Root = component$(() => {
  return (
    <>
      <head>
        <meta charSet="utf-8" />
        <title>Qwik Blank App</title>
      </head>

      <body>
        <div dangerouslySetInnerHTML={generateHydrationScript()} />
        <MyQwikComponent />
      </body>
    </>
  );
});

export const MyQwikComponent = component$(() => {
  const counter = useStore({value: 0})
  const label = useSignal('Hello')

  return (
    <div>
      <button onClick$={() => {label.value = 'Hello from QwikSolid'}}>
        Update Label ({label.value})
      </button>
      <br />
      <button onClick$={() => counter.value++}>Increment from Qwik</button>
      <br />
      { /* @ts-expect-error */ }
      <App client:hover label={label.value}>&nbsp;Qwik count: {counter.value}</App>
      <br />
      <h1>More qwik!</h1>
    </div>
  );
});
