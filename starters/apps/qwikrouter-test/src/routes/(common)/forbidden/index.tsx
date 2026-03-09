import { component$ } from "@qwik.dev/core";
import { type RequestHandler } from "@qwik.dev/router";

export const onGet: RequestHandler = (ev) => {
  throw ev.error(403, "Forbidden resource");
};

export default component$(() => {
  return <div>This should never render</div>;
});
