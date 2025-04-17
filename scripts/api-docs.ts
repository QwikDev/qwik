import { execa } from 'execa';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'prettier';
import { type BuildConfig } from './util';

export async function generateQwikApiMarkdownDocs(config: BuildConfig, apiJsonInputDir: string) {
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik']);
}

export async function generateQwikCityApiMarkdownDocs(
  config: BuildConfig,
  apiJsonInputDir: string
) {
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik-city']);
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik-city', 'middleware']);
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik-city', 'static']);
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik-city', 'vite']);

  // doesn't really belong here, ah well
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
    config.rootDir,
    'dist-dev',
    'api-docs',
    names.filter((n) => n !== 'core').join('-')
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

  await createApiData(config, docsApiJsonPath, apiOuputDir, subPkgName);
}

async function createApiData(
  config: BuildConfig,
  docsApiJsonPath: string,
  apiOuputDir: string,
  subPkgName: string
) {
  const apiExtractedJson = JSON.parse(readFileSync(docsApiJsonPath, 'utf-8'));

  const apiData: ApiData = {
    id: subPkgName.replace('@builder.io/', '').replace(/\//g, '-'),
    package: subPkgName,
    members: [],
  };

  function addMember(apiExtract: any, hierarchyStr: string) {
    const apiName = apiExtract.name || '';
    const apiKind = apiExtract.kind || '';
    if (apiName.length === 0) {
      return;
    }

    if (apiKind === 'PropertySignature') {
      if (!apiName.includes(':')) {
        // do not include PropertySignatures unless they are namespaced
        // like q:slot or preventdefault:click
        return;
      }
    }

    const hierarchySplit = hierarchyStr.split('/').filter((m) => m.length > 0);
    hierarchySplit.push(apiName);

    const hierarchy = hierarchySplit.map((h) => {
      return {
        name: h,
        id: getCanonical(hierarchySplit),
      };
    });

    const id = getCanonical(hierarchySplit);

    const mdFile = getMdFile(subPkgName, hierarchySplit);
    const mdPath = join(apiOuputDir, mdFile);

    const content: string[] = [];

    if (existsSync(mdPath)) {
      const mdSrcLines = readFileSync(mdPath, 'utf-8').split(/\r?\n/);

      for (const line of mdSrcLines) {
        if (line.startsWith('## ')) {
          continue;
        }
        if (line.startsWith('[Home]')) {
          continue;
        }
        if (line.startsWith('<!-- ')) {
          continue;
        }
        if (line.startsWith('**Signature:**')) {
          continue;
        }
        content.push(line);
      }
    } else {
      console.log('Unable to find md for', mdFile);
    }

    apiData.members.push({
      name: apiName,
      id,
      hierarchy,
      kind: apiKind,
      content: content.join('\n').trim(),
      editUrl: getEditUrl(config, apiExtract.fileUrlPath),
      mdFile,
    });
  }

  function addMembers(apiExtract: any, hierarchyStr: string) {
    if (Array.isArray(apiExtract?.members)) {
      for (const member of apiExtract.members) {
        addMembers(member, hierarchyStr + '/' + member.name);
        if (member.kind === 'Package' || member.kind === 'EntryPoint') {
          continue;
        }
        if (apiData.members.some((m) => member.name === m.name && member.kind === m.kind)) {
          continue;
        }
        addMember(member, hierarchyStr);
      }
    }
  }

  addMembers(apiExtractedJson, '');

  apiData.members.forEach((m1) => {
    apiData.members.forEach((m2) => {
      while (m1.content.includes(`./${m2.mdFile}`)) {
        m1.content = m1.content.replace(`./${m2.mdFile}`, `#${m2.id}`);
      }
    });
  });

  apiData.members.forEach((m) => {
    m.content = m.content.replace(/\.\/qwik(.*)\.md/g, '#');
  });

  apiData.members.sort((a, b) => {
    return a.name.localeCompare(b.name);
  });

  const docsDir = join(config.packagesDir, 'docs', 'src', 'routes', 'api', apiData.id);
  mkdirSync(docsDir, { recursive: true });

  const apiJsonPath = join(docsDir, `api.json`);
  writeFileSync(apiJsonPath, JSON.stringify(apiData, null, 2));

  const apiMdPath = join(docsDir, `index.mdx`);
  writeFileSync(apiMdPath, await createApiMarkdown(apiData));
}

async function createApiMarkdown(a: ApiData) {
  let md: string[] = [];

  md.push(`---`);
  md.push(`title: \\${a.package} API Reference`);
  md.push(`---`);
  md.push(``);
  md.push(`# [API](/api) &rsaquo; ${a.package}`);
  md.push(``);

  for (const m of a.members) {
    // const title = `${toSnakeCase(m.kind)} - ${m.name.replace(/"/g, '')}`;
    md.push(`## ${m.name}`);
    md.push(``);

    // sanitize / adjust output

    // Process the content to escape { characters only outside code blocks
    let processedContent = '';
    let inCodeBlock = false;
    let inInlineCode = false;

    const lines = m.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]
        .replace(/<!--(.|\s)*?-->/g, '')
        // .replace(/<Slot\/>/g, ''
        .replace(/\\#\\#\\# (\w+)/gm, '### $1')
        .replace(/\\\[/gm, '[')
        .replace(/\\\]/gm, ']');

      // Check for triple backtick code blocks
      if (line.trim().startsWith('```')) {
        inCodeBlock = !inCodeBlock;
        processedContent += line + '\n';
        continue;
      }

      if (!inCodeBlock) {
        // Process line character by character for inline code
        let newLine = '';
        for (let j = 0; j < line.length; j++) {
          const char = line[j];

          // Toggle inline code state when we see a backtick
          if (char === '`') {
            inInlineCode = !inInlineCode;
            newLine += char;
            continue;
          }

          // Escape { when not in any code context
          if (char === '{' && !inInlineCode) {
            newLine += '\\{';
          } else {
            newLine += char;
          }
        }
        processedContent += newLine + '\n';
      } else {
        // In code block, don't change anything
        processedContent += line + '\n';
      }
    }

    md.push(processedContent.trim());
    md.push(``);

    if (m.editUrl) {
      md.push(`[Edit this section](${m.editUrl})`);
      md.push(``);
    }
  }

  const mdOutput = await format(md.join('\n'), {
    parser: 'markdown',
  });
  return mdOutput;
}

