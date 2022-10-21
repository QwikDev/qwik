/* eslint-disable no-console */
import fetch from 'node-fetch';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import matter from 'gray-matter';

const rootDir = path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..', '..');

async function updateContributors() {
  const routesDir = path.join(rootDir, 'packages', 'docs', 'src', 'routes');
  await updateDocsDir(routesDir);
}

async function updateDocsDir(dir: string) {
  const items = fs.readdirSync(dir);
  for (const itemName of items) {
    if (itemName === 'index.mdx') {
      await updateGithubCommits(path.join(dir, itemName));
    } else {
      const itemPath = path.join(dir, itemName);
      const itemStat = fs.statSync(itemPath);
      if (itemStat.isDirectory()) {
        await updateDocsDir(itemPath);
      }
    }
  }
}

async function updateGithubCommits(filePath: string) {
  const gm = matter.read(filePath);

  const repoPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const url = new URL(`https://api.github.com/repos/BuilderIO/qwik/commits`);
  url.searchParams.set('since', new Date('2022-01-01').toISOString());
  url.searchParams.set('path', repoPath);

  const response = await fetch(url.href);
  const commits: any = await response.json();

  const contributors: { author: string; count: number }[] = [];

  for (const commit of commits) {
    const author = commit?.author?.login;
    if (author) {
      const contributor = contributors.find((c) => c.author === author);
      if (contributor) {
        contributor.count++;
      } else {
        contributors.push({ author, count: 1 });
      }
    }
  }

  contributors.sort((a, b) => {
    if (a.count > b.count) return -1;
    if (a.count < b.count) return 1;
    return 0;
  });

  gm.data.contributors = gm.data.contributors || [];
  for (const contributor of contributors) {
    if (!gm.data.contributors.includes(contributor.author)) {
      gm.data.contributors.push(contributor.author);
    }
  }

  const md = matter.stringify(gm.content, gm.data);

  fs.writeFileSync(filePath, md);

  console.log(repoPath, contributors.length);
}

updateContributors();
