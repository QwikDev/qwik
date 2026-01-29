// ... other imports
import { guessLocale } from "compiled-i18n";
import type { RequestHandler } from "@builder.io/qwik-city";

/**
 * Handle incoming requests to determine and set the appropriate locale.
 * This function checks for a 'locale' query parameter, then a `locale` cookie,
 * and finally falls back to the 'Accept-Language' header.
 */
export const onRequest: RequestHandler = async ({ query, cookie, headers, locale }) => {
  // Allow overriding locale with query param `locale`
  if (query.has("locale")) {
    const newLocale = guessLocale(query.get("locale"));
    cookie.delete("locale");
    cookie.set("locale", newLocale, {});
    locale(newLocale);
  } else {
    // Choose locale based on cookie or accept-language header
    const maybeLocale = cookie.get("locale")?.value || headers.get("accept-language");
    locale(guessLocale(maybeLocale));
  }
};
