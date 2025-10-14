import { component$ } from "@qwik.dev/core";
import { Logo } from "../components/logo/logo";
import { Counter } from "../components/counter/counter";

export default component$(() => {
  return (
    <>
      <h1>Qwik Library Starter</h1>
      <p>
        This is a Qwik library starter. Make your components and export them
        from `src/index.ts`. This playground app will not be bundled with your
        library. You can use the Router like a normal Qwik app with the Qwik
        Router.
      </p>
      <Logo />
      <Counter />
    </>
  );
});
