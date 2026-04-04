import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import matter from 'gray-matter';

export interface LlmsManifestEntry {
  section: string;
  title: string;
  pathname: string;
  sourcePath: string;
  description: string;
  optional?: boolean;
  inlineContent?: string;
}

export interface GenerateLlmsOptions {
  baseUrl: string;
  packageDir: string;
  outputDir: string;
  entries: LlmsManifestEntry[];
}

interface GeneratedMirror {
  entry: LlmsManifestEntry;
  canonicalUrl: string;
  mirrorUrl: string;
  outputPath: string;
  content: string;
}

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(packageDir, 'dist');
const DEFAULT_LLMS_BASE_URL = 'https://qwik.dev';
const DOC_SUMMARY =
  'Qwik is a resumable web framework. It serializes application state into HTML during SSR and resumes on the client without hydration, so apps stay interactive without eagerly downloading all component code.';

const DOC_INTRO = [
  'Use this file to find the best markdown sources for Qwik framework, router, and package API documentation.',
  'The linked markdown mirrors are generated from the local docs sources so they stay readable for both people and LLM tools.',
];

const toSourcePath = (...segments: string[]) => path.join('src', 'routes', ...segments);

function docEntry(
  section: string,
  title: string,
  pathname: string,
  description: string,
  sourcePath: string,
  optional = false
): LlmsManifestEntry {
  return {
    section,
    title,
    pathname,
    sourcePath,
    description,
    optional,
  };
}

function apiTitleFromSlug(slug: string) {
  return `@qwik.dev/${slug.replace(/^qwik-/, 'qwik-').replace(/^qwik$/, 'qwik')}`;
}

function apiDescriptionFromSlug(slug: string) {
  const packageTitle = apiTitleFromSlug(slug);
  if (slug === 'qwik') {
    return 'Core framework API reference, including components, QRLs, signals, JSX types, and hooks.';
  }
  if (slug === 'qwik-router') {
    return 'Router API reference for routing, loaders, actions, middleware, and server utilities.';
  }
  if (slug === 'qwik-server') {
    return 'Server rendering and serialization APIs for rendering Qwik applications outside the browser.';
  }
  if (slug === 'qwik-optimizer') {
    return 'Optimizer API reference for the compiler and transform pipeline that powers lazy loading.';
  }
  if (slug === 'qwik-testing') {
    return 'Testing helpers and utilities for unit, DOM, and integration-style Qwik tests.';
  }
  if (slug === 'qwik-insights') {
    return 'Insights package API reference for performance tracing and analytics integration.';
  }
  return `API reference for ${packageTitle}.`;
}

function apiEntry(slug: string, optional = false): LlmsManifestEntry {
  return {
    section: 'API Packages',
    title: apiTitleFromSlug(slug),
    pathname: `/api/${slug}/`,
    sourcePath: toSourcePath('api', slug, 'index.mdx'),
    description: apiDescriptionFromSlug(slug),
    optional,
  };
}

