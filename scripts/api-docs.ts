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
  const docsApiJsonPath = join(subPkgInputDir, 'docs.api.json');
  if (!existsSync(docsApiJsonPath)) {
    return;
  }

  const subPkgName = ['@builder.io', ...names].filter((n) => n !== 'core').join('/');
  console.log('📚', `Generate API ${subPkgName} markdown docs`);

  const apiOuputDir = join(
    config.packagesDir,
    'docs',
    'src',
    'routes',
    'api',
    ...names.filter((n) => n !== 'core')
  );
  mkdirSync(apiOuputDir, { recursive: true });
  console.log(apiOuputDir);

  await execa(
    'api-documenter',
    ['markdown', '--input-folder', subPkgInputDir, '--output-folder', apiOuputDir],
    {
      stdio: 'inherit',
      cwd: join(config.rootDir, 'node_modules', '.bin'),
    }
  );

  createApiPage(subPkgName, apiOuputDir);
  createApiData(docsApiJsonPath, apiOuputDir, subPkgName);
}

function createApiPage(subPkgName: string, apiOuputDir: string) {
  const mdDirFiles = readdirSync(apiOuputDir)
    .filter((m) => m.endsWith('.md'))
    .map((mdFileName) => {
      const mdPath = join(apiOuputDir, mdFileName);
      return {
        mdFileName,
        mdPath,
      };
    });

  let apiContent: string[] = [];

  for (const { mdPath } of mdDirFiles) {
    const mdOutput = getApiMarkdownOutput(mdPath);
    apiContent = [...apiContent, ...mdOutput];
    rmSync(mdPath);
  }

  apiContent = [
    '---',
    `title: \\${subPkgName} API Reference`,
    '---',
    '',
    `# ${subPkgName} API Reference`,
    ...apiContent.slice(12),
  ];

  const indexPath = join(apiOuputDir, 'index.md');

  const mdOutput = format(apiContent.join('\n'), {
    parser: 'markdown',
  });

  writeFileSync(indexPath, mdOutput);
}

function getApiMarkdownOutput(mdPath: string) {
  const output: string[] = [];
  const mdSrcLines = readFileSync(mdPath, 'utf-8').split('\n');

  for (const line of mdSrcLines) {
    if (line.startsWith('[Home]')) {
      continue;
    }
    if (line.startsWith('<!-- ')) {
      continue;
    }
    output.push(line);
  }
  return output;
}

function createApiData(docsApiJsonPath: string, apiOuputDir: string, subPkgName: string) {
  const apiExtractedJson = JSON.parse(readFileSync(docsApiJsonPath, 'utf-8'));

  const apiData: ApiData = {
    package: subPkgName,
    members: [],
  };

  function addMembers(a: any) {
    if (Array.isArray(a?.members)) {
      for (const m of a.members) {
        if (m.kind !== 'Package' && m.kind !== 'EntryPoint') {
          apiData.members.push({
            name: m.name,
            kind: m.kind,
          });
        }
        addMembers(m);
      }
    }
  }

  addMembers(apiExtractedJson);

  const apiDataPath = join(apiOuputDir, 'api-data.json');
  writeFileSync(apiDataPath, JSON.stringify(apiData, null, 2));
}

interface ApiData {
  package: string;
  members: ApiMember[];
}

interface ApiMember {
  name: string;
  kind: string;
}
