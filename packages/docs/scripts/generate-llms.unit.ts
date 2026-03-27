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

  test('flattens card grids into markdown lists', () => {
    const markdown = transformSourceToMarkdown(`---
title: Cards
---
## Getting Started with Qwik

<div class="card-grid">
  <a class="card card-intro" href="/docs/getting-started/">
    <div class="card-icon">
      <pixel.businessproductstartup1 class="intro-icon" />
    </div>
    <div class="card-body">
      <h3>Getting Started</h3>
      <p>Learn the basics and create your first Qwik app in minutes.</p>
    </div>
  </a>
  <a class="card card-intro card-violet" href="/docs/concepts/think-qwik/">
    <div class="card-icon">
      <pixel.interfaceessentialflash class="intro-icon" />
    </div>
    <div class="card-body">
      <h3>Why Qwik?</h3>
      <p>Understand resumability, JS streaming, and what makes Qwik unique.</p>
    </div>
  </a>
</div>

<div class="card-grid">
  <div class="card card-feature">
    <h3>General-purpose</h3>
    <p>Qwik can be used to build any type of website or application.</p>
  </div>
</div>
`);

    expect(markdown).toContain('## Getting Started with Qwik');
    expect(markdown).toContain(
      '- [Getting Started](/docs/getting-started/): Learn the basics and create your first Qwik app in minutes.'
    );
    expect(markdown).toContain(
      '- [Why Qwik?](/docs/concepts/think-qwik/): Understand resumability, JS streaming, and what makes Qwik unique.'
    );
    expect(markdown).toContain(
      '- **General-purpose:** Qwik can be used to build any type of website or application.'
    );
    expect(markdown).not.toContain('<div class="card-grid">');
    expect(markdown).not.toContain('<pixel.');
  });

  test('flattens details blocks into readable markdown', () => {
    const markdown = transformSourceToMarkdown(`---
title: Details
---
<details>
  <summary style={{color: "#17ADF5"}}>What is component$ and $?</summary>
  <p><span style={{color: "#A273F2"}}>component$</span> is used to declare a <a href="https://qwik.dev/docs/core/overview/#component">Qwik component.</a></p>
  <p><a href="https://qwik.dev/docs/advanced/dollar/#the-dollar--sign">The dollar sign</a> <span style={{color: "#A273F2"}}>$</span> is used to signal both the optimizer and the developer when Qwik splits up your application into many small pieces we call symbols.</p>
</details>
`);

    expect(markdown).toContain('**What is component$ and $?**');
    expect(markdown).toContain(
      'component$ is used to declare a [Qwik component.](https://qwik.dev/docs/core/overview/#component)'
    );
    expect(markdown).toContain(
      '[The dollar sign](https://qwik.dev/docs/advanced/dollar/#the-dollar--sign) $ is used to signal both the optimizer'
    );
    expect(markdown).not.toContain('<details>');
    expect(markdown).not.toContain('<summary');
  });

  test('converts html tables into markdown tables', () => {
    const markdown = transformSourceToMarkdown(`---
title: Table
---
<table><thead><tr><th>

Parameter

</th><th>

Type

</th></tr></thead>
<tbody><tr><td>

expression

</td><td>

T

</td></tr>
</tbody></table>
`);

    expect(markdown).toContain('| Parameter | Type |');
    expect(markdown).toContain('| --- | --- |');
    expect(markdown).toContain('| expression | T |');
    expect(markdown).not.toContain('<table>');
    expect(markdown).not.toContain('<th>');
  });

  test('converts html tables even when a cell contains a fenced code block', () => {
    const markdown = transformSourceToMarkdown(`---
title: Table with code
---
<table><thead><tr><th>

Property

</th><th>

Description

</th></tr></thead>
<tbody><tr><td>

loading

</td><td>

Whether the signal is currently loading.

\`\`\`tsx
signal.loading ? <Loading /> : <Ready />
\`\`\`

</td></tr>
</tbody></table>
    `);

    expect(markdown).toContain('| Property | Description |');
    expect(markdown).toContain('| loading | Whether the signal is currently loading.');
    expect(markdown).toContain('```tsx');
    expect(markdown).not.toContain('<table>');
  });

  test('replaces svg diagrams with readable text', () => {
    const markdown = transformSourceToMarkdown(`---
title: Diagram
---
<div style="background:white">
<svg viewBox="0 0 10 10" role="img" aria-label="Task lifecycle diagram">
  <rect x="0" y="0" width="10" height="10" />
</svg>
</div>

<video autoplay>
  <source src="https://cdn.example.com/demo.mp4" />
</video>
`);

    expect(markdown).toContain('**Diagram:** Task lifecycle diagram');
    expect(markdown).toContain('[Video](https://cdn.example.com/demo.mp4)');
    expect(markdown).not.toContain('<svg');
    expect(markdown).not.toContain('<video');
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
      resolveLlmsBaseUrl({ QWIK_LLMS_BASE_URL: 'https://v2.qwik.dev/' } as NodeJS.ProcessEnv)
    ).toBe('https://v2.qwik.dev');
    expect(() =>
      resolveLlmsBaseUrl({ QWIK_LLMS_BASE_URL: 'not-a-url' } as NodeJS.ProcessEnv)
    ).toThrow('Invalid QWIK_LLMS_BASE_URL');
    expect(
      resolveLlmsBaseUrl({ CF_PAGES_URL: 'https://preview.qwik.pages.dev/' } as NodeJS.ProcessEnv)
    ).toBe('https://qwik.dev');
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