export function createLlmsManifest(): LlmsManifestEntry[] {
  return [
    {
      section: 'Start Here',
      title: 'Qwik Home',
      pathname: '/',
      sourcePath: toSourcePath('index.tsx'),
      description:
        'Project overview with the core value proposition behind resumability and streaming execution.',
      inlineContent: `# Qwik

> Qwik is a resumable web framework built to start fast, stay interactive, and download code only when it is actually needed.

Qwik renders HTML on the server, serializes the application state into that HTML, and resumes on the client without replaying the whole component tree.

Key ideas:

- Resumability instead of hydration
- Lazy-loaded event handlers and component logic via QRLs
- Fine-grained reactivity with signals and stores
- File-based routing and server features via Qwik Router

Start with the getting started guide, the core concepts pages, and the router guides to understand how applications are structured in practice.`,
    },
    docEntry(
      'Start Here',
      'Getting Started',
      '/docs/getting-started/',
      'Hands-on introduction to creating an app, routing, data loading, state, tasks, and styling.',
      toSourcePath('docs', '(qwik)', 'getting-started', 'index.mdx')
    ),
    docEntry(
      'Start Here',
      'Project Structure',
      '/docs/project-structure/',
      'Explains the default app layout, routing folders, and where framework and router concerns live.',
      toSourcePath('docs', '(qwikrouter)', 'project-structure', 'index.mdx')
    ),
    {
      section: 'Start Here',
      title: 'Playground',
      pathname: '/playground/',
      sourcePath: toSourcePath('playground', 'index!.tsx'),
      description:
        'Interactive playground for trying Qwik code, shareable examples, and quick experiments.',
      optional: true,
      inlineContent: `# Playground

> The Qwik playground is an in-browser REPL for experimenting with Qwik code and sharing runnable examples.

Use the playground when you want to:

- try component and signal examples quickly
- reproduce a small issue in isolation
- share example snippets with a stable URL

The playground focuses on rapid experimentation rather than long-form documentation, so use the docs mirrors for detailed explanations and the playground for fast iteration.`,
    },
    docEntry(
      'Core Concepts',
      'Docs Overview',
      '/docs/',
      'High-level docs entry point for Qwik framework concepts and core learning paths.',
      toSourcePath('docs', '(qwik)', 'index.mdx')
    ),
    docEntry(
      'Core Concepts',
      'Core Overview',
      '/docs/core/overview/',
      'Overview of components, JSX rendering, and the framework primitives used throughout Qwik apps.',
      toSourcePath('docs', '(qwik)', 'core', 'overview', 'index.mdx')
    ),
    docEntry(
      'Core Concepts',
      'Think Qwik',
      '/docs/concepts/think-qwik/',
      'Mental model for resumability, lazy execution, and how Qwik differs from hydration-based frameworks.',
      toSourcePath('docs', '(qwik)', 'concepts', 'think-qwik', 'index.mdx')
    ),
    docEntry(
      'Core Concepts',
      'Resumable',
      '/docs/concepts/resumable/',
      'Explains resumability and how Qwik serializes state and resumes without replaying components.',
      toSourcePath('docs', '(qwik)', 'concepts', 'resumable', 'index.mdx')
    ),
    docEntry(
      'Core Concepts',
      'Reactivity',
      '/docs/concepts/reactivity/',
      'Covers signals, stores, and the fine-grained update model used by Qwik.',
      toSourcePath('docs', '(qwik)', 'concepts', 'reactivity', 'index.mdx')
    ),
    docEntry(
      'Core Concepts',
      'The $ Dollar Sign',
      '/docs/advanced/dollar/',
      'Explains the `$` suffix transform, lazy boundaries, and serializable closures.',
      toSourcePath('docs', '(qwik)', 'advanced', 'dollar', 'index.mdx')
    ),
    docEntry(
      'Core Concepts',
      'QRL',
      '/docs/advanced/qrl/',
      'Deep dive into QRLs, how lazy references are encoded, and how symbols are resumed on demand.',
      toSourcePath('docs', '(qwik)', 'advanced', 'qrl', 'index.mdx')
    ),
    docEntry(
      'Core Concepts',
      'Optimizer Hints',
      '/docs/advanced/optimizer-hints/',
      'Documents optimizer suppression hints like `@qwik-disable-next-line` and when to use named diagnostics sparingly.',
      toSourcePath('docs', '(qwik)', 'advanced', 'optimizer-hints', 'index.mdx')
    ),
    docEntry(
      'Core Concepts',
      'State',
      '/docs/core/state/',
      'Reference for signals, stores, computed values, async state, and related reactive primitives.',
      toSourcePath('docs', '(qwik)', 'core', 'state', 'index.mdx')
    ),
    docEntry(
      'Core Concepts',
      'Events',
      '/docs/core/events/',
      'Event handling model, lazy event listeners, and DOM interaction in Qwik.',
      toSourcePath('docs', '(qwik)', 'core', 'events', 'index.mdx')
    ),
    docEntry(
      'Core Concepts',
      'Tasks and Lifecycle',
      '/docs/core/tasks/',
      'Lifecycle and task model including `useTask$`, `useVisibleTask$`, and tracked reactive work.',
      toSourcePath('docs', '(qwik)', 'core', 'tasks', 'index.mdx')
    ),
    docEntry(
      'Core Concepts',
      'Context',
      '/docs/core/context/',
      'Dependency-style state sharing with `useContext` and `useContextProvider`.',
      toSourcePath('docs', '(qwik)', 'core', 'context', 'index.mdx')
    ),
    docEntry(
      'Core Concepts',
      'Slots',
      '/docs/core/slots/',
      'Projected content and component composition patterns in Qwik.',
      toSourcePath('docs', '(qwik)', 'core', 'slots', 'index.mdx')
    ),
    docEntry(
      'Core Concepts',
      'Rendering',
      '/docs/core/rendering/',
      'Rendering behavior, JSX output, and how Qwik updates and resumes DOM.',
      toSourcePath('docs', '(qwik)', 'core', 'rendering', 'index.mdx')
    ),
    docEntry(
      'Core Concepts',
      'Styles',
      '/docs/core/styles/',
      'Styling patterns including scoped styles, inline styles, and stylesheet loading.',
      toSourcePath('docs', '(qwik)', 'core', 'styles', 'index.mdx')
    ),
    docEntry(
      'Routing and Server',
      'Routing',
      '/docs/routing/',
      'File-based routing fundamentals, route folders, params, and navigation concepts.',
      toSourcePath('docs', '(qwikrouter)', 'routing', 'index.mdx')
    ),
    docEntry(
      'Routing and Server',
      'Advanced Routing',
      '/docs/advanced/routing/',
      'Advanced matching behavior and route structure patterns for larger applications.',
      toSourcePath('docs', '(qwikrouter)', 'advanced', 'routing', 'index.mdx')
    ),
    docEntry(
      'Routing and Server',
      'Route Loader',
      '/docs/route-loader/',
      'Server-side data loading with `routeLoader$`, typed access, and route-level data dependencies.',
      toSourcePath('docs', '(qwikrouter)', 'route-loader', 'index.mdx')
    ),
    docEntry(
      'Routing and Server',
      'Action',
      '/docs/action/',
      'Mutations and form actions with `routeAction$`, validation, and progressive enhancement.',
      toSourcePath('docs', '(qwikrouter)', 'action', 'index.mdx')
    ),
    docEntry(
      'Routing and Server',
      'server$',
      '/docs/server$/',
      'RPC-style server functions callable from the client with serialization and request context support.',
      toSourcePath('docs', '(qwikrouter)', 'server$', 'index.mdx')
    ),
    docEntry(
      'Reference',
      'React Cheat Sheet',
      '/docs/guides/react-cheat-sheet/',
      'Maps common React concepts to Qwik primitives for teams migrating or comparing frameworks.',
      toSourcePath('docs', '(qwikrouter)', 'guides', 'react-cheat-sheet', 'index.mdx'),
      true
    ),
    docEntry(
      'Reference',
      'Upgrade',
      '/docs/upgrade/',
      'Migration notes, upgrade guidance, and version transition details.',
      toSourcePath('docs', 'upgrade', 'index.mdx'),
      true
    ),
    apiEntry('qwik'),
    apiEntry('qwik-router'),
    apiEntry('qwik-server'),
    apiEntry('qwik-optimizer'),
    apiEntry('qwik-testing'),
    apiEntry('qwik-insights', true),
    apiEntry('qwik-router-ssg', true),
    apiEntry('qwik-router-vite-azure-swa', true),
    apiEntry('qwik-router-vite-bun-server', true),
    apiEntry('qwik-router-vite-cloud-run', true),
    apiEntry('qwik-router-vite-cloudflare-pages', true),
    apiEntry('qwik-router-vite-netlify-edge', true),
    apiEntry('qwik-router-vite-node-server', true),
    apiEntry('qwik-router-vite-ssg', true),
    apiEntry('qwik-router-vite-vercel', true),
    apiEntry('qwik-router-middleware-aws-lambda', true),
    apiEntry('qwik-router-middleware-azure-swa', true),
    apiEntry('qwik-router-middleware-cloudflare-pages', true),
    apiEntry('qwik-router-middleware-firebase', true),
    apiEntry('qwik-router-middleware-netlify-edge', true),
    apiEntry('qwik-router-middleware-node', true),
    apiEntry('qwik-router-middleware-request-handler', true),
    apiEntry('qwik-router-middleware-vercel-edge', true),
  ];
}

