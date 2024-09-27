import type { RequestHandler } from "@qwikdev/city";
import { component$, Slot } from "@qwikdev/core";
import { extractLang, useI18n } from "~/routes/[locale]/i18n-utils";

export const onRequest: RequestHandler = ({ locale, params }) => {
  locale(extractLang(params.locale));
};

export default component$(() => {
  useI18n();
  return <Slot />;
});
