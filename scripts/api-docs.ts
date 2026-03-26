import { execa } from 'execa';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { format } from 'prettier';
import { type BuildConfig, toSnakeCase } from './util.ts';

export async function generateQwikApiMarkdownDocs(config: BuildConfig, apiJsonInputDir: string) {
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik']);
}

export async function generateQwikRouterApiMarkdownDocs(
  config: BuildConfig,
  apiJsonInputDir: string
) {
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik-router']);
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik-router', 'middleware']);
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik-router', 'static']);
  await generateApiMarkdownPackageDocs(config, apiJsonInputDir, ['qwik-router', 'vite']);

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

  const subPkgName = ['@qwik.dev', ...names].filter((n) => n !== 'core').join('/');
  console.log('📚', `Generate API ${subPkgName} markdown docs`);

  const apiOutputDir = join(
    config.rootDir,
    'dist-dev',
    'api-docs',
    names.filter((n) => n !== 'core').join('-')
  );
  mkdirSync(apiOutputDir, { recursive: true });
  console.log(apiOutputDir);

  await execa(
    'api-documenter',
    ['markdown', '--input-folder', subPkgInputDir, '--output-folder', apiOutputDir],
    {
      stdio: 'inherit',
      cwd: join(config.rootDir, 'node_modules', '.bin'),
    }
  );

  await createApiData(config, docsApiJsonPath, apiOutputDir, subPkgName);
}

async function createApiData(
  config: BuildConfig,
  docsApiJsonPath: string,
  apiOuputDir: string,
  subPkgName: string
) {
  const apiExtractedJson = JSON.parse(readFileSync(docsApiJsonPath, 'utf-8'));
  const mdPrefix = getMdPrefix(apiExtractedJson, subPkgName);

  const apiData: ApiData = {
    id: subPkgName.replace('@qwik.dev/', '').replace(/\//g, '-'),
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

    const mdFile = getMdFile(mdPrefix, hierarchySplit);
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

  const memberNameCounts = getMemberNameCounts(apiData.members);
  const memberAnchorsByMdFile = new Map(
    apiData.members.map((member) => [member.mdFile, `#${getAnchorId(member, memberNameCounts)}`])
  );

  apiData.members.forEach((member) => {
    // `api-documenter` emits many standalone markdown files into `dist-dev/api-docs`,
    // but the docs site publishes a single `index.mdx` page per package. Rewrite links
    // to included members as in-page anchors, and fall back to plain text for members
    // we intentionally omit from the final one-page docs output.
    member.content = member.content.replace(
      /\[([^\]]+)\]\(\.\/([^)]+\.md)\)/g,
      (_match, label: string, mdFile: string) => {
        const anchor = memberAnchorsByMdFile.get(mdFile);
        return anchor ? `[${label}](${anchor})` : label;
      }
    );
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

  const memberNameCounts = getMemberNameCounts(a.members);

  md.push(`---`);
  md.push(`title: \\${a.package} API Reference`);
  md.push(`---`);
  md.push(``);
  md.push(`# [API](/api) &rsaquo; ${a.package}`);
  md.push(``);

  for (const m of a.members) {
    // const title = `${toSnakeCase(m.kind)} - ${m.name.replace(/"/g, '')}`;
    const anchorId = getAnchorId(m, memberNameCounts);

    md.push(`<h2 id="${anchorId}">${m.name}</h2>`);
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

function getMemberNameCounts(members: ApiMember[]) {
  return members.reduce((acc: Record<string, number>, member) => {
    const normalizedName = member.name.toLowerCase();
    acc[normalizedName] = (acc[normalizedName] || 0) + 1;
    return acc;
  }, {});
}

function getAnchorId(member: ApiMember, memberNameCounts: Record<string, number>) {
  const normalizedName = member.name.toLowerCase();
  if (memberNameCounts[normalizedName] > 1) {
    return `${member.id}-${toSnakeCase(member.kind)}`;
  }
  return member.id;
}

function getCanonical(hierarchy: string[]) {
  return hierarchy.map((h) => getSafeFilenameForName(h)).join('-');
}

function getMdPrefix(apiExtractedJson: any, subPkgName: string) {
  if (typeof apiExtractedJson?.name === 'string' && apiExtractedJson.name.length > 0) {
    return getSafeFilenameForName(apiExtractedJson.name.split('/').pop()!);
  }

  return subPkgName.includes('router') ? 'router' : 'core';
}

function getMdFile(mdPrefix: string, hierarchy: string[]) {
  let mdFile = '';
  for (const h of hierarchy) {
    mdFile += '.' + getSafeFilenameForName(h);
  }

  return `${mdPrefix}${mdFile}.md`;
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
