import { component$ } from "@builder.io/qwik";
import type { RequestHandler } from "@builder.io/qwik-city";

export const onGet: RequestHandler<void> = ({ redirect }) => {
  throw redirect(302, `/qwikcity-test/issue7732/c/?redirected=true`);
};

export default component$(() => {
  return <div>B route with redirect</div>;
});
