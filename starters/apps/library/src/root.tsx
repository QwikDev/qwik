import { QwikRouterProvider, RouterOutlet } from "@qwik.dev/router";

export default () => {
  return (
    <QwikRouterProvider>
      <head>
        <meta charset="utf-8" />
        <title>Qwik Blank App</title>
      </head>
      <body>
        <RouterOutlet />
      </body>
    </QwikRouterProvider>
  );
};
