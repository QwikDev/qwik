import { App } from './examples/app';
import { generateHydrationScript } from 'solid-js/web';

export const Root = () => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Qwik Blank App</title>
        <div dangerouslySetInnerHTML={generateHydrationScript()} />
      </head>

      <body>
        <h1>Hello from Qwik</h1>
        <App client:hover />
        <h1>More qwik!</h1>
      </body>
    </html>
  );
};
