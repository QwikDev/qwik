import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type {
  TransformModule,
  SegmentMetadataInternal,
} from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

function findParent(result: { modules: readonly TransformModule[] }): TransformModule {
  const parent = result.modules.find((m) => m.kind === 'parent');
  if (!parent) {
    throw new Error('parent module not found');
  }
  return parent;
}

function findSegmentByCtx(
  result: { modules: readonly TransformModule[] },
  ctxName: string
): TransformModule {
  const m = result.modules.find((mod) => mod.kind === 'segment' && mod.segment.ctxName === ctxName);
  if (!m) {
    throw new Error(`segment with ctxName=${ctxName} not found`);
  }
  return m;
}

describe('stripped-QRL parent emission cleanup', () => {
  it('numbers a top-level worker$ and stripped loaders without collisions', () => {
    const input = `
import { worker$ } from '@qwik.dev/core/worker';
import { routeLoader$ } from '@qwik.dev/router';
export const doWork = worker$(() => 1);
export const useFirst = routeLoader$(() => 1);
export const useSecond = routeLoader$(() => 2);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true,
      transpileJsx: true,
      entryStrategy: { type: 'segment' },
      stripCtxName: ['route'],
    });

    const code = findParent(result).code;
    const refs = [
      'doWork = workerQrl',
      'useFirst = routeLoaderQrl',
      'useSecond = routeLoaderQrl',
    ].map((site) => code.match(new RegExp(`${site}\\((q_qrl_\\d+)\\)`))?.[1]);
    expect(new Set(refs).size).toBe(3);
    for (const ref of refs) {
      expect(ref).toBeDefined();
      expect(code).toContain(`const ${ref} = `);
    }
    expect(code).toMatch(new RegExp(`const ${refs[0]} = .*_qrlWithChunk\\(`));
    expect(code).toMatch(/import \{[^}]*\b_qrlWithChunk\b[^}]*\} from "@qwik\.dev\/core"/);
  });

  it('keeps a regCtx QRL declared even when its ctx name is also in the strip list', () => {
    const input = `
import { server$ } from '@qwik.dev/router';
export const srv = server$(() => 1);
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true,
      transpileJsx: true,
      entryStrategy: { type: 'segment' },
      stripCtxName: ['server'],
      regCtxName: ['server'],
    });

    const code = findParent(result).code;
    const ref = code.match(/srv = serverQrl\((q_[A-Za-z0-9_]+)\)/)?.[1];
    expect(ref).toBeDefined();
    expect(ref).not.toMatch(/^q_qrl_/);
    expect(code).toMatch(new RegExp(`const ${ref} = /\\*#__PURE__\\*/ qrl\\(`));
    expect(code).toMatch(/import \{[^}]*\bqrl\b[^}]*\} from "@qwik\.dev\/core"/);
  });

  it('wires each stripped top-level loader to its own sentinel QRL', () => {
    const input = `
import { routeLoader$ } from '@qwik.dev/router';
export const useFirst = routeLoader$(() => 1);
export const useSecond = routeLoader$(({ query }) => query.get('q'));
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true,
      transpileJsx: true,
      entryStrategy: { type: 'segment' },
      stripCtxName: ['route'],
    });

    const code = findParent(result).code;
    const first = code.match(/useFirst = routeLoaderQrl\((q_qrl_\d+)\)/)?.[1];
    const second = code.match(/useSecond = routeLoaderQrl\((q_qrl_\d+)\)/)?.[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(code).toContain(`const ${first} = `);
    expect(code).toContain(`const ${second} = `);
  });

  it('counts non-stripped sibling functions in sentinel numbering', () => {
    const input = `
import { component$, useClientMount$, useTask$ } from '@qwik.dev/core';
export const Parent = component$(() => {
  useClientMount$(() => {});
  useTask$(() => {});
  return <div shouldRemove$={() => {}} onClick$={() => {}}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true,
      transpileJsx: true,
      entryStrategy: { type: 'inline' },
      stripCtxName: ['useClientMount$'],
      stripEventHandlers: true,
    });
    const parent = findParent(result);

    expect(parent.code).toContain('useClientMountQrl(q_qrl_4294901760)');
    expect(parent.code).toContain('shouldRemove$: q_qrl_4294901764');
    expect(parent.code).toContain('"q-e:click": q_qrl_4294901766');
    const taskVar = /useTaskQrl\((q_[\w$]+)/.exec(parent.code)?.[1];
    const taskDeclaration = parent.code
      .split('\n')
      .findIndex((line) => line.startsWith(`const ${taskVar} =`));
    const strippedDeclaration = parent.code
      .split('\n')
      .findIndex((line) => line.startsWith('const q_qrl_4294901760'));
    expect(taskDeclaration).toBeGreaterThan(-1);
    expect(taskDeclaration).toBeLessThan(strippedDeclaration);
  });

  it('counts nested descendants before a stripped segment', () => {
    const input = `
import { $, client$, component$, serverStuff$, useTask$ } from '@qwik.dev/core';
export const Parent = component$(() => {
  useTask$(() => {});
  serverStuff$(() => [$(() => {}), client$(() => {})]);
  useTask$(() => {});
  return <div/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true,
      transpileJsx: true,
      entryStrategy: { type: 'segment' },
      stripCtxName: ['serverStuff$'],
    });
    const component = findSegmentByCtx(result, 'component$');

    expect(component.code).toContain('serverStuffQrl(q_qrl_4294901766)');
    const liveQrlVars = [...component.code.matchAll(/^const (q_(?!qrl_)[\w$]+)/gm)].map(
      (match) => match[1]
    );
    expect(liveQrlVars).toEqual([...liveQrlVars].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it('stripEventHandlers: parent emits bare q_X for stripped handlers (no .w wrap)', () => {
    const input = `
import { component$, useStore } from '@qwik.dev/core';
export const Parent = component$(() => {
  const state = useStore({ text: '' });
  return <div shouldRemove$={() => state.text} onClick$={() => console.log(state)}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true,
      transpileJsx: true,
      entryStrategy: { type: 'inline' },
      stripEventHandlers: true,
    });
    const parent = findParent(result);
    expect(parent.code).toMatch(/shouldRemove\$: q_qrl_\d+,/);
    expect(parent.code).toMatch(/"q-e:click": q_qrl_\d+/);
    expect(parent.code).not.toMatch(/shouldRemove\$: q_qrl_\d+\.w\(/);
    expect(parent.code).not.toMatch(/"q-e:click": q_qrl_\d+\.w\(/);
  });

  it('stripEventHandlers: stripped event-handler segments have captures:false', () => {
    const input = `
import { component$, useStore } from '@qwik.dev/core';
export const Parent = component$(() => {
  const state = useStore({ text: '' });
  return <div shouldRemove$={() => state.text}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true,
      transpileJsx: true,
      entryStrategy: { type: 'inline' },
      stripEventHandlers: true,
    });
    const seg = findSegmentByCtx(result, 'shouldRemove$');
    if (seg.kind !== 'segment') {
      throw new Error('expected segment');
    }
    const meta = seg.segment as SegmentMetadataInternal;
    expect(meta.captures).toBe(false);
    expect(meta.captureNames).toBeUndefined();
  });

  it('stripCtxName-stripped segments PRESERVE capture metadata (negative-scope policy split)', () => {
    const input = `
import { component$, useClientMount$, useStore } from '@qwik.dev/core';
export const Parent = component$(() => {
  const state = useStore({ text: '' });
  useClientMount$(async () => { state.text = 'a'; });
  return <div/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true,
      transpileJsx: true,
      entryStrategy: { type: 'inline' },
      stripCtxName: ['useClientMount$'],
    });
    const seg = findSegmentByCtx(result, 'useClientMount$');
    if (seg.kind !== 'segment') {
      throw new Error('expected segment');
    }
    const meta = seg.segment as SegmentMetadataInternal;
    expect(meta.captures).toBe(true);
    expect(meta.captureNames).toEqual(['state']);
  });

  it('stripCtxName drops top-level module references from capture metadata', () => {
    const input = `
import { routeLoader$ } from '@qwik.dev/router';
export const LANGUAGE = 'en';
export const readLanguage = () => LANGUAGE;
export const useLanguage = routeLoader$(() => readLanguage());
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.ts'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true,
      transpileJsx: true,
      entryStrategy: { type: 'segment' },
      stripCtxName: ['routeLoader$'],
    });
    const parent = findParent(result);
    const seg = findSegmentByCtx(result, 'routeLoader$');
    if (seg.kind !== 'segment') {
      throw new Error('expected segment');
    }
    const meta = seg.segment as SegmentMetadataInternal;
    expect(meta.captures).toBe(false);
    expect(meta.captureNames).toBeUndefined();
    expect(parent.code).not.toMatch(/\.w\(\[(?:LANGUAGE|readLanguage)/);
  });

  it('non-stripped inline handlers still receive .w([captures]) when needed (negative scope)', () => {
    const input = `
import { component$, useStore } from '@qwik.dev/core';
export const Parent = component$(() => {
  const state = useStore({ text: '' });
  return <div onClick$={() => console.log(state)}/>;
});
`;
    const result = transformModule({
      input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(input) }],
      srcDir: mkFilePath('.'),
      transpileTs: true,
      transpileJsx: true,
      entryStrategy: { type: 'inline' },
    });
    const parent = findParent(result);
    expect(parent.code).toMatch(/q_\w+\.w\(\[\s*state\s*\]\)/);
  });
});
