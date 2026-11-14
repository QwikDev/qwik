import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$, type DocumentHead } from '@qwik.dev/router';

type PostFrontmatter = {
  title: string;
  published: string;
  description: string;
};

type Post = PostFrontmatter & {
  href: string;
};

/**
 * Loads every blog post below ./posts by globbing its index file,
 * reading each post's frontmatter, and ordering newest first.
 */
export const usePosts = routeLoader$(async () => {
  const posts: Post[] = (
    await Promise.all(
      Object.entries(
        import.meta.glob<{ frontmatter: PostFrontmatter }>(
          './posts/**/index.{mdx,md}'
        )
      ).map(async ([path, readPost]) => {
        const { frontmatter } = await readPost();
        const slug = path
          .replace(/^\.\//, '')
          .replace(/\/index\.(mdx|md)$/, '');
        return {
          ...frontmatter,
          href: `./${slug}/`,
        };
      })
    )
  ).sort((a, b) => (a.published < b.published ? 1 : -1));
  return posts;
});

export default component$(() => {
  const posts = usePosts();
  return (
    <div>
      <h1>Blog Index</h1>
      <p>
        A blog index page built with <code>import.meta.glob</code>: every post
        below
        <code> ./posts</code> is listed here, ordered by published date, newest
        first.
      </p>
      <ul>
        {posts.value.map((post) => (
          <li key={post.href}>
            <Link href={post.href}>{post.title}</Link>
            <span> — {post.published}</span>
            <p>{post.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Blog Index Demo',
};
