import { component$ } from "@qwik.dev/core";
import type { RequestHandler } from "@qwik.dev/router";

export const onGet: RequestHandler<void> = ({ redirect }) => {
  throw redirect(302, `/qwikrouter-test/issue7732/c/?redirected=true`);
};

export default component$(() => {
  return <div>B route with redirect</div>;
});