interface ApiData {
  id: string;
  package: string;
  members: ApiMember[];
}

interface ApiMember {
  id: string;
  name: string;
  hierarchy: { name: string; id: string }[];
  kind: string;
  content: string;
  editUrl?: string;
  mdFile: string;
}

function getCanonical(hierarchy: string[]) {
  return hierarchy.map((h) => getSafeFilenameForName(h)).join('-');
}

function getMdFile(subPkgName: string, hierarchy: string[]) {
  let mdFile = '';
  for (const h of hierarchy) {
    mdFile += '.' + getSafeFilenameForName(h);
  }
  return `qwik${subPkgName.includes('city') ? '-city' : ''}${mdFile}.md`;
}

function getSafeFilenameForName(name: string): string {
  // https://github.com/microsoft/rushstack/blob/d0f8f10a9ce1ce4158ca2da5b79c54c71d028d89/apps/api-documenter/src/utils/Utilities.ts
  return name.replace(/[^a-z0-9_\-\.]/gi, '_').toLowerCase();
}

function getEditUrl(config: BuildConfig, fileUrlPath: string | undefined) {
  if (fileUrlPath) {
    const rootRelPath = fileUrlPath.slice(fileUrlPath.indexOf('dts-out') + 'dts-out'.length + 1);

    const tsxPath = join(config.rootDir, rootRelPath).replace(`.d.ts`, `.tsx`);
    if (existsSync(tsxPath)) {
      const url = new URL(rootRelPath, `https://github.com/QwikDev/qwik/tree/main/`);
      return url.href.replace(`.d.ts`, `.tsx`);
    }

    const tsPath = join(config.rootDir, rootRelPath).replace(`.d.ts`, `.ts`);
    if (existsSync(tsPath)) {
      const url = new URL(rootRelPath, `https://github.com/QwikDev/qwik/tree/main/`);
      return url.href.replace(`.d.ts`, `.ts`);
    }
  }
  return undefined;
}
