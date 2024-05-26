import { Counter } from "./components/counter/counter";
import { Logo } from "./components/logo/logo";

export default () => {
  return (
    <>
      <head>
        <meta charset="utf-8" />
        <title>Qwik Blank App</title>
      </head>
      <body>
        <Logo />
        <Counter />
      </body>
    </>
  );
};