function normalizePathname(pathname: string) {
  if (pathname === '/') {
    return pathname;
  }
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

export function getMirrorRelativePath(pathname: string) {
  const normalized = normalizePathname(pathname);
  if (normalized === '/') {
    return 'index.md';
  }
  const segments = normalized.split('/').filter(Boolean);
  const lastSegment = segments.pop();
  return path.join(...segments, `${lastSegment}.md`);
}

function toPosixPath(value: string) {
  return value.split(path.sep).join('/');
}

export function getMirrorUrl(baseUrl: string, pathname: string) {
  const relativePath = getMirrorRelativePath(pathname);
  return new URL(toPosixPath(relativePath), ensureTrailingSlash(baseUrl)).toString();
}

function getCanonicalUrl(baseUrl: string, pathname: string) {
  return new URL(
    normalizePathname(pathname).replace(/^\//, ''),
    ensureTrailingSlash(baseUrl)
  ).toString();
}

function ensureTrailingSlash(value: string) {
  return value.endsWith('/') ? value : `${value}/`;
}

export function resolveLlmsBaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const configuredValue = env.QWIK_LLMS_BASE_URL?.trim();
  if (!configuredValue) {
    return DEFAULT_LLMS_BASE_URL;
  }

  try {
    return new URL(configuredValue).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`Invalid QWIK_LLMS_BASE_URL: ${configuredValue}`);
  }
}

