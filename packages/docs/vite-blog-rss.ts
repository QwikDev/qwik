import matter from 'gray-matter';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

export const BLOG_RSS_FILE = 'blog/rss.xml';
export const BLOG_SITE_URL = 'https://qwik.dev';

const BLOG_ARTICLES_PATH = join('(blog)', 'blog', '(articles)');

function removeInvalidXmlCharacters(value: string): string {
  let result = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    const isValid =
      codePoint === 0x9 ||
      codePoint === 0xa ||
      codePoint === 0xd ||
      (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
      (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
      (codePoint >= 0x10000 && codePoint <= 0x10ffff);
    if (isValid) {
      result += character;
    }
  }
  return result;
}

export interface BlogRssArticle {
  title: string;
  authors: string[];
  tags: string[];
  date: Date;
  url: string;
  /** Optional stable route identity when the public link is canonicalized elsewhere. */
  guid?: string;
  description?: string;
}

/** Convert a route file path into the public blog pathname. */
export function fileToBlogPath(relativeFile: string): string {
  const clean = relativeFile
    .split(sep)
    .join('/')
    .replace(/\([^/]+\)\//g, '')
    .replace(/index\.mdx?$/, '')
    .replace(/^\/+|\/+$/g, '');

  return `/blog/${clean}/`;
}

/** Escape text for use in an XML element or attribute. */
export function escapeXml(value: string): string {
  return removeInvalidXmlCharacters(value).replace(/[<>&'"]/g, (character) => {
    switch (character) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      case "'":
        return '&apos;';
      default:
        return character;
    }
  });
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}

function toAbsoluteUrl(pathname: string, siteUrl: string): string {
  return new URL(pathname.replace(/^\/+/, ''), ensureTrailingSlash(siteUrl)).toString();
}

function asStringList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Parse a frontmatter date without allowing invalid dates into the feed. */
export function parseBlogDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (value instanceof Date) {
    const parsed = new Date(value.getTime());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  // ISO calendar dates are already UTC in ECMAScript; do not reinterpret them locally.
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (isoDate) {
    const year = Number(isoDate[1]);
    const month = Number(isoDate[2]);
    const day = Number(isoDate[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }
    return parsed;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  // Blog frontmatter currently stores calendar dates without a timezone. Convert those local
  // parses to UTC so builds produce the same publication time on every developer machine and CI.
  const hasTimezone = /(?:Z|[+-]\d{2}(?::?\d{2})?|\b(?:UTC|GMT)\b)\s*$/i.test(raw);
  if (!hasTimezone) {
    return new Date(
      Date.UTC(
        parsed.getFullYear(),
        parsed.getMonth(),
        parsed.getDate(),
        parsed.getHours(),
        parsed.getMinutes(),
        parsed.getSeconds(),
        parsed.getMilliseconds()
      )
    );
  }

  return parsed;
}

/** Build one feed item from an article's frontmatter and route pathname. */
export function parseBlogArticle(
  data: Record<string, unknown>,
  pathname: string,
  siteUrl = BLOG_SITE_URL
): BlogRssArticle | null {
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const date = parseBlogDate(data.date);

  if (!title || !date) {
    return null;
  }

  const canonical = typeof data.canonical === 'string' ? data.canonical.trim() : '';
  const routeUrl = toAbsoluteUrl(pathname, siteUrl);
  let url = routeUrl;
  if (canonical) {
    try {
      const candidate = new URL(canonical, url);
      if (candidate.protocol === 'http:' || candidate.protocol === 'https:') {
        url = candidate.toString();
      }
    } catch {
      // Keep the generated route URL when frontmatter contains an invalid canonical URL.
    }
  }

  const descriptionValue = data.description ?? data.summary;
  const description = typeof descriptionValue === 'string' ? descriptionValue.trim() : '';

  return {
    title,
    authors: asStringList(data.authors),
    tags: asStringList(data.tags),
    date,
    url,
    ...(url === routeUrl ? {} : { guid: routeUrl }),
    ...(description ? { description } : {}),
  };
}

function* walkIndexFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkIndexFiles(fullPath);
    } else if (/^index\.mdx?$/.test(entry.name)) {
      yield fullPath;
    }
  }
}

