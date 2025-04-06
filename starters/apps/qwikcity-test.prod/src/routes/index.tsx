import { component$ } from "@builder.io/qwik";

export default component$(() => {
  return (
    <div>
      <h1>Welcome to Qwik City!</h1>
      <p>
        <a href="/qwikcity-test.prod/server-function">Server Function</a>
      </p>
    </div>
  );
});
