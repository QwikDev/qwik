import { appendFileSync } from 'node:fs';
(globalThis as any).__qwikJsgenCensus = (stack: string, detail?: unknown) => {
  const site = (stack.split('\n')[2] ?? '?').trim();
  const extra = detail === undefined ? '' : ' ' + JSON.stringify(detail)?.slice(0, 220);
  appendFileSync('/tmp/jsgen-census.log', site + extra + '\n');
};
