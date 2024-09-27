import type { RequestHandler } from "@qwikdev/city";
import { component$, getLocale } from "@qwikdev/core";

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
