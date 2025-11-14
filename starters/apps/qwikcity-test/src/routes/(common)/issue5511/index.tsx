import { component$ } from "@builder.io/qwik";
import { Link, type DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <div>
      <h1>Issue 5511 Test - Main Page</h1>
      <p>
        <Link
          href="/qwikcity-test/issue5511/blog/"
          data-test-link="issue5511-blog"
        >
          Navigate to Blog Post using Link-tag
        </Link>
      </p>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Main - title",
  meta: [
    { property: "og:url", content: "Main - url" },
    { property: "og:site_name", content: "Main - site_name" },
    { property: "article:publisher", content: "Main - publisher" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: "Main - twitter:site" },
    { name: "twitter:title", content: "Main - twitter:title" },
    { name: "twitter:creator", content: "Main - twitter:creator" },
  ],
  links: [
    {
      rel: "canonical",
      href: "https://example.com/about",
    },
  ],
};
