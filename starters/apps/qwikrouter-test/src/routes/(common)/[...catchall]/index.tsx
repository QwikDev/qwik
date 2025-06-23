import { component$ } from "@qwik.dev/core";
import {
  type DocumentHead,
  type RequestHandler,
  useLocation,
} from "@qwik.dev/router";

export default component$(() => {
  const loc = useLocation();

  return (
    <div>
      <h1>Catch All</h1>
      <p>
        <span>loc.params.catchall: </span>
        <code data-test-params="catchall">{loc.params.catchall}</code>
      </p>
      <p>
        <a href="/qwikrouter-test/">Home</a>
      </p>
    </div>
  );
});

export const head: DocumentHead = () => {
  return {
    title: "Catch All",
  };
};

export const onGet: RequestHandler = ({
  error,
  url,
  exit: exitMiddlewares,
}) => {
  if (url.pathname === "/qwikrouter-test/catchall-error/") {
    throw error(500, "ERROR: Demonstration of an error response.");
  }

  if (url.pathname === "/qwikrouter-test/catchall/") {
    // special case catchall
    return;
  }

  exitMiddlewares();
};
