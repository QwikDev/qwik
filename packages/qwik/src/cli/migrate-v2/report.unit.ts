import { afterEach, describe, expect, test } from 'vitest';
import { nextSteps, takeWarnings, warn, warnMentions } from './report';
import { createTmpProject } from './tools/tmp-project';

describe('report', () => {
  let project: ReturnType<typeof createTmpProject> | undefined;
  afterEach(() => {
    project?.cleanup();
    project = undefined;
    takeWarnings();
  });

  test('takeWarnings returns and clears the warnings', () => {
    warn('a.ts', 'first');
    warn('b.ts', 'second');
    expect(takeWarnings()).toEqual(['a.ts: first', 'b.ts: second']);
    expect(takeWarnings()).toEqual([]);
  });

  test('warnMentions warns for text files containing the text', () => {
    project = createTmpProject({
      'src/a.ts': `import '@qwik-city-not-found-paths';`,
      'src/b.ts': `import 'x';`,
      'image.png': '@qwik-city-not-found-paths',
    });
    warnMentions('@qwik-city-not-found-paths', 'removed');
    expect(takeWarnings()).toEqual(['src/a.ts: removed']);
  });

  test('nextSteps lists the steps for the v1 settings found in the project', () => {
    project = createTmpProject({
      'vite.config.ts': `qwikRouter({ strictLoaders: false })`,
      'src/entry.dev.tsx': `export default () => {};`,
      'src/routes/plugin@000-v1-errors.ts': `export const onRequest = () => {};`,
      'src/entry.ssr.tsx': `export default createRenderer(() => ({}));`,
    });
    const steps = nextSteps();
    expect(steps).toHaveLength(4);
    expect(steps[0]).toContain('`strictLoaders: false`');
    expect(steps[1]).toContain('plugin@000-v1-errors.ts');
    expect(steps[2]).toContain('Delete `src/entry.dev.tsx`');
    expect(steps[3]).toContain('type check');
  });
});
