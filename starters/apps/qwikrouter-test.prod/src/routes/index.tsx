import { component$ } from "@qwik.dev/core";

export default component$(() => {
  return (
    <div>
      <h1>Welcome to Qwik Router!</h1>
      <p>
        <a href="/qwikrouter-test.prod/server-function">Server Function</a>
      </p>
    </div>
  );
});
