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

/** The default of a switch that handles every variant: reached only by a plan its types deny. */
export function assertNever(value: never, what: string): never {
  throw new UnsupportedError(`an unknown ${what}: ${JSON.stringify(value)}`);
}