function sortArticles(articles: BlogRssArticle[]): BlogRssArticle[] {
  return [...articles].sort((left, right) => {
    const dateOrder = right.date.getTime() - left.date.getTime();
    if (dateOrder !== 0) {
      return dateOrder;
    }
    return left.url < right.url ? -1 : left.url > right.url ? 1 : 0;
  });
}

/** Read and sort all blog article frontmatter for the RSS feed. */
export function readBlogArticles(articlesDir: string, siteUrl = BLOG_SITE_URL): BlogRssArticle[] {
  const files = [...walkIndexFiles(articlesDir)].sort();
  const articles: BlogRssArticle[] = [];

  for (const file of files) {
    const pathname = fileToBlogPath(relative(articlesDir, file));
    const article = parseBlogArticle(matter.read(file).data, pathname, siteUrl);
    if (article) {
      articles.push(article);
    }
  }

  return sortArticles(articles);
}

function renderArticle(article: BlogRssArticle): string {
  const guid = article.guid ?? article.url;
  const isGuidPermalink = article.guid === undefined;
  const lines = [
    '    <item>',
    `      <title>${escapeXml(article.title)}</title>`,
    `      <link>${escapeXml(article.url)}</link>`,
    `      <guid isPermaLink="${isGuidPermalink}">${escapeXml(guid)}</guid>`,
    `      <pubDate>${escapeXml(article.date.toUTCString())}</pubDate>`,
  ];

  if (article.description) {
    lines.push(`      <description>${escapeXml(article.description)}</description>`);
  }
  if (article.authors.length > 0) {
    lines.push(`      <dc:creator>${escapeXml(article.authors.join(', '))}</dc:creator>`);
  }
  for (const tag of article.tags) {
    lines.push(`      <category>${escapeXml(tag)}</category>`);
  }

  lines.push('    </item>');
  return lines.join('\n');
}

/** Render a deterministic RSS 2.0 document from blog article metadata. */
export function renderRssFeed(articles: BlogRssArticle[], siteUrl = BLOG_SITE_URL): string {
  const sortedArticles = sortArticles(articles);
  const blogUrl = toAbsoluteUrl('/blog/', siteUrl);
  const feedUrl = toAbsoluteUrl(`/${BLOG_RSS_FILE}`, siteUrl);
  const latestArticle = sortedArticles[0];
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '  <channel>',
    '    <title>Qwik Blog</title>',
    `    <link>${escapeXml(blogUrl)}</link>`,
    '    <description>Latest articles from the Qwik Blog.</description>',
    '    <language>en</language>',
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />`,
  ];

  if (latestArticle) {
    lines.push(`    <lastBuildDate>${escapeXml(latestArticle.date.toUTCString())}</lastBuildDate>`);
  }

  if (sortedArticles.length > 0) {
    lines.push(sortedArticles.map(renderArticle).join('\n'));
  }

  lines.push('  </channel>', '</rss>', '');
  return lines.join('\n');
}

/** Generate the blog RSS asset during the client-side docs build. */
export function blogRssData(routesDir: string, siteUrl = BLOG_SITE_URL): Plugin {
  const articlesDir = join(routesDir, BLOG_ARTICLES_PATH);

  return {
    name: 'blogRssData',
    apply: 'build',

    buildStart() {
      for (const file of walkIndexFiles(articlesDir)) {
        this.addWatchFile(file);
      }
    },

    generateBundle() {
      // The docs adapter builds client, SSR, and SSG environments separately. RSS is public
      // static content and should be emitted only by the client environment.
      if (this.environment.config.consumer !== 'client') {
        return;
      }

      const articles = readBlogArticles(articlesDir, siteUrl);
      this.emitFile({
        type: 'asset',
        fileName: BLOG_RSS_FILE,
        source: renderRssFeed(articles, siteUrl),
      });
    },
  };
}
