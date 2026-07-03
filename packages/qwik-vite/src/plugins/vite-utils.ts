export interface Loc {
  file: string;
  line: number | undefined;
  column: number | undefined;
}

export const findLocation = (e: Error): Loc | undefined => {
  const stack = e.stack;
  if (typeof stack === 'string') {
    const lines = stack
      .split('\n')
      .filter((l) => !l.includes('/node_modules/') && !l.includes('(node:'));

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].replace('file:///', '/');
      if (/^\s+at/.test(line)) {
        const start = line.indexOf('/');
        const end = line.lastIndexOf(')', start);
        if (start > 0) {
          const path = line.slice(start, end);
          const parts = path.split(':');
          const nu0 = safeParseInt(parts[parts.length - 1]);
          const nu1 = safeParseInt(parts[parts.length - 2]);
          if (typeof nu0 === 'number' && typeof nu1 === 'number') {
            parts.length -= 2;
            return {
              file: parts.join(':'),
              line: nu1,
              column: nu0,
            };
          } else if (typeof nu0 === 'number') {
            parts.length -= 1;
            return {
              file: parts.join(':'),
              line: nu0,
              column: undefined,
            };
          } else {
            return {
              file: parts.join(':'),
              line: undefined,
              column: undefined,
            };
          }
        }
      }
    }
  }
  return undefined;
};

export const isVirtualId = (id: string) => id.startsWith('\0');

export const toDevPath = (normalizedId: string, normalizedRootDir: string): string => {
  const root = normalizedRootDir.replace(/\/+$/, '');
  if (normalizedId.startsWith(root + '/')) {
    return normalizedId.slice(root.length);
  }
  return '/@fs/' + normalizedId.replace(/^\/+/, '');
};

const safeParseInt = (nu: string) => {
  try {
    return parseInt(nu, 10);
  } catch {
    return undefined;
  }
};

const splitRE = /\r?\n/;
const range: number = 2;

export function posToNumber(
  source: string,
  pos: number | { line: number; column: number; lo: number }
): number {
  if (typeof pos === 'number') {
    return pos;
  }
  if (pos.lo != null) {
    return pos.lo;
  }
  const lines = source.split(splitRE);
  const { line, column } = pos;
  let start = 0;
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    start += lines[i].length + 1;
  }
  return start + column;
}

export function generateCodeFrame(
  source: string,
  start: number | { line: number; column: number; lo: number } = 0,
  end?: number
): string {
  start = posToNumber(source, start);
  end = end || start;
  const lines = source.split(splitRE);
  let count = 0;
  const res: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    count += lines[i].length + 1;
    if (count >= start) {
      for (let j = i - range; j <= i + range || end > count; j++) {
        if (j < 0 || j >= lines.length) {
          continue;
        }
        const line = j + 1;
        res.push(`${line}${' '.repeat(Math.max(3 - String(line).length, 0))}|  ${lines[j]}`);
        const lineLength = lines[j].length;
        if (j === i) {
          // push underline
          const pad = Math.max(start - (count - lineLength) + 1, 0);
          const length = Math.max(1, end > count ? lineLength - pad : end - start);
          res.push(`   |  ` + ' '.repeat(pad) + '^'.repeat(length));
        } else if (j > i) {
          if (end > count) {
            const length = Math.max(Math.min(end - count, lineLength), 1);
            res.push(`   |  ` + '^'.repeat(length));
          }
          count += lineLength + 1;
        }
      }
      break;
    }
  }
  return res.join('\n');
}

export function isWin(os: string): boolean {
  return os === 'win32';
}

export function parseId(originalId: string) {
  const [pathId, query] = originalId.split('?');
  const queryStr = query || '';
  return {
    originalId,
    pathId,
    query: queryStr ? `?${query}` : '',
    params: new URLSearchParams(queryStr),
  };
}

export const getSymbolHash = (symbolName: string) =>
  /_([a-zA-Z0-9]+)($|\.js($|\?))/.exec(symbolName)?.[1];

/**
 * Flatten a path-like name into a chunk `[name]`-safe token (Rolldown rejects path separators
 * there).
 */
export const flattenToChunkName = (name: string) =>
  name
    .replace(/^[A-Za-z]:/, '')
    .replace(/^(\.\.[/\\])+/, '')
    .replace(/^\.[/\\]/, '')
    .replace(/^[/\\]+/, '')
    .replace(/[/\\]+/g, '-');

// Chunk names the manifest matches to find the core/preloader bundles; a user or segment chunk must
// never collide with one or it would hijack that manifest pointer. (The qwikloader is matched by its
// emit reference instead, so a same-named route chunk can't shadow it.)
const RESERVED_CHUNK_NAMES = new Set(['qwik-core', 'qwikloader', 'qwik-preloader']);

/**
 * Turn an entry/segment name into a chunk `[name]`, kept clear of path separators and reserved
 * names.
 */
export const sanitizeChunkGroupName = (name: string | null | undefined) => {
  if (!name) {
    return null;
  }
  const chunkName = /[/\\]/.test(name) ? flattenToChunkName(name) : name;
  if (!chunkName) {
    return null;
  }
  return RESERVED_CHUNK_NAMES.has(chunkName) ? `${chunkName}-segment` : chunkName;
};
