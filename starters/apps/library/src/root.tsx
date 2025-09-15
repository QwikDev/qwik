import { Counter } from "./components/counter/counter";
import { Logo } from "./components/logo/logo";

export default () => {
  return (
    <>
      <head>
        <meta charset="utf-8" />
        <title>Qwik Library Starter</title>
      </head>
      <body>
        <h1>Qwik Library Starter</h1>
        <p>
          This is a Qwik library starter. Make your components and export them
          from `src/index.ts`. This playground app will not be bundled with your
          library.
        </p>
        <Logo />
        <Counter />
      </body>
    </>
  );
};
