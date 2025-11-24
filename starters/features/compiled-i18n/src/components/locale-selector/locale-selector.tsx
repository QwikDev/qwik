import { component$, getLocale } from "@builder.io/qwik";
import { _, locales } from "compiled-i18n";

export const LocaleSelector = component$(() => {
  const currentLocale = getLocale();
  return (
    <>
      {locales.map((locale) => {
        const isCurrent = locale === currentLocale;
        return (
          // Note, you must use `<a>` and not `<Link>` so the page reloads
          <a
            key={locale}
            // When using route-based locale selection, build the URL here
            href={`?locale=${locale}`}
            aria-disabled={isCurrent}
            class={
              "btn btn-ghost btn-sm" +
              (isCurrent
                ? " bg-neutralContent text-neutral pointer-events-none"
                : " bg-base-100 text-base-content")
            }
          >
            {locale}
          </a>
        );
      })}
    </>
  );
});
