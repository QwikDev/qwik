import { QwikRouterProvider, RouterOutlet } from "@qwik.dev/router";
import { SomeProvider } from "./components/provider/provider";
import { RouterHead } from "./components/router-head/router-head";
import "./global.css";

export default function Root() {
  return (
    <SomeProvider>
      <QwikRouterProvider>
        <head>
          <meta charset="utf-8" />
          <RouterHead />
        </head>
        <body>
          <RouterOutlet />
        </body>
      </QwikRouterProvider>
    </SomeProvider>
  );
}
