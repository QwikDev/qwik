import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  blogRssData,
  escapeXml,
  fileToBlogPath,
  parseBlogArticle,
  readBlogArticles,
  renderRssFeed,
} from './vite-blog-rss';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createTemporaryArticlesDir() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qwik-blog-rss-'));
  temporaryDirectories.push(directory);
  return directory;
}

function writeArticle(directory: string, relativePath: string, frontmatter: string) {
  const file = path.join(directory, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\n${frontmatter}\n---\n\nArticle body\n`);
}

describe('blog RSS generation', () => {
  test('converts pathless route groups into public blog paths', () => {
    expect(fileToBlogPath(path.join('nested', '(articles)', 'post', 'index.mdx'))).toBe(
      '/blog/nested/post/'
    );
  });

  test('escapes XML text and attributes', () => {
    expect(escapeXml(`A & B < C > D "quoted" 'single'`)).toBe(
      'A &amp; B &lt; C &gt; D &quot;quoted&quot; &apos;single&apos;'
    );
    expect(escapeXml('Qwik 🎉')).toBe('Qwik 🎉');
  });

  test('uses canonical URLs and falls back to the generated route', () => {
    const canonical = parseBlogArticle(
      { title: 'Canonical', date: '2026-01-02', canonical: 'https://example.com/post' },
      '/blog/post/',
      'https://qwik.dev'
    );
    expect(canonical?.url).toBe('https://example.com/post');
    expect(canonical?.guid).toBe('https://qwik.dev/blog/post/');
    expect(
      parseBlogArticle(
        { title: 'Fallback', date: '2026-01-02', canonical: 'javascript:bad' },
        '/blog/fallback/'
      )?.url
    ).toBe('https://qwik.dev/blog/fallback/');
  });

  test('skips articles without a valid title or date', () => {
    expect(parseBlogArticle({ title: 'Missing date' }, '/blog/missing/')).toBeNull();
    expect(
      parseBlogArticle({ title: 'Invalid date', date: 'not-a-date' }, '/blog/invalid/')
    ).toBeNull();
    expect(parseBlogArticle({ date: '2026-01-02' }, '/blog/missing-title/')).toBeNull();
  });

  test('normalizes timezone-free calendar dates to UTC', () => {
    expect(
      parseBlogArticle(
        { title: 'Calendar date', date: 'August 26, 2025' },
        '/blog/date/'
      )?.date.toISOString()
    ).toBe('2025-08-26T00:00:00.000Z');
    expect(
      parseBlogArticle(
        { title: 'Explicit timezone', date: '2025-08-26T12:00:00+02:00' },
        '/blog/date/'
      )?.date.toISOString()
    ).toBe('2025-08-26T10:00:00.000Z');
    expect(
      parseBlogArticle(
        { title: 'ISO calendar date', date: '2025-08-26' },
        '/blog/date/'
      )?.date.toISOString()
    ).toBe('2025-08-26T00:00:00.000Z');
  });

  test('reads, sorts, and normalizes article metadata', () => {
    const directory = createTemporaryArticlesDir();
    writeArticle(
      directory,
      path.join('(group)', 'older', 'index.mdx'),
      "title: Older\nauthors: [A]\ntags: [old]\ndate: 'January 1, 2024'"
    );
    writeArticle(
      directory,
      path.join('newer', 'index.mdx'),
      "title: Newer\nauthors:\n  - A\n  - B\ndate: 'January 1, 2025'\ndescription: A summary"
    );
    writeArticle(directory, path.join('invalid', 'index.mdx'), "title: Invalid\ndate: 'unknown'");

    const articles = readBlogArticles(directory, 'https://qwik.dev');
    expect(articles.map((article) => article.title)).toEqual(['Newer', 'Older']);
    expect(articles[0]).toMatchObject({
      authors: ['A', 'B'],
      description: 'A summary',
      url: 'https://qwik.dev/blog/newer/',
    });
  });

  test('renders deterministic RSS fields and an empty feed', () => {
    const feed = renderRssFeed(
      [
        {
          title: 'Older & wiser',
          authors: ['A <B>'],
          tags: ['News'],
          date: new Date('2024-01-01T00:00:00Z'),
          url: 'https://qwik.dev/blog/older/',
          guid: 'qwik-blog:older',
        },
        {
          title: 'Newest',
          authors: [],
          tags: [],
          date: new Date('2025-01-01T00:00:00Z'),
          url: 'https://qwik.dev/blog/newest/',
        },
      ],
      'https://qwik.dev'
    );

    expect(feed.indexOf('<title>Newest</title>')).toBeLessThan(
      feed.indexOf('<title>Older &amp; wiser</title>')
    );
    expect(feed).toContain('<dc:creator>A &lt;B&gt;</dc:creator>');
    expect(feed).toContain('<category>News</category>');
    expect(feed).toContain('<guid isPermaLink="false">qwik-blog:older</guid>');
    expect(feed).toContain('<guid isPermaLink="true">https://qwik.dev/blog/newest/</guid>');
    expect(feed).toContain('type="application/rss+xml"');
    expect(renderRssFeed([], 'https://qwik.dev')).not.toContain('<lastBuildDate>');
  });

  test('emits the feed only for the client environment', () => {
    const routesDirectory = createTemporaryArticlesDir();
    const articlesDirectory = path.join(routesDirectory, '(blog)', 'blog', '(articles)');
    writeArticle(
      articlesDirectory,
      path.join('post', 'index.mdx'),
      "title: Post\ndate: '2026-01-01'"
    );
    const plugin = blogRssData(routesDirectory, 'https://qwik.dev');
    if (typeof plugin.generateBundle !== 'function') {
      throw new Error('Expected a generateBundle hook');
    }

    const emitted: Array<{ fileName: string; source: string }> = [];
    const context = {
      environment: { config: { consumer: 'client' } },
      emitFile(asset: { fileName: string; source: string }) {
        emitted.push(asset);
        return 'rss';
      },
    };
    plugin.generateBundle.call(context as any, {} as any, {} as any, false);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].fileName).toBe('blog/rss.xml');

    const serverContext = {
      environment: { config: { consumer: 'server' } },
      emitFile() {
        throw new Error('RSS should not be emitted by server builds');
      },
    };
    plugin.generateBundle.call(serverContext as any, {} as any, {} as any, false);
  });
});
