import { appendFileSync } from 'node:fs';
import { expect } from 'vitest';
(globalThis as any).__qwikJsgenCensus = (stack: string, detail?: unknown) => {
  const site = (stack.split('\n')[2] ?? '?').trim();
  const extra = detail === undefined ? '' : ' ' + JSON.stringify(detail)?.slice(0, 220);
  let test = '?';
  try {
    const state = expect.getState();
    test = `${state.testPath?.split('/').pop()} > ${state.currentTestName}`;
  } catch {
    /* outside a test */
  }
  appendFileSync('/tmp/jsgen-census.log', `${site}${extra} [${test}]\n`);
};
