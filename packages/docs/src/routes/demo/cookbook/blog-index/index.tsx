import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$ } from '@qwik.dev/router';

type PostFrontmatter = {
  title: string;
  date: string;
  description?: string;
};

// Scope the glob to the `frontmatter` export so it never pulls in each post's
// `default` (a Qwik component). That's also why there's no `eager: true` here —
// eager-importing Qwik components combines their outputs in a way that breaks
// Qwik (see the Glob Import recipe). The lazy entries are resolved server-side
// in the routeLoader$ below.
const postModules = import.meta.glob<PostFrontmatter>(
  './posts/*/index.{md,mdx}',
  {
    import: 'frontmatter',
  }
);

export const useBlogPosts = routeLoader$(async () => {
  const posts = await Promise.all(
    Object.entries(postModules).map(async ([path, loadFrontmatter]) => {
      // './posts/hello-world/index.mdx' -> 'hello-world'
      const slug = path.split('/').slice(-2, -1)[0];
      return { slug, ...(await loadFrontmatter()) };
    })
  );
  return posts.sort((a, b) => (a.date < b.date ? 1 : -1));
});

export default component$(() => {
  const posts = useBlogPosts();
  return (
    <div>
      <h1>Blog</h1>
      <ul>
        {posts.value.map((post) => (
          <li key={post.slug}>
            <Link href={`./posts/${post.slug}/`}>{post.title}</Link>
            <small> — {post.date}</small>
            {post.description && <p>{post.description}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
});
