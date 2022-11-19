import { App } from './examples/app';

export const Root = () => {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Qwik Blank App</title>
      </head>

      <body>
        <h1>Hello from Qwik</h1>
        <App client:hover />
        <h1>More qwik!</h1>
      </body>
    </html>
  );
};
