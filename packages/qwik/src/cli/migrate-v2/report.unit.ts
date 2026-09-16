import { afterEach, describe, expect, test } from 'vitest';
import { takeWarnings, warn, warnMentions } from './report';
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
});