function ensureDirectory(filePath: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function cleanupInlineText(value: string) {
  return value
    .replace(
      /<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, href: string, text: string) => {
        const label = text.replace(/<[^>]+>/g, '').trim();
        return label ? `[${label}](${href})` : href;
      }
    )
    .replace(/<\/?span(?:\s[^>]*)?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&rsaquo;/g, '›')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function escapeMarkdownTableCell(value: string) {
  return value.replace(/\|/g, '\\|');
}

function extractAttribute(tag: string, attributeName: string) {
  const match = tag.match(new RegExp(`\\b${attributeName}="([^"]+)"`, 'i'));
  return match?.[1]?.trim() ?? '';
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function collectBalancedDivBlock(lines: string[], startIndex: number) {
  const block: string[] = [];
  let depth = 0;

  for (let index = startIndex; index < lines.length; index++) {
    const line = lines[index];
    block.push(line);
    depth += countMatches(line, /<div\b/g);
    depth -= countMatches(line, /<\/div>/g);

    if (depth === 0) {
      return {
        block,
        endIndex: index,
      };
    }
  }

  return {
    block,
    endIndex: lines.length - 1,
  };
}

function collectBalancedTagBlock(
  lines: string[],
  startIndex: number,
  tagName: 'a' | 'details' | 'div'
) {
  const block: string[] = [];
  let depth = 0;
  const openPattern = new RegExp(`<${tagName}\\b`, 'g');
  const closePattern = new RegExp(`</${tagName}>`, 'g');

  for (let index = startIndex; index < lines.length; index++) {
    const line = lines[index];
    block.push(line);
    depth += countMatches(line, openPattern);
    depth -= countMatches(line, closePattern);

    if (depth === 0) {
      return {
        block,
        endIndex: index,
      };
    }
  }

  return {
    block,
    endIndex: lines.length - 1,
  };
}

function extractCardTitle(blockLines: string[]) {
  for (const line of blockLines) {
    const headingMatch = line.trim().match(/^<h3(?:\s[^>]*)?>(.*)<\/h3>$/i);
    if (headingMatch) {
      return cleanupInlineText(headingMatch[1]);
    }
  }
  return '';
}

function extractCardDescription(blockLines: string[]) {
  for (const line of blockLines) {
    const trimmed = line.trim();
    const paragraphMatch = trimmed.match(/^<p(?:\s[^>]*)?>(.*)<\/p>$/i);
    if (!paragraphMatch) {
      continue;
    }
    if (/<(?:img|Img[A-Z0-9_]*)\b/.test(paragraphMatch[1])) {
      continue;
    }
    const description = cleanupInlineText(paragraphMatch[1]);
    if (description) {
      return description;
    }
  }
  return '';
}

function renderCardBullet(blockLines: string[]) {
  const title = extractCardTitle(blockLines);
  const description = extractCardDescription(blockLines);
  const firstLine = blockLines[0]?.trim() ?? '';
  const hrefMatch = firstLine.match(/\bhref="([^"]+)"/);

  if (!title && !description) {
    return '';
  }

  if (hrefMatch) {
    return description
      ? `- [${title}](${hrefMatch[1]}): ${description}`
      : `- [${title}](${hrefMatch[1]})`;
  }

  if (!title) {
    return description ? `- ${description}` : '';
  }

  return description ? `- **${title}:** ${description}` : `- **${title}**`;
}

function transformCardGridBlock(blockLines: string[]) {
  const bullets: string[] = [];
  const innerLines = blockLines.slice(1, -1);

  for (let index = 0; index < innerLines.length; index++) {
    const trimmed = innerLines[index]?.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('<a ')) {
      const { block, endIndex } = collectBalancedTagBlock(innerLines, index, 'a');
      const bullet = renderCardBullet(block);
      if (bullet) {
        bullets.push(bullet);
      }
      index = endIndex;
      continue;
    }

    if (trimmed.startsWith('<div ') && /\bclass="[^"]*\bcard\b/.test(trimmed)) {
      const { block, endIndex } = collectBalancedTagBlock(innerLines, index, 'div');
      const bullet = renderCardBullet(block);
      if (bullet) {
        bullets.push(bullet);
      }
      index = endIndex;
    }
  }

  return bullets.length > 0 ? [...bullets, ''] : [];
}

