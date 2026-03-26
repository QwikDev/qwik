import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  generateLlmsFiles,
  getMirrorRelativePath,
  renderLlmsTxt,
  resolveLlmsBaseUrl,
  transformSourceToMarkdown,
  type LlmsManifestEntry,
} from './generate-llms';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qwik-llms-'));
  tempDirs.push(dir);
  return dir;
}

describe('generate-llms', () => {
  test('transforms MDX into readable markdown', () => {
    const markdown = transformSourceToMarkdown(`---
title: Sample
---
import { Note } from './note';

# Example

<Note title="Heads up">Read this first.</Note>

<PackageManagerTabs>
<span q:slot="pnpm">
\`\`\`shell
pnpm create qwik@latest
\`\`\`
</span>
<span q:slot="npm">
\`\`\`shell
npm create qwik@latest
\`\`\`
</span>
</PackageManagerTabs>

<CodeSandbox src="/demo">
\`\`\`tsx
export const message = 'hello';
\`\`\`
</CodeSandbox>
`);

    expect(markdown).toContain('# Example');
    expect(markdown).toContain('**Heads up**');
    expect(markdown).toContain('Read this first.');
    expect(markdown).toContain('pnpm create qwik@latest');
    expect(markdown).not.toMatch(/\nnpm create qwik@latest\b/);
    expect(markdown).toContain("export const message = 'hello';");
    expect(markdown).not.toContain('<CodeSandbox');
    expect(markdown).not.toContain('import { Note }');
  });

  test('normalizes box drawing characters in generated mirrors', () => {
    const packageDir = createTempDir();
    const outputDir = path.join(packageDir, 'dist');
    const sourceDir = path.join(packageDir, 'src', 'routes', 'docs');
    fs.mkdirSync(sourceDir, { recursive: true });

    fs.writeFileSync(
      path.join(sourceDir, 'tree.mdx'),
      '# Tree\n\n```text\nsrc/\n└── routes/\n    ├── about/\n    │   └── index.tsx\n```\n'
    );

    generateLlmsFiles({
      baseUrl: 'https://qwik.dev',
      packageDir,
      outputDir,
      entries: [
        {
          section: 'Guides',
          title: 'Tree',
          pathname: '/docs/tree/',
          sourcePath: path.join('src', 'routes', 'docs', 'tree.mdx'),
          description: 'Tree guide.',
        },
      ],
    });

    const mirror = fs.readFileSync(
      path.join(outputDir, getMirrorRelativePath('/docs/tree/')),
      'utf-8'
    );
    expect(mirror).toContain('`-- routes/');
    expect(mirror).toContain('|-- about/');
    expect(mirror).toContain('|   `-- index.tsx');
    expect(mirror).not.toContain('└──');
    expect(mirror).not.toContain('├──');
    expect(mirror).not.toContain('│');
  });

  test('strips emoji icons from generated mirrors', () => {
    const packageDir = createTempDir();
    const outputDir = path.join(packageDir, 'dist');
    const sourceDir = path.join(packageDir, 'src', 'routes', 'docs');
    fs.mkdirSync(sourceDir, { recursive: true });

    fs.writeFileSync(
      path.join(sourceDir, 'icons.mdx'),
      '# Icons\n\n- **📂 Directories:** Define URL segments.\n- **📄 Pages:** Render content.\n- **🖼️ Layouts:** Share UI.\n'
    );

    generateLlmsFiles({
      baseUrl: 'https://qwik.dev',
      packageDir,
      outputDir,
      entries: [
        {
          section: 'Guides',
          title: 'Icons',
          pathname: '/docs/icons/',
          sourcePath: path.join('src', 'routes', 'docs', 'icons.mdx'),
          description: 'Icons guide.',
        },
      ],
    });

    const mirror = fs.readFileSync(
      path.join(outputDir, getMirrorRelativePath('/docs/icons/')),
      'utf-8'
    );
    expect(mirror).toContain('- **Directories:** Define URL segments.');
    expect(mirror).toContain('- **Pages:** Render content.');
    expect(mirror).toContain('- **Layouts:** Share UI.');
    expect(mirror).not.toContain('📂');
    expect(mirror).not.toContain('📄');
    expect(mirror).not.toContain('🖼️');
  });

  test('renders llms.txt with markdown mirror links', () => {
    const content = renderLlmsTxt('https://qwik.dev', [
      {
        section: 'Start Here',
        title: 'Getting Started',
        pathname: '/docs/getting-started/',
        sourcePath: 'src/routes/docs/getting-started/index.mdx',
        description: 'Start here.',
      },
      {
        section: 'Reference',
        title: 'Playground',
        pathname: '/playground/',
        sourcePath: 'src/routes/playground/index!.tsx',
        description: 'Playground.',
        optional: true,
      },
    ]);

    expect(content.startsWith('# Qwik')).toBe(true);
    expect(content).toContain('> Qwik is a resumable web framework');
    expect(content).toContain(
      '- [Getting Started](https://qwik.dev/docs/getting-started.md): Start here.'
    );
    expect(content).toContain('## Optional');
    expect(content).not.toContain('https://qwik.dev/docs/getting-started/):');
  });

  test('resolves the llms base url from env', () => {
    expect(resolveLlmsBaseUrl({} as NodeJS.ProcessEnv)).toBe('https://qwik.dev');
    expect(
      resolveLlmsBaseUrl({ QWIK_LLMS_BASE_URL: 'https://v2.qwik.dev/' } as NodeJS.ProcessEnv)
    ).toBe('https://v2.qwik.dev');
    expect(
      resolveLlmsBaseUrl({ CF_PAGES_URL: 'https://preview.qwik.pages.dev/' } as NodeJS.ProcessEnv)
    ).toBe('https://preview.qwik.pages.dev');
    expect(
      resolveLlmsBaseUrl({
        QWIK_LLMS_BASE_URL: 'https://v2.qwik.dev/',
        CF_PAGES_URL: 'https://preview.qwik.pages.dev/',
      } as NodeJS.ProcessEnv)
    ).toBe('https://v2.qwik.dev');
    expect(() =>
      resolveLlmsBaseUrl({ QWIK_LLMS_BASE_URL: 'not-a-url' } as NodeJS.ProcessEnv)
    ).toThrow('Invalid QWIK_LLMS_BASE_URL');
    expect(() => resolveLlmsBaseUrl({ CF_PAGES_URL: 'not-a-url' } as NodeJS.ProcessEnv)).toThrow(
      'Invalid CF_PAGES_URL'
    );
  });

  test('generates mirrors and ctx files', () => {
    const packageDir = createTempDir();
    const outputDir = path.join(packageDir, 'dist');
    const sourceDir = path.join(packageDir, 'src', 'routes', 'docs');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    const sourceFile = path.join(sourceDir, 'sample.mdx');
    fs.writeFileSync(
      sourceFile,
      `# Sample\n\nSee [Optional](./optional.mdx).\n\nThis is the main guide.\n\n<Note>Helpful context.</Note>\n`
    );

    fs.writeFileSync(path.join(sourceDir, 'optional.mdx'), `# Optional\n\nOptional body.\n`);

    const entries: LlmsManifestEntry[] = [
      {
        section: 'Guides',
        title: 'Sample',
        pathname: '/docs/sample/',
        sourcePath: path.join('src', 'routes', 'docs', 'sample.mdx'),
        description: 'A sample guide.',
      },
      {
        section: 'Guides',
        title: 'Optional',
        pathname: '/docs/optional/',
        sourcePath: path.join('src', 'routes', 'docs', 'sample.mdx'),
        description: 'Optional guide.',
        optional: true,
        inlineContent: '# Optional\n\nOptional body.\n',
      },
    ];

    const result = generateLlmsFiles({
      baseUrl: 'https://qwik.dev',
      packageDir,
      outputDir,
      entries,
    });

    expect(fs.existsSync(path.join(outputDir, 'llms.txt'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'llms-ctx.txt'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'llms-ctx-full.txt'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, getMirrorRelativePath('/docs/sample/')))).toBe(true);
    expect(result.ctx).toContain('Sample');
    expect(result.ctx).not.toContain('Optional body.');
    expect(result.ctxFull).toContain('Optional body.');
    expect(
      fs.readFileSync(path.join(outputDir, getMirrorRelativePath('/docs/sample/')), 'utf-8')
    ).toContain('[Optional](/docs/optional.md)');
  });
});
