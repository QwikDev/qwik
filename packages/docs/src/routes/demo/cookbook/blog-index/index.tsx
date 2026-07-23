import { component$ } from '@builder.io/qwik';
import { Link } from '@builder.io/qwik-city';

type PostFrontmatter = {
  title: string;
  date: string;
  description?: string;
};

type PostModule = {
  frontmatter: PostFrontmatter;
};

const postModules = import.meta.glob<PostModule>(
  './posts/*/index.{md,mdx}',
  { eager: true }
);

const posts = Object.entries(postModules)
  .map(([path, mod]) => {
    // './posts/hello-world/index.mdx' -> 'hello-world'
    const slug = path.split('/').slice(-2, -1)[0];
    return { slug, ...mod.frontmatter };
  })
  .sort((a, b) => (a.date < b.date ? 1 : -1));

export default component$(() => {
  return (
    <div>
      <h1>Blog</h1>
      <ul>
        {posts.map((post) => (
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
