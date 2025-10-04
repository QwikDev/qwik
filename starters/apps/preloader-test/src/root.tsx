import { component$ } from "@qwik.dev/core";
import { useQwikRouter, RouterOutlet } from "@qwik.dev/router";
import { RouterHead } from "./components/router-head/router-head";

import "./global.css";

export default component$(() => {
  useQwikRouter();

  return (
    <>
      <head>
        <meta charset="utf-8" />
        <RouterHead />
      </head>
      <body lang="en">
        <RouterOutlet />
      </body>
    </>
  );
});
