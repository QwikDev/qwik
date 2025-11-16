import type { RequestHandler } from "@qwik.dev/router";
import { component$, getLocale } from "@qwik.dev/core";

export const onRequest: RequestHandler = ({ locale }) => {
  locale("test-locale");
};

export default component$(() => {
  return (
    <div>
      Current locale: <span class="locale">{getLocale()}</span>
    </div>
  );
});
