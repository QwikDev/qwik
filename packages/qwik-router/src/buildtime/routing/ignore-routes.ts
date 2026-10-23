import { relative } from 'node:path';
import { normalizePath } from '../../utils/fs';
import type { NormalizedPluginOptions } from '../types';

/**
 * Matcher for the `ignoreRoutes` plugin option.
 *
 * Patterns are matched against file and folder paths relative to `routesDir`, anchored and used as
 * written. `*`, `**`, `?` and `{a,b}` are wildcards; everything else - including `[`, `]`, `(` and
 * `)` - is literal, so patterns look like the route folder tree. Matching is case-insensitive, the
 * way route segments become lowercase URLs.
 */
export interface IgnoreMatcher {
  /** `relPath` is posix, relative to `routesDir`, without a leading slash. */
  isIgnored(relPath: string): boolean;
  /** Patterns that never matched anything - a typo, a stale folder, or a redundant pattern. */
  unusedPatterns(): string[];
}

export function createIgnoreMatcher(patterns: string[] | undefined): IgnoreMatcher | null {
  if (!patterns?.length) {
    return null;
  }
  const compiled = patterns.map((pattern) => ({
    pattern,
    regexp: globToRegExp(pattern),
    isUsed: false,
  }));

  return {
    isIgnored(relPath) {
      let isIgnored = false;
      // Every pattern is tested, not just the first hit, so overlapping patterns count as used.
      for (const entry of compiled) {
        if (entry.regexp.test('/' + relPath)) {
          entry.isUsed = true;
          isIgnored = true;
        }
      }
      return isIgnored;
    },
    unusedPatterns() {
      return compiled.filter((entry) => !entry.isUsed).map((entry) => entry.pattern);
    },
  };
}

/** Keyed on the options' own array, which `normalizeOptions` creates once per routing context. */
const matcherByPatterns = new WeakMap<string[], IgnoreMatcher>();

/**
 * Whether a route file lives under an `ignoreRoutes` match. Ancestors are tested too, so a pattern
 * naming only a folder still covers the files inside it.
 */
export function isIgnoredRoutePath(opts: NormalizedPluginOptions, filePath: string) {
  const patterns = opts.ignoreRoutes;
  if (!patterns?.length) {
    return false;
  }
  // Called once per markdown link and per watcher event, so the patterns are compiled once.
  let matcher = matcherByPatterns.get(patterns);
  if (!matcher) {
    matcher = createIgnoreMatcher(patterns)!;
    matcherByPatterns.set(patterns, matcher);
  }
  let relPath = normalizePath(relative(opts.routesDir, filePath));
  if (relPath.startsWith('..')) {
    return false;
  }
  while (relPath !== '') {
    if (matcher.isIgnored(relPath)) {
      return true;
    }
    relPath = relPath.slice(0, Math.max(relPath.lastIndexOf('/'), 0));
  }
  return false;
}

/** Paths are tested with a leading slash so a `**` segment can span zero segments. */
function globToRegExp(pattern: string) {
  const segments = pattern.split('/');
  let source = '';

  for (let i = 0; i < segments.length; i++) {
    if (segments[i] === '**') {
      // Trailing `**` also matches the folder itself, so the whole subtree goes with it.
      source += i === segments.length - 1 ? '(?:/.*)?' : '(?:/[^/]*)*';
    } else {
      source += '/' + segmentToRegExpSource(segments[i]);
    }
  }

  return new RegExp(`^${source}$`, 'i');
}

function segmentToRegExpSource(segment: string) {
  let source = '';

  for (let i = 0; i < segment.length; i++) {
    const char = segment[i];
    if (char === '*') {
      // Collapse runs of `*` so the segment never gets an ambiguous `[^/]*[^/]*`.
      while (segment[i + 1] === '*') {
        i++;
      }
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else if (char === '{' && segment.includes('}', i)) {
      const end = segment.indexOf('}', i);
      const alternatives = segment.slice(i + 1, end).split(',');
      source += `(?:${alternatives.map(segmentToRegExpSource).join('|')})`;
      i = end;
    } else {
      source += escapeRegExpChar(char);
    }
  }

  return source;
}

function escapeRegExpChar(char: string) {
  return /[.*+?^${}()|[\]\\/]/.test(char) ? '\\' + char : char;
}
