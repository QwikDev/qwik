import { component$ } from "@qwik.dev/core";
import {
  DocumentHeadTags,
  useDocumentHead,
  useLocation,
} from "@qwik.dev/router";
import { Social } from "./social";
import { Vendor } from "./vendor";

export const RouterHead = component$(() => {
  const loc = useLocation();

  const head = useDocumentHead();

  const title = head.title ? `${head.title} - Qwik` : `Qwik`;
  return (
    <>
      <link rel="canonical" href={loc.url.href} />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <meta name="viewport" content="width=device-width" />

      <DocumentHeadTags title={title} />

      <Social loc={loc} head={head} />
      <Vendor loc={loc} />
    </>
  );
});
