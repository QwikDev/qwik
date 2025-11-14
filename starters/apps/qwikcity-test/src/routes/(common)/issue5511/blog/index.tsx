import { component$ } from "@builder.io/qwik";
import { Link, type DocumentHead } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <div>
      <h1>Blog Post Page</h1>
      <p>This is a blog post with different meta tags.</p>
      <p>
        <Link href="/qwikcity-test/issue5511/" data-test-link="issue5511-home">
          go to home
        </Link>
      </p>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Blog - title",
  meta: [
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: "Blog - twitter:site" },
    { name: "twitter:title", content: "Blog - twitter:title" },
    { name: "twitter:creator", content: "Blog - twitter:creator" },
  ],
  links: [
    {
      rel: "canonical",
      href: "https://example.com/about",
    },
  ],
};
