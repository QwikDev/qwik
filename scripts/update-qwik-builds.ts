import { readPackageJson, writePackageJson } from './package-json';

type Repos = 'qwik' | 'qwik-city' | 'qwik-labs';

async function main(packageDir: string) {
  if (!packageDir) {
    throw new Error('packageDir is required');
  }
  console.log('Updating:', packageDir);
  const packageJson = await readPackageJson(packageDir);
  await updateDependency(packageJson.devDependencies!, 'qwik');
  await updateDependency(packageJson.devDependencies!, 'qwik-city');
  await updateDependency(packageJson.devDependencies!, 'qwik-labs');
  writePackageJson(packageDir, packageJson);
}

async function updateDependency(deps: Record<string, string>, repo: Repos) {
  const key = '@builder.io/' + repo;
  const value = deps[key];
  const prefix = `github:QwikDev/${repo}-build#`;
  if (value && value.startsWith(prefix)) {
    const latestSHA = await getLatestSHA(repo);
    console.log('  ', value, '->', latestSHA);
    deps[key] = prefix + latestSHA;
  }
}

async function getLatestSHA(repo: Repos): Promise<string> {
  const response = await fetch(
    `https://api.github.com/repos/QwikDev/${repo}-build/commits/main?per_page=1`
  );
  const json = await response.json();
  if (typeof json.sha !== 'string' && json.sha.length == 0) {
    throw new Error(
      'Failed to fetch latest SHA for ' + repo + '\n' + JSON.stringify(json, null, 2)
    );
  }
  return json.sha as string;
}

const path = process.argv[2];
main(path);