function transformDetailsBlock(blockLines: string[]) {
  const contentLines = blockLines.slice(1, -1);
  const output: string[] = [];
  let summaryHandled = false;

  for (const line of contentLines) {
    const trimmed = line.trim();
    const summaryMatch = trimmed.match(/^<summary(?:\s[^>]*)?>([\s\S]*)<\/summary>$/i);
    if (summaryMatch) {
      const summary = cleanupInlineText(summaryMatch[1]);
      if (summary) {
        output.push(`**${summary}**`);
        output.push('');
      }
      summaryHandled = true;
      continue;
    }

    output.push(line);
  }

  if (!summaryHandled) {
    return [];
  }

  output.push('');
  return output;
}

function preprocessCardGrids(sourceContent: string) {
  const lines = sourceContent.split('\n');
  const output: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index]?.trim();
    if (trimmed === '<div class="card-grid">') {
      const { block, endIndex } = collectBalancedDivBlock(lines, index);
      output.push(...transformCardGridBlock(block));
      index = endIndex;
      continue;
    }

    output.push(lines[index]);
  }

  return output.join('\n');
}

function preprocessDetailsBlocks(sourceContent: string) {
  const lines = sourceContent.split('\n');
  const output: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const trimmed = lines[index]?.trim();
    if (trimmed === '<details>') {
      const { block, endIndex } = collectBalancedTagBlock(lines, index, 'details');
      output.push(...transformDetailsBlock(block));
      index = endIndex;
      continue;
    }

    output.push(lines[index]);
  }

  return output.join('\n');
}

function renderMarkdownTable(tableHtml: string) {
  const rows = Array.from(tableHtml.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)).map((match) => {
    return Array.from(match[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)).map((cellMatch) =>
      escapeMarkdownTableCell(
        cleanupInlineText(cellMatch[1])
          .replace(/<br\s*\/?>/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      )
    );
  });

  const nonEmptyRows = rows.filter((row) => row.length > 0);
  if (nonEmptyRows.length === 0) {
    return '';
  }

  const [headerRow, ...bodyRows] = nonEmptyRows;
  const lines = [
    `| ${headerRow.join(' | ')} |`,
    `| ${headerRow.map(() => '---').join(' | ')} |`,
    ...bodyRows.map((row) => `| ${row.join(' | ')} |`),
  ];

  return lines.join('\n');
}

function preprocessHtmlTables(sourceContent: string) {
  return sourceContent.replace(/<table>[\s\S]*?<\/table>/gi, (tableHtml) => {
    const markdownTable = renderMarkdownTable(tableHtml);
    return markdownTable ? `\n${markdownTable}\n` : '\n';
  });
}

function preprocessMediaBlocks(sourceContent: string) {
  let content = sourceContent;

  content = content.replace(
    /<div\b[^>]*>\s*(<svg\b[\s\S]*?<\/svg>)\s*<\/div>/gi,
    (_match, svgBlock: string) => {
      const label = extractAttribute(svgBlock, 'aria-label');
      return label ? `\n**Diagram:** ${label}\n` : '\n';
    }
  );

  content = content.replace(/<svg\b[\s\S]*?<\/svg>/gi, (svgBlock) => {
    const label = extractAttribute(svgBlock, 'aria-label');
    return label ? `\n**Diagram:** ${label}\n` : '\n';
  });

  content = content.replace(/<video\b[^>]*>[\s\S]*?<\/video>/gi, (videoBlock) => {
    const sourceMatch = videoBlock.match(/<source\b[^>]*src="([^"]+)"/i);
    return sourceMatch ? `\n[Video](${sourceMatch[1]})\n` : '\n';
  });

  content = content.replace(/<img\b[^>]*\/?>/gi, (imgTag) => {
    const src = extractAttribute(imgTag, 'src');
    const alt = cleanupInlineText(extractAttribute(imgTag, 'alt'));
    if (src && alt) {
      return `![${alt}](${src})`;
    }
    if (alt) {
      return alt;
    }
    return '';
  });

  return content;
}

function preprocessSimpleHtml(sourceContent: string) {
  return sourceContent
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/^\s*<\/?(?:div|video|source)\b[^>]*>\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n');
}

function preprocessStructuralHtml(sourceContent: string) {
  return preprocessMediaBlocks(
    preprocessHtmlTables(preprocessDetailsBlocks(preprocessCardGrids(sourceContent)))
  );
}

function preprocessNonCodeContent(sourceContent: string) {
  return preprocessSimpleHtml(sourceContent);
}

