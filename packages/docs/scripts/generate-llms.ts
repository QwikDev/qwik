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
    .replace(/<[^>]+>/g, '')
    .replace(/&rsaquo;/g, '›')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
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
  const sourceContent = parsed.content.replace(/\r\n/g, '\n');
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
