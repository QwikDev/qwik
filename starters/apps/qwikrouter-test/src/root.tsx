import { component$ } from "@qwik.dev/core";
import { RouterOutlet, useQwikRouter } from "@qwik.dev/router";
import { SomeProvider } from "./components/provider/provider";
import { RouterHead } from "./components/router-head/router-head";
import "./global.css";

export default component$(function Root() {
  useQwikRouter();

  return (
    <SomeProvider>
      <head>
        <meta charset="utf-8" />
        <RouterHead />
      </head>
      <body>
        <RouterOutlet />
      </body>
    </SomeProvider>
  );
});