function preprocessOutsideCodeFences(sourceContent: string) {
  const lines = sourceContent.split('\n');
  const output: string[] = [];
  const pending: string[] = [];
  let inCodeFence = false;

  const flushPending = () => {
    if (pending.length === 0) {
      return;
    }
    output.push(preprocessNonCodeContent(pending.join('\n')));
    pending.length = 0;
  };

  for (const line of lines) {
    if (isFenceLine(line)) {
      if (!inCodeFence) {
        flushPending();
        inCodeFence = true;
      } else {
        inCodeFence = false;
      }
      output.push(line);
      continue;
    }

    if (inCodeFence) {
      output.push(line);
    } else {
      pending.push(line);
    }
  }

  flushPending();
  return output.join('\n');
}

function isFenceLine(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith('```') || trimmed.startsWith('~~~');
}

function isUppercaseTagLine(line: string) {
  return /^<\/?[A-Z][A-Za-z0-9]*(?:\s[^>]*)?\/?>$/.test(line.trim());
}

function extractTitleAttr(line: string) {
  const match = line.match(/\btitle="([^"]+)"/);
  return match?.[1];
}

export function transformSourceToMarkdown(source: string) {
  const parsed = matter(source);
  const sourceContent = preprocessOutsideCodeFences(
    preprocessStructuralHtml(parsed.content.replace(/\r\n/g, '\n'))
  );
  const lines = sourceContent.split('\n');
  const output: string[] = [];
  let inCodeFence = false;
  let inPackageManagerTabs = false;
  let activeSlot = false;

  for (const line of lines) {
    if (isFenceLine(line)) {
      if (!inPackageManagerTabs || activeSlot) {
        output.push(line);
      }
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      if (!inPackageManagerTabs || activeSlot) {
        output.push(line);
      }
      continue;
    }

    if (/^\s*import\s/.test(line) || /^\s*export\s+(?!default component\$)/.test(line)) {
      continue;
    }

    const trimmed = line.trim();

    if (trimmed === '') {
      output.push('');
      continue;
    }

    if (/^<!--.*-->$/.test(trimmed)) {
      continue;
    }

    if (/^<PackageManagerTabs(?:\s[^>]*)?>$/.test(trimmed)) {
      inPackageManagerTabs = true;
      activeSlot = false;
      continue;
    }

    if (/^<\/PackageManagerTabs>$/.test(trimmed)) {
      inPackageManagerTabs = false;
      activeSlot = false;
      output.push('');
      continue;
    }

    if (inPackageManagerTabs) {
      const slotMatch = trimmed.match(/^<span\s+q:slot="([^"]+)">$/);
      if (slotMatch) {
        activeSlot = slotMatch[1] === 'pnpm';
        continue;
      }
      if (trimmed === '</span>') {
        activeSlot = false;
        output.push('');
        continue;
      }
      if (!activeSlot) {
        continue;
      }
    }

    const singleLineWrapperMatch = trimmed.match(
      /^<(?<name>[A-Z][A-Za-z0-9]*)(?<attrs>\s[^>]*)?>(?<content>.*)<\/\1>$/
    );
    if (singleLineWrapperMatch?.groups) {
      const title = extractTitleAttr(singleLineWrapperMatch.groups.attrs ?? '');
      const content = cleanupInlineText(singleLineWrapperMatch.groups.content);
      if (title) {
        output.push(`**${title}**`);
      }
      if (content) {
        output.push(content);
      }
      output.push('');
      continue;
    }

    const headingMatch = trimmed.match(/^<h([1-6])(?:\s[^>]*)?>(.*)<\/h\1>$/i);
    if (headingMatch) {
      output.push(`${'#'.repeat(Number(headingMatch[1]))} ${cleanupInlineText(headingMatch[2])}`);
      output.push('');
      continue;
    }

    const paragraphHtmlMatch = trimmed.match(/^<p(?:\s[^>]*)?>(.*)<\/p>$/i);
    if (paragraphHtmlMatch) {
      output.push(cleanupInlineText(paragraphHtmlMatch[1]));
      output.push('');
      continue;
    }

    if (isUppercaseTagLine(trimmed)) {
      const title = extractTitleAttr(trimmed);
      if (title) {
        output.push(`**${title}**`);
        output.push('');
      }
      continue;
    }

    output.push(line.replace(/&rsaquo;/g, '›'));
  }

  return normalizeMarkdown(output.join('\n'));
}

function normalizeMarkdown(content: string) {
  return content
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
    .concat('\n');
}

function normalizeMarkdownForLlms(content: string) {
  return content
    .replace(/│/g, '|')
    .replace(/├/g, '|')
    .replace(/└/g, '`')
    .replace(/─/g, '-')
    .replace(/\p{Extended_Pictographic}(?:\uFE0F)?\s*/gu, '');
}

