import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$, type DocumentHead } from '@qwik.dev/router';
import { PlaygroundGlyph } from '~/components/playground/icons';
import { blogEntries, featuredBlogEntry, getBlogEntryBySlug } from '~/content/playground-content';

export const useBlogEntry = routeLoader$(({ params }) => {
  return getBlogEntryBySlug(params.slug) ?? featuredBlogEntry;
});

export default component$(() => {
  const entry = useBlogEntry();
  const currentIndex = blogEntries.findIndex((item) => item.slug === entry.value.slug);
  const previousEntry = currentIndex > 0 ? blogEntries[currentIndex - 1] : undefined;
  const nextEntry =
    currentIndex >= 0 && currentIndex < blogEntries.length - 1
      ? blogEntries[currentIndex + 1]
      : undefined;

  return (
    <div class="page-content">
      <article class="article-shell">
        <header class="article-hero glass-frame">
          <div class="eyebrow-chip">{entry.value.category}</div>
          <h1>{entry.value.title}</h1>
          <p class="hero-lead">{entry.value.excerpt}</p>

          <div class="article-meta">
            <span>{entry.value.publishedAt}</span>
            <span>{entry.value.readTime}</span>
            <span>{entry.value.heroMetric}</span>
          </div>

          <div class="tag-cloud">
            {entry.value.tags.map((tag) => (
              <span class="tag-pill" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </header>

        <div class="article-content">
          {entry.value.sections.map((section) => (
            <section class="article-section" key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.quote && <blockquote>{section.quote}</blockquote>}
              {section.code && (
                <pre class="code-block">
                  <code>{section.code}</code>
                </pre>
              )}
            </section>
          ))}
        </div>
      </article>

      <section class="section-card">
        <div class="section-heading">
          <div class="eyebrow-chip">Continue Reading</div>
          <h2>Use the neighboring routes to keep testing article navigation depth.</h2>
        </div>

        <div class="jump-grid">
          <Link class="jump-card glass-frame" href="/blog">
            <div>
              <h3>Back to all notes</h3>
              <p>Return to the list view and compare metadata density across cards.</p>
            </div>
            <PlaygroundGlyph class="jump-card__glyph" name="arrow-up-right" />
          </Link>

          {previousEntry && (
            <Link class="jump-card glass-frame" href={`/blog/${previousEntry.slug}`}>
              <div>
                <h3>{previousEntry.title}</h3>
                <p>Step backward to inspect route changes without leaving article mode.</p>
              </div>
              <PlaygroundGlyph class="jump-card__glyph" name="arrow-up-right" />
            </Link>
          )}

          {nextEntry && (
            <Link class="jump-card glass-frame" href={`/blog/${nextEntry.slug}`}>
              <div>
                <h3>{nextEntry.title}</h3>
                <p>Advance to the next note and keep the nested content flow moving.</p>
              </div>
              <PlaygroundGlyph class="jump-card__glyph" name="arrow-up-right" />
            </Link>
          )}
        </div>
      </section>
    </div>
  );
});

export const head: DocumentHead = {
  title: 'Lab Note | Qwik Playgrounds',
  meta: [
    {
      name: 'description',
      content: 'A nested lab note route for the Qwik playground demo.',
    },
  ],
};
