import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

export interface ChangedFile {
  filename: string;
  status?: string;
}

export const CORE_PACKAGE = '@qwik.dev/core';
export const OPTIMIZER_PACKAGE = '@qwik.dev/optimizer';

export async function getChangedFiles(): Promise<ChangedFile[]> {
  const envFiles = process.env.QWIK_CHANGED_FILES;
  if (envFiles) {
    return uniqueFiles(
      envFiles
        .split(/\r?\n|,/)
        .map((filename) => filename.trim())
        .filter(Boolean)
        .map((filename) => ({ filename }))
    );
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && existsSync(eventPath)) {
    const event = JSON.parse(await readFile(eventPath, 'utf-8'));
    const githubFiles = await getGithubEventChangedFiles(event);
    if (githubFiles.length > 0) {
      return uniqueFiles(githubFiles);
    }
  }

  return uniqueFiles(getLocalChangedFiles());
}

export function getOptimizerChangedFiles(files: ChangedFile[]) {
  return files.filter((file) => isOptimizerChange(file.filename));
}

export function isOptimizerChange(filename: string) {
  const normalized = normalizePath(filename);
  if (!normalized.startsWith('packages/optimizer/')) {
    return false;
  }
  if (normalized.endsWith('.tgz')) {
    return false;
  }
  if (normalized.includes('/node_modules/') || normalized.includes('/target/')) {
    return false;
  }
  return (
    normalized === 'packages/optimizer/package.json' ||
    normalized === 'packages/optimizer/vite.config.ts' ||
    normalized.startsWith('packages/optimizer/src/') ||
    normalized.startsWith('packages/optimizer/core/') ||
    normalized.startsWith('packages/optimizer/napi/') ||
    normalized.startsWith('packages/optimizer/wasm/') ||
    normalized.startsWith('packages/optimizer/bindings/')
  );
}

export function getShortSha() {
  const githubSha = getCurrentCommitSha();
  if (githubSha) {
    return githubSha.slice(0, 12);
  }
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf-8' }).trim();
  } catch {
    return String(Date.now());
  }
}

export async function getPkgPrNewCommit() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && existsSync(eventPath)) {
    const event = JSON.parse(await readFile(eventPath, 'utf-8'));
    const eventSha = event.pull_request?.head?.sha || event.after || event.head_commit?.id;
    if (eventSha) {
      return eventSha;
    }
  }
  return getCurrentCommitSha() || getShortSha();
}

export async function getGithubRepository() {
  if (process.env.GITHUB_REPOSITORY) {
    return process.env.GITHUB_REPOSITORY;
  }

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && existsSync(eventPath)) {
    const event = JSON.parse(await readFile(eventPath, 'utf-8'));
    if (event.repository?.full_name) {
      return event.repository.full_name;
    }
  }

  return 'QwikDev/qwik';
}

function normalizePath(filename: string) {
  return filename.replace(/\\/g, '/');
}

function getCurrentCommitSha() {
  return process.env.GITHUB_SHA;
}

async function getGithubEventChangedFiles(event: any): Promise<ChangedFile[]> {
  if (event.pull_request?.url) {
    return getGithubPullRequestFiles(event.pull_request.url);
  }

  if (Array.isArray(event.commits)) {
    return event.commits.flatMap((commit: any) => [
      ...toChangedFiles(commit.added, 'added'),
      ...toChangedFiles(commit.modified, 'modified'),
      ...toChangedFiles(commit.removed, 'removed'),
    ]);
  }

  if (event.head_commit) {
    return [
      ...toChangedFiles(event.head_commit.added, 'added'),
      ...toChangedFiles(event.head_commit.modified, 'modified'),
      ...toChangedFiles(event.head_commit.removed, 'removed'),
    ];
  }

  return [];
}

async function getGithubPullRequestFiles(prUrl: string): Promise<ChangedFile[]> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    return [];
  }

  const files: ChangedFile[] = [];
  for (let page = 1; ; page++) {
    const url = `${prUrl}/files?per_page=100&page=${page}`;
    const response = await fetch(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
    });
    if (!response.ok) {
      throw new Error(
        `Unable to list pull request files: ${response.status} ${response.statusText}`
      );
    }
    const pageFiles = (await response.json()) as Array<{ filename: string; status?: string }>;
    files.push(...pageFiles.map(({ filename, status }) => ({ filename, status })));
    if (pageFiles.length < 100) {
      break;
    }
  }
  return files;
}

function getLocalChangedFiles(): ChangedFile[] {
  return [
    ...gitChangedFiles(['diff', '--name-only', '--cached']),
    ...gitChangedFiles(['diff', '--name-only']),
  ].map((filename) => ({ filename }));
}

function gitChangedFiles(args: string[]) {
  try {
    return execFileSync('git', args, { encoding: 'utf-8' })
      .split(/\r?\n/)
      .map((filename) => filename.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function toChangedFiles(files: string[] | undefined, status: string): ChangedFile[] {
  return (files || []).map((filename) => ({ filename, status }));
}

function uniqueFiles(files: ChangedFile[]) {
  const seen = new Map<string, ChangedFile>();
  for (const file of files) {
    const filename = normalizePath(file.filename);
    if (!seen.has(filename)) {
      seen.set(filename, { ...file, filename });
    }
  }
  return [...seen.values()];
}