function splitLinkSuffix(url: string) {
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  const cutPoints = [queryIndex, hashIndex].filter((index) => index >= 0);
  const cutIndex = cutPoints.length > 0 ? Math.min(...cutPoints) : -1;

  if (cutIndex === -1) {
    return { base: url, suffix: '' };
  }

  return {
    base: url.slice(0, cutIndex),
    suffix: url.slice(cutIndex),
  };
}

function hasFileExtension(value: string) {
  return /\.[a-z0-9]+$/i.test(value);
}

function stripRouteGroups(value: string) {
  return value.replace(/\([^/]+\)\//g, '');
}

function getPublicRoutePathFromSourceFile(sourceFilePath: string, routesDirectory: string) {
  const relativePath = stripRouteGroups(
    path.relative(routesDirectory, sourceFilePath).split(path.sep).join('/')
  );
  const trimmed = relativePath
    .replace(/\/index!?\.([a-z]+)$/i, '/')
    .replace(/\.(md|mdx|tsx|ts|jsx|js)$/i, '');
  const normalized = trimmed === '' ? '/' : `/${trimmed}`.replace(/\/+/g, '/');
  return normalizePathname(normalized);
}

function isExternalUrl(url: string) {
  return /^[a-z]+:/i.test(url) || url.startsWith('//');
}

function rewriteLinkTarget(
  url: string,
  sourceFilePath: string,
  mirrorPathnames: Set<string>,
  routesDirectory: string
): string {
  if (!url || url.startsWith('#') || isExternalUrl(url)) {
    return url;
  }

  const { base, suffix } = splitLinkSuffix(url);
  let routePath: string | null = null;

  if (base.startsWith('/')) {
    if (/\.(md|mdx)$/i.test(base)) {
      routePath = getPublicRoutePathFromSourceFile(
        path.join(routesDirectory, base.slice(1)),
        routesDirectory
      );
    } else if (!hasFileExtension(base)) {
      routePath = normalizePathname(base);
    }
  } else if (base.startsWith('.')) {
    if (/\.(md|mdx)$/i.test(base)) {
      routePath = getPublicRoutePathFromSourceFile(
        path.resolve(path.dirname(sourceFilePath), base),
        routesDirectory
      );
    }
  }

  if (!routePath) {
    return url;
  }

  if (mirrorPathnames.has(routePath)) {
    const mirrorPath = `/${toPosixPath(getMirrorRelativePath(routePath))}`;
    return `${mirrorPath}${suffix}`;
  }

  return `${routePath}${suffix}`;
}

function rewriteMarkdownLinks(
  content: string,
  sourceFilePath: string,
  mirrorPathnames: Set<string>,
  routesDirectory: string
) {
  let result = '';
  let index = 0;

  while (index < content.length) {
    if (content[index] !== '[' || content[index - 1] === '!') {
      result += content[index];
      index++;
      continue;
    }

    const labelEnd = content.indexOf(']', index + 1);
    if (labelEnd === -1 || content[labelEnd + 1] !== '(') {
      result += content[index];
      index++;
      continue;
    }

    let cursor = labelEnd + 2;
    let depth = 1;
    while (cursor < content.length && depth > 0) {
      if (content[cursor] === '(') {
        depth++;
      } else if (content[cursor] === ')') {
        depth--;
      }
      cursor++;
    }

    if (depth !== 0) {
      result += content[index];
      index++;
      continue;
    }

    const label = content.slice(index + 1, labelEnd);
    const linkBody = content.slice(labelEnd + 2, cursor - 1);
    const splitMatch = linkBody.match(/^(\S+)([\s\S]*)$/);
    if (!splitMatch) {
      result += content.slice(index, cursor);
      index = cursor;
      continue;
    }

    const rewritten = rewriteLinkTarget(
      splitMatch[1],
      sourceFilePath,
      mirrorPathnames,
      routesDirectory
    );
    result += `[${label}](${rewritten}${splitMatch[2]})`;
    index = cursor;
  }

  return result;
}

function escapeAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function groupBySection(entries: LlmsManifestEntry[]) {
  const grouped = new Map<string, LlmsManifestEntry[]>();
  for (const entry of entries) {
    const section = entry.optional ? 'Optional' : entry.section;
    const existing = grouped.get(section);
    if (existing) {
      existing.push(entry);
    } else {
      grouped.set(section, [entry]);
    }
  }
  return grouped;
}

export function renderLlmsTxt(baseUrl: string, entries: LlmsManifestEntry[]) {
  const grouped = groupBySection(entries);
  const orderedSections = Array.from(grouped.keys()).filter((section) => section !== 'Optional');
  if (grouped.has('Optional')) {
    orderedSections.push('Optional');
  }
  const sections: string[] = [];

  for (const section of orderedSections) {
    const sectionEntries = grouped.get(section) ?? [];
    sections.push(`## ${section}`);
    sections.push('');
    for (const entry of sectionEntries) {
      sections.push(
        `- [${entry.title}](${getMirrorUrl(baseUrl, entry.pathname)}): ${entry.description}`
      );
    }
    sections.push('');
  }

  return ['# Qwik', '', `> ${DOC_SUMMARY}`, '', ...DOC_INTRO, '', ...sections]
    .join('\n')
    .trim()
    .concat('\n');
}

export function renderCtxFile(mirrors: GeneratedMirror[]) {
  const lines = ['<documents project="Qwik">', ''];
  mirrors.forEach((mirror, index) => {
    lines.push(
      `<document index="${index + 1}" url="${escapeAttribute(mirror.canonicalUrl)}" mirror="${escapeAttribute(mirror.mirrorUrl)}" title="${escapeAttribute(mirror.entry.title)}">`
    );
    lines.push(mirror.content.trim());
    lines.push('</document>');
    lines.push('');
  });
  lines.push('</documents>');
  return lines.join('\n').trim().concat('\n');
}

function validateEntries(entries: LlmsManifestEntry[], packageRoot: string) {
  const pathnames = new Set<string>();
  const outputPaths = new Set<string>();

  for (const entry of entries) {
    const normalizedPathname = normalizePathname(entry.pathname);
    if (pathnames.has(normalizedPathname)) {
      throw new Error(`Duplicate pathname in LLM manifest: ${normalizedPathname}`);
    }
    pathnames.add(normalizedPathname);

    const sourcePath = path.join(packageRoot, entry.sourcePath);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`Missing source file for LLM manifest entry: ${entry.sourcePath}`);
    }

    const outputPath = getMirrorRelativePath(normalizedPathname);
    if (outputPaths.has(outputPath)) {
      throw new Error(`Duplicate mirror output path in LLM manifest: ${outputPath}`);
    }
    outputPaths.add(outputPath);
  }
}

