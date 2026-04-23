import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$, type DocumentHead } from '@qwik.dev/router';
import { blogEntries, blogTags, featuredBlogEntry } from '~/content/playground-content';
import { PlaygroundGlyph } from '~/components/playground/icons';

export const useBlogIndexData = routeLoader$(async () => {
  return {
    featured: featuredBlogEntry,
    entries: blogEntries,
    tags: blogTags,
  };
});

export default component$(() => {
  const blogData = useBlogIndexData();

  return (
    <div class="page-content">
      <section class="page-hero glass-frame">
        <div class="eyebrow-chip">Lab Notes</div>
        <h1>Notes, memos, and experiments that make the route tree feel lived in.</h1>
        <p class="hero-lead">
          List-detail flows are part of the demo too. The notes section gives the playground a more
          realistic content rhythm while staying completely local.
        </p>
      </section>

      <section class="section-card featured-article">
        <div class="featured-article__copy">
          <div class="eyebrow-chip">{blogData.value.featured.category}</div>
          <h2>{blogData.value.featured.title}</h2>
          <p>{blogData.value.featured.excerpt}</p>
          <div class="article-meta">
            <span>{blogData.value.featured.publishedAt}</span>
            <span>{blogData.value.featured.readTime}</span>
            <span>{blogData.value.featured.heroMetric}</span>
          </div>
          <Link
            class="hero-button hero-button--primary"
            href={`/blog/${blogData.value.featured.slug}`}
          >
            Open featured note
          </Link>
        </div>
        <div class="featured-article__tags">
          <div class="tag-cloud">
            {blogData.value.tags.map((tag) => (
              <span class="tag-pill" key={tag}>
                {tag}
              </span>
            ))}
          </div>
          <div class="featured-article__status">
            <PlaygroundGlyph class="featured-article__icon" name="notes" />
            {blogData.value.featured.status}
          </div>
        </div>
      </section>

      <section class="section-card">
        <div class="section-heading">
          <div class="eyebrow-chip">Article Grid</div>
          <h2>
            Mock content with enough structure to test layout depth, metadata, and navigation.
          </h2>
        </div>

        <div class="article-grid">
          {blogData.value.entries.map((entry) => (
            <article class="article-card" key={entry.slug}>
              <div class="article-card__header">
                <span class="article-status">{entry.status}</span>
                <span class="article-category">{entry.category}</span>
              </div>
              <h3>{entry.title}</h3>
              <p>{entry.summary}</p>
              <div class="tag-cloud">
                {entry.tags.map((tag) => (
                  <span class="tag-pill" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <div class="article-meta">
                <span>{entry.publishedAt}</span>
                <span>{entry.readTime}</span>
              </div>
              <Link class="article-link" href={`/blog/${entry.slug}`}>
                Read note
                <PlaygroundGlyph class="article-link__icon" name="arrow-up-right" />
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Lab Notes | Qwik Playgrounds',
  meta: [
    {
      name: 'description',
      content: 'A local lab notes section for the Qwik playground demo.',
    },
  ],
};
