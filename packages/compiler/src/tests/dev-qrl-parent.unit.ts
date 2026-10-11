/**
 * In dev the browser derives a segment URL from its parent module (`<parent>_<symbol>.js`), so a
 * server-side QRL stand-in must name the authored module; otherwise the client requests
 * `/<symbol>.js` and 404s.
 */
import { describe, test } from 'vitest';
import { testInput } from './snapshot-runner';

const SOURCE = `import { component$, useSignal } from '@qwik.dev/core';
import { server$ } from '@qwik.dev/router';
export default component$(() => {
  const count = useSignal(0);
  const read = server$(() => count.value);
  return <button onClick$={() => count.value++}>{count.value}</button>;
});
`;

const INPUT = { code: SOURCE, path: 'src/routes/index.tsx', devPath: '/src/routes/index.tsx' };
const OPTIONS = { mode: 'dev' as const, stripCtxName: ['server$'] };

describe('dev server QRL stand-ins', () => {
  test('ssr', () => testInput('ssr', 'dev-qrl-parent', INPUT, OPTIONS));
  test('csr', () => testInput('csr', 'dev-qrl-parent', INPUT, OPTIONS));
});
