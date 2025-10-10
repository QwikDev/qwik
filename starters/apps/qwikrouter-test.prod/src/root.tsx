import { RouterOutlet, useQwikRouter } from "@qwik.dev/router";
import { RouterHead } from "./components/router-head/router-head";
import "./global.css";

export default function Root() {
  useQwikRouter();
  return (
    <>
      <head>
        <meta charset="utf-8" />
        <RouterHead />
      </head>
      <body>
        <RouterOutlet />
      </body>
    </>
  );
}
