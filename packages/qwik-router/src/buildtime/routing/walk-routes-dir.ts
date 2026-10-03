import fs from 'node:fs';
import { basename, join, relative } from 'node:path';
import type { BuildTrieNode, RouteSourceFile } from '../types';
import { normalizePath } from '../../utils/fs';
import type { IgnoreMatcher } from './ignore-routes';
import { getSourceFile } from './source-file';

/**
 * Parse a directory name into a trie key + optional param metadata.
 *
 * - `(group)` → pathless group node (returns null key, stored with original name)
 * - `[slug]` → `{ key: '_W', paramName: 'slug' }`
 * - `[...rest]` → `{ key: '_A', paramName: 'rest' }`
 * - `pre[slug]post` → `{ key: '_W', paramName: 'slug', prefix: 'pre', suffix: 'post' }`
 * - `blog` → `{ key: 'blog' }` (lowercased)
 */
export function parseDirName(name: string): {
  key: string | null;
  paramName?: string;
  prefix?: string;
  suffix?: string;
} {
  // Group layout: (name) — merge into parent
  if (name.startsWith('(') && name.endsWith(')')) {
    return { key: null };
  }

  // Rest param: [...name]
  const restMatch = /^\[\.\.\.(\w+)\]$/.exec(name);
  if (restMatch) {
    return { key: '_A', paramName: restMatch[1] };
  }

  // Param or infix param: [name] or pre[name]post
  const paramMatch = /^(.*?)\[(\w+)\](.*?)$/.exec(name);
  if (paramMatch) {
    return {
      key: '_W',
      paramName: paramMatch[2],
      prefix: paramMatch[1] || undefined,
      suffix: paramMatch[3] || undefined,
    };
  }

  // Static segment (lowercased)
  return { key: name.toLowerCase() };
}

export interface WalkRoutesResult {
  root: BuildTrieNode;
  /** Paths relative to `routesDir` skipped by `ignoreRoutes`, folders with a trailing `/` */
  ignoredPaths: string[];
  /** Skipped files the route scan would otherwise have recognised */
  ignoredFiles: RouteSourceFile[];
}

/** Everything the recursion needs that does not change between directories. */
interface WalkContext {
  result: WalkRoutesResult;
  routesDir: string;
  ignoreMatcher: IgnoreMatcher | null;
}

/** Walk the routes directory and return a BuildTrieNode with trie keys. */
export async function walkRoutes(
  routesDir: string,
  ignoreMatcher: IgnoreMatcher | null
): Promise<WalkRoutesResult> {
  const dirPath = normalizePath(routesDir);
  const result: WalkRoutesResult = {
    root: { _files: [], children: new Map() },
    ignoredPaths: [],
    ignoredFiles: [],
  };
  await walkRouteDir({ result, routesDir: dirPath, ignoreMatcher }, result.root, dirPath);
  // Nested walks finish out of order, so the build log reads the same on every machine.
  result.ignoredPaths.sort();
  return result;
}

async function walkRouteDir(walk: WalkContext, node: BuildTrieNode, dirPath: string) {
  const { result, routesDir, ignoreMatcher } = walk;
  // Sorted and pushed in that order so the trie never depends on readdir or stat completion order.
  const dirItemNames = (await fs.promises.readdir(dirPath)).sort();
  const dirItems = await Promise.all(
    dirItemNames.map(async (itemName) => {
      const itemPath = normalizePath(join(dirPath, itemName));
      const stat = await fs.promises.stat(itemPath);
      return { itemName, itemPath, isDirectory: stat.isDirectory() };
    })
  );

  const childWalks: Promise<void>[] = [];
  for (const { itemName, itemPath, isDirectory } of dirItems) {
    const relPath = ignoreMatcher ? normalizePath(relative(routesDir, itemPath)) : '';
    if (ignoreMatcher?.isIgnored(relPath)) {
      result.ignoredPaths.push(relPath + (isDirectory ? '/' : ''));
      const ignoredSourceFile = isDirectory ? null : getSourceFile(itemName);
      if (ignoredSourceFile) {
        result.ignoredFiles.push({
          ...ignoredSourceFile,
          fileName: itemName,
          filePath: itemPath,
          dirName: basename(dirPath),
          dirPath: normalizePath(dirPath),
        });
      }
      if (isDirectory) {
        childWalks.push(markPatternsUsed(walk, itemPath));
      }
      continue;
    }

    if (isDirectory) {
      childWalks.push(walkRouteDir(walk, getOrCreateChildNode(node, itemName), itemPath));
      continue;
    }
    const sourceFileName = getSourceFile(itemName);
    if (sourceFileName !== null) {
      node._files.push({
        ...sourceFileName,
        fileName: itemName,
        filePath: itemPath,
        dirName: basename(dirPath),
        dirPath: normalizePath(dirPath),
      });
    }
  }
  await Promise.all(childWalks);
}

function getOrCreateChildNode(node: BuildTrieNode, dirName: string): BuildTrieNode {
  const parsed = parseDirName(dirName);
  // A group directory keeps its `(name)` key so its layout scopes to the group.
  const key = parsed.key ?? dirName;
  const existing = node.children.get(key);
  if (existing) {
    return existing;
  }
  const child: BuildTrieNode = {
    _files: [],
    children: new Map(),
  };
  if (parsed.paramName) {
    child._P = parsed.paramName;
  }
  if (parsed.prefix) {
    child._0 = parsed.prefix;
  }
  if (parsed.suffix) {
    child._9 = parsed.suffix;
  }
  node.children.set(key, child);
  return child;
}

/**
 * An ignored folder drops its whole subtree, but the subtree is still scanned so a pattern that
 * only matches inside it still counts as used - otherwise it would be reported as matching
 * nothing.
 */
async function markPatternsUsed(walk: WalkContext, dirPath: string) {
  const dirItemNames = await fs.promises.readdir(dirPath);
  await Promise.all(
    dirItemNames.map(async (itemName) => {
      const itemPath = normalizePath(join(dirPath, itemName));
      walk.ignoreMatcher!.isIgnored(normalizePath(relative(walk.routesDir, itemPath)));
      if ((await fs.promises.stat(itemPath)).isDirectory()) {
        await markPatternsUsed(walk, itemPath);
      }
    })
  );
}

/** Flatten every source file the trie collected, in walk order. */
export function collectSourceFiles(node: BuildTrieNode, files: RouteSourceFile[] = []) {
  files.push(...node._files);
  for (const child of node.children.values()) {
    collectSourceFiles(child, files);
  }
  return files;
}
