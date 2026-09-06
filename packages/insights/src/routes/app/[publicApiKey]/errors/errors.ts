import type { ErrorRow } from '~/db';

export type ErrorGroup = Omit<ErrorRow, 'id' | 'publicApiKey' | 'timestamp'> & {
  key: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
};

export function groupErrors(errors: ErrorRow[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();

  for (const event of errors.slice().sort(compareNewestFirst)) {
    const key = JSON.stringify([event.message, event.source, event.line, event.column]);
    const existing = groups.get(key);
    if (existing) {
      existing.occurrences++;
      existing.firstSeen = event.timestamp.toISOString();
      continue;
    }

    groups.set(key, {
      key,
      manifestHash: event.manifestHash,
      url: event.url,
      source: event.source,
      line: event.line,
      column: event.column,
      message: event.message,
      error: event.error,
      stack: event.stack,
      occurrences: 1,
      firstSeen: event.timestamp.toISOString(),
      lastSeen: event.timestamp.toISOString(),
    });
  }

  return Array.from(groups.values());
}

export function getErrorRoute(url: string): string {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url;
  }
}

export function formatErrorDate(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
}

export function getErrorSince(now = Date.now()): Date {
  return new Date(now - 30 * 24 * 60 * 60 * 1000);
}

function compareNewestFirst(left: ErrorRow, right: ErrorRow): number {
  return right.timestamp.getTime() - left.timestamp.getTime() || right.id - left.id;
}
