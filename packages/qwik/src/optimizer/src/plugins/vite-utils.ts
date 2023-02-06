import type { OptimizerSystem } from '../types';

export const filterStack = (stack: string, offset: number = 0) => {
  return stack
    .split('\n')
    .slice(offset)
    .filter((l) => !l.includes('/node_modules/@builder.io/qwik') && !l.includes('(node:'))
    .join('\n');
};

export async function formatError(sys: OptimizerSystem, e: Error) {
  const err = e as any;
  let loc = err.loc;

  if (!err.frame && !err.plugin) {
    if (typeof e.stack === 'string') {
      e.stack = filterStack(e.stack);
    }
    if (!loc) {
      loc = findLocation(err);
    }
    if (loc) {
      err.loc = loc;
      if (loc.file) {
        const fs: typeof import('fs') = await sys.dynamicImport('node:fs');
        const { normalizePath }: typeof import('vite') = await sys.dynamicImport('vite');
        err.id = normalizePath(err.loc.file);
        try {
          const code = fs.readFileSync(err.loc.file, 'utf-8');
          err.frame = generateCodeFrame(code, err.loc);
        } catch {
          // nothing
        }
      }
    }
  }
  return e;
}

export interface Loc {
  file: string;
  line: number | undefined;
  column: number | undefined;
}

export const findLocation = (e: Error): Loc | undefined => {
  const stack = e.stack;
  if (typeof stack === 'string') {
    const lines = stack.split('\n');
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].replace('file:///', '/');
      if (/^\s+at/.test(line)) {
        const start = line.indexOf('/');
        const end = line.indexOf(')', start);
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
  pos: number | { line: number; column: number }
): number {
  if (typeof pos === 'number') return pos;
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
  start: number | { line: number; column: number } = 0,
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
        if (j < 0 || j >= lines.length) continue;
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
