import fs from 'node:fs';
import { basename, join } from 'node:path';
import type { BuildTrieNode } from '../types';
import { normalizePath } from '../../utils/fs';
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

/** Walk the routes directory and return a BuildTrieNode with trie keys. */
export async function walkRoutes(routesDir: string): Promise<BuildTrieNode> {
  const dirPath = normalizePath(routesDir);
  const root: BuildTrieNode = {
    _files: [],
    _dirPath: dirPath,
    children: new Map(),
  };
  await walkRouteDir(root, dirPath);
  return root;
}

async function walkRouteDir(node: BuildTrieNode, dirPath: string) {
  const dirItemNames = await fs.promises.readdir(dirPath);

  await Promise.all(
    dirItemNames.map(async (itemName) => {
      const itemPath = normalizePath(join(dirPath, itemName));

      const stat = await fs.promises.stat(itemPath);
      if (stat.isDirectory()) {
        const parsed = parseDirName(itemName);

        if (parsed.key === null) {
          // Group directory: keep as child with (name) key for layout scoping
          let child = node.children.get(itemName);
          if (!child) {
            child = {
              _files: [],
              _dirPath: itemPath,
              children: new Map(),
            };
            node.children.set(itemName, child);
          }
          await walkRouteDir(child, itemPath);
        } else {
          let child = node.children.get(parsed.key);
          if (!child) {
            child = {
              _files: [],
              _dirPath: itemPath,
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
            node.children.set(parsed.key, child);
          }
          await walkRouteDir(child, itemPath);
        }
      } else {
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
    })
  );
}