function createMirror(
  entry: LlmsManifestEntry,
  options: GenerateLlmsOptions,
  mirrorPathnames: Set<string>
): GeneratedMirror {
  const sourceFilePath = path.join(options.packageDir, entry.sourcePath);
  const routesDirectory = path.join(options.packageDir, 'src', 'routes');
  const outputPath = path.join(options.outputDir, getMirrorRelativePath(entry.pathname));
  const baseContent = entry.inlineContent
    ? normalizeMarkdown(entry.inlineContent)
    : transformSourceToMarkdown(fs.readFileSync(sourceFilePath, 'utf-8'));
  const content = normalizeMarkdownForLlms(
    rewriteMarkdownLinks(baseContent, sourceFilePath, mirrorPathnames, routesDirectory)
  );

  return {
    entry,
    canonicalUrl: getCanonicalUrl(options.baseUrl, entry.pathname),
    mirrorUrl: getMirrorUrl(options.baseUrl, entry.pathname),
    outputPath,
    content,
  };
}

function writeMirror(mirror: GeneratedMirror) {
  ensureDirectory(mirror.outputPath);
  fs.writeFileSync(mirror.outputPath, mirror.content);
}

export function generateLlmsFiles(options: GenerateLlmsOptions) {
  validateEntries(options.entries, options.packageDir);
  const mirrorPathnames = new Set(
    options.entries.map((entry) => normalizePathname(entry.pathname))
  );
  fs.mkdirSync(options.outputDir, { recursive: true });

  const mirrors = options.entries.map((entry) => createMirror(entry, options, mirrorPathnames));
  for (const mirror of mirrors) {
    writeMirror(mirror);
  }

  const llmsTxt = renderLlmsTxt(options.baseUrl, options.entries);
  const ctx = renderCtxFile(mirrors.filter((mirror) => !mirror.entry.optional));
  const ctxFull = renderCtxFile(mirrors);

  fs.writeFileSync(path.join(options.outputDir, 'llms.txt'), llmsTxt);
  fs.writeFileSync(path.join(options.outputDir, 'llms-ctx.txt'), ctx);
  fs.writeFileSync(path.join(options.outputDir, 'llms-ctx-full.txt'), ctxFull);

  return {
    mirrors,
    llmsTxt,
    ctx,
    ctxFull,
  };
}

export function runGenerateLlms() {
  return generateLlmsFiles({
    baseUrl: resolveLlmsBaseUrl(),
    packageDir,
    outputDir,
    entries: createLlmsManifest(),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runGenerateLlms();
}
