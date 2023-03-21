import { execa } from 'execa';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type BuildConfig } from './util';
import { format } from 'prettier';

export async function generateApiMarkdownDocs(config: BuildConfig, apiJsonInputDir: string) {
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik']);
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik-city']);
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik-city', 'middleware']);
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik-city', 'static']);
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik-city', 'vite']);
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik-react']);
}

async function generateApiMarkdownPackageDocs(
  config: BuildConfig,
  apiJsonInputDir: string,
  pkgNames: string[]
) {
  const pkgDirNames = join(apiJsonInputDir, ...pkgNames);
  if (existsSync(pkgDirNames)) {
    const subPkgDirNames = readdirSync(pkgDirNames);
    for (const subPkgDirName of subPkgDirNames) {
      await generateApiMarkdownSubPackageDocs(config, apiJsonInputDir, [
        ...pkgNames,
        subPkgDirName,
      ]);
    }
  }
}

async function generateApiMarkdownSubPackageDocs(
  config: BuildConfig,
  apiJsonInputDir: string,
  names: string[]
) {
  const subPkgInputDir = join(apiJsonInputDir, ...names);
  if (!existsSync(join(subPkgInputDir, 'docs.api.json'))) {
    return;
  }

  const subPkgName = ['@builder.io', ...names].filter((n) => n !== 'core').join('/');
  console.log('📚', `Generate API ${subPkgName} markdown docs`);

  const mdOuputDir = join(
    config.packagesDir,
    'docs',
    'src',
    'routes',
    'api',
    ...names.filter((n) => n !== 'core')
  );
  mkdirSync(mdOuputDir, { recursive: true });
  console.log(mdOuputDir);

  await execa(
    'api-documenter',
    ['markdown', '--input-folder', subPkgInputDir, '--output-folder', mdOuputDir],
    {
      stdio: 'inherit',
      cwd: join(config.rootDir, 'node_modules', '.bin'),
    }
  );

  const mdDirFiles = readdirSync(mdOuputDir)
    .filter((m) => m.endsWith('.md'))
    .map((mdFileName) => {
      const mdPath = join(mdOuputDir, mdFileName);
      return {
        mdFileName,
        mdPath,
      };
    });

  let indexContent: string[] = [];
  for (const { mdPath } of mdDirFiles) {
    const mdSrcLines = readFileSync(mdPath, 'utf-8').split('\n');

    for (const line of mdSrcLines) {
      if (line.startsWith('[Home]')) {
        continue;
      }
      if (line.startsWith('<!-- ')) {
        continue;
      }
      indexContent.push(line);
    }

    rmSync(mdPath);
  }

  indexContent = [
    '---',
    `title: \\${subPkgName} API Reference`,
    '---',
    '',
    `# **API** ${subPkgName}`,
    ...indexContent.slice(12),
  ];

  const indexPath = join(mdOuputDir, 'index.md');

  const mdOutput = format(indexContent.join('\n'), {
    parser: 'markdown',
  });

  writeFileSync(indexPath, mdOutput);
}
