import { describe, expect, test } from 'vitest';
import type { TransformModule } from '@qwik.dev/optimizer';
import { createSsrPlanCollector, findRenderEntry } from './ssr-plan';

const planModule = (path: string, components: { name: string }[]): TransformModule =>
  ({
    path: `${path}.plan.json`,
    code: JSON.stringify({
      format: 'qwik/module-plan',
      version: 0,
      path,
      components: components.map((component) => ({
        name: component.name,
        binding: null,
        propsBindings: [],
        ssr: null,
        setup: [],
        render: [],
        needsId: false,
        idBase: 'q-',
        styleScope: null,
        providesContext: false,
        hasCustomHook: false,
      })),
      segments: [],
      imports: [],
      contexts: [],
    }),
    isEntry: false,
    map: null,
    segment: null,
    origPath: null,
  }) as TransformModule;

const jsModule = (path: string): TransformModule =>
  ({ path, code: '', isEntry: false, map: null, segment: null, origPath: null }) as TransformModule;

describe('ssr plan collector', () => {
  test('collect strips plan modules and keeps the rest', () => {
    const collector = createSsrPlanCollector();
    const remaining = collector.collect([
      jsModule('src/root.tsx'),
      planModule('src/root.tsx', [{ name: 'Root' }]),
    ]);
    expect(remaining.map((mod) => mod.path)).toEqual(['src/root.tsx']);
    expect(collector.size()).toBe(1);
  });

  test('links with the Root component as the entry', () => {
    const collector = createSsrPlanCollector();
    collector.collect([
      planModule('src/components/card.tsx', [{ name: 'Card' }]),
      planModule('src/root.tsx', [{ name: 'Root' }]),
    ]);
    const linked = collector.link();
    expect(linked?.entry).toBe('src/root.tsx#Root');
    expect(linked?.plan.components.map((component) => component.name)).toEqual(['Card', 'Root']);
    expect(linked?.plan.components[linked.plan.entry].name).toBe('Root');
  });

  test('falls back to a default export in a root module', () => {
    expect(
      findRenderEntry([JSON.parse(planModule('src/root.tsx', [{ name: 'default' }]).code)])
    ).toEqual({ path: 'src/root.tsx', component: 'default' });
    expect(findRenderEntry([JSON.parse(planModule('src/other.tsx', [{ name: 'A' }]).code)])).toBe(
      null
    );
  });
});
