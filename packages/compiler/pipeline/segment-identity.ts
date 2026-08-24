/**
 * Segment naming — wire identity: serialized QRLs resolve by these symbols, so the FNV-1a hash,
 * path normalization, and sanitization rules must never drift.
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;

export function createSegmentSourceIdentity(path: string, scope?: string): string {
  const normalized = path.replaceAll('\\', '/');
  const isAbsolute = normalized.startsWith('/');
  const parts: string[] = [];
  for (const part of normalized.split('/')) {
    if (part === '' || part === '.') {
      continue;
    }
    if (part === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') {
        parts.pop();
      } else if (!isAbsolute) {
        parts.push(part);
      }
      continue;
    }
    parts.push(part);
  }
  return `${scope ?? ''}\0${isAbsolute ? '/' : ''}${parts.join('/')}`;
}

/** `$` spells out because bundlers strip it from file names, desyncing baked chunk paths. */
export function sanitizeSegmentName(value: string): string {
  const sanitized = value.replaceAll('$', 'qrl').replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(sanitized) ? sanitized : `_${sanitized}`;
}

export function createSegmentSymbolName(
  sourceIdentity: string,
  displayName: string,
  domain: 'component' | 'extracted' | 'synthetic'
): string {
  return `${displayName}_${hash64(`${sourceIdentity}\0${domain}\0${displayName}`)}`;
}

export function getSegmentSymbolHash(symbolName: string): string {
  return symbolName.slice(symbolName.lastIndexOf('_') + 1);
}

export function getSegmentDisplayName(symbolName: string): string {
  return symbolName.slice(0, symbolName.lastIndexOf('_'));
}

function hash64(value: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < value.length; i++) {
    hash ^= BigInt(value.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * FNV_PRIME);
  }
  return hash.toString(36);
}
