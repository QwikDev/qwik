import type { Range } from './schema';

/** A construct the pipeline cannot lower (yet or by decision) — fail loud, never wrong bytes. */
export class UnsupportedError extends Error {
  constructor(what: string) {
    super(`pipeline does not support: ${what}`);
  }
}

/** Invalid AUTHORED code — becomes an error diagnostic on a failed plan, not a crash. */
export class InvalidModuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly span: Range | null
  ) {
    super(message);
  }
}
