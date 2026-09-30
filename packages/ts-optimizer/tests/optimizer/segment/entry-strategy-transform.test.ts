import { describe, expect, it } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

const source = `import { component$, useTask$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useThing = () => {
  useTask$(() => {
    console.log('a');
  });
  useTask$(() => {
    console.log('b');
  });
};

export const useData = routeLoader$(() => 1);

export const App = component$(() => {
  const count = 1;
  useTask$(() => {
    console.log(count);
  });
  return <button onClick$={() => console.log('click')}>x</button>;
});

export default component$(() => <div />);
`;

function entriesByDisplayName(path: string, mode: 'prod' | 'dev'): Record<string, string | null> {
  const result = transformModule({
    input: [{ path: mkFilePath(path), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    entryStrategy: { type: 'smart' },
    mode,
  });
  const entries: Record<string, string | null> = {};
  for (const mod of result.modules) {
    if (mod.kind === 'segment') {
      entries[mod.segment.displayName] = mod.segment.entry;
    }
  }
  return entries;
}

// Expected values come from the Rust optimizer on the same source.
const expectedEntries = {
  'test.tsx_App_component': 'test.tsx_entry_App',
  'test.tsx_App_component_useTask': 'test.tsx_entry_App',
  'test.tsx_App_component_button_q_e_click': null,
  'test.tsx_useThing_useTask': 'test.tsx_entry_useThing',
  'test.tsx_useThing_useTask_1': 'test.tsx_entry_useThing',
  'test.tsx_useData_routeLoader': 'test.tsx_entry_useData',
  'test.tsx_test_component': 'test.tsx_entry_test',
};

describe('smart entry strategy', () => {
  it('groups segments by their root context in prod mode', () => {
    expect(entriesByDisplayName('test.tsx', 'prod')).toEqual(expectedEntries);
  });

  it('groups segments by their root context in dev mode', () => {
    expect(entriesByDisplayName('test.tsx', 'dev')).toEqual(expectedEntries);
  });

  it('names a catch-all route entry after the raw file stem', () => {
    const entries = entriesByDisplayName('routes/[[...slug]].tsx', 'prod');
    expect(entries['[[...slug]].tsx_slug_component']).toBe(
      'routes/[[...slug]].tsx_entry_[[...slug]]'
    );
    expect(entries['[[...slug]].tsx_useThing_useTask']).toBe(
      'routes/[[...slug]].tsx_entry_useThing'
    );
  });
});
