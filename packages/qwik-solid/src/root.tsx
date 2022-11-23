import { App } from './examples/app';
import { generateHydrationScript } from 'solid-js/web';
import { component$, useSignal, useStore } from '@builder.io/qwik';

export const Root = () => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Qwik Blank App</title>
        <div dangerouslySetInnerHTML={generateHydrationScript()} />
      </head>

      <body>
        <MyQwikComponent />
      </body>
    </html>
  );
};

export const MyQwikComponent = component$(() => {
  const counter = useStore({value: 0})

  return (
    <div>
      <h1>Hello from Qwik</h1>
      <button onClick$={() => counter.value++}>Increment from Qwik</button>
      <App client:hover>&nbsp;Qwik count: {counter.value}</App>
      <h1>More qwik!</h1>
    </div>
  );
});
