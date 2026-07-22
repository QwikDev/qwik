import { describe, it, expect } from 'vitest';
import { transformModule } from '../../../src/optimizer/transform/index.js';
import type { TransformModule } from '../../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

const INPUT = `
import { component$, useTask$, useSignal, $ } from '@qwik.dev/core';

const SETTINGS = { mode: 'mock' };

const useMockRouter = (props) => {
  const state = useSignal(SETTINGS.mode);
  const goto = props.goto ?? $(async () => { console.warn('no goto'); });
  useTask$(({ track }) => { track(state); });
  return goto;
};

export const Provider = component$((props) => {
  useMockRouter(props);
  return <div/>;
});

globalThis.__appMode = SETTINGS.mode;
`;

function run(mode: 'test' | 'dev' = 'test'): { parent: TransformModule; provider: TransformModule } {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(INPUT) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode,
    entryStrategy: { type: 'segment' },
    minify: 'none',
    explicitExtensions: false,
    sourceMaps: false,
    preserveFilenames: false,
  });
  const parent = result.modules[0];
  const provider = result.modules.find(
    (m) => m.kind === 'segment' && m.segment.ctxName === 'component$',
  );
  if (!provider) throw new Error('Provider component segment not found');
  return { parent, provider };
}

const CHILD_MOVE_INPUT = `
import { component$ } from '@qwik.dev/core';

const Widget = component$(() => <span>widget</span>);

export const Panel = component$(() => {
  return <div><Widget/></div>;
});
`;

function runChildMove(mode: 'test' | 'dev'): { parent: TransformModule; panel: TransformModule } {
  const result = transformModule({
    input: [{ path: mkFilePath('test.tsx'), code: mkSourceText(CHILD_MOVE_INPUT) }],
    srcDir: mkFilePath('.'),
    transpileTs: true,
    transpileJsx: true,
    mode,
    entryStrategy: { type: 'segment' },
    minify: 'none',
    explicitExtensions: false,
    sourceMaps: false,
    preserveFilenames: false,
  });
  const parent = result.modules[0];
  const panel = result.modules.find(
    (m) => m.kind === 'segment' && m.segment.name.startsWith('Panel_component'),
  );
  if (!panel) throw new Error('Panel component segment not found');
  return { parent, panel };
}

describe('moved-helper QRL binding ownership', () => {
  it('parent demotes every moved-helper QRL binding to a bare qrl() statement', () => {
    const { parent } = run();

    expect(parent.code).not.toMatch(/const q_useMockRouter_goto_\w+/);
    expect(parent.code).not.toMatch(/const q_useMockRouter_useTask_\w+/);

    const bareQrls = parent.code.match(/^qrl\(\(\)\s*=>\s*import\(/gm) ?? [];
    expect(bareQrls.length).toBe(2);

    expect(parent.code).not.toContain('const useMockRouter');
  });

  it('consuming segment owns the QRL declarations and their imports', () => {
    const { provider } = run();

    expect(provider.code).toContain('const useMockRouter');
    expect(provider.code).toMatch(/const q_useMockRouter_goto_\w+ = .*qrl\(\(\)\s*=>\s*import\(/);
    expect(provider.code).toMatch(/const q_useMockRouter_useTask_\w+ = .*qrl\(\(\)\s*=>\s*import\(/);
    expect(provider.code).toMatch(/import \{[^}]*\bqrl\b[^}]*\} from "@qwik\.dev\/core"/);
    expect(provider.code).toMatch(/import \{[^}]*\buseTaskQrl\b[^}]*\} from "@qwik\.dev\/core"/);
    expect(provider.code).toContain('useTaskQrl(q_useMockRouter_useTask_');
  });

  it('moved-decl dependency reexports via _auto_ on both sides (MIG-06)', () => {
    const { parent, provider } = run();

    expect(parent.code).toContain('export { SETTINGS as _auto_SETTINGS }');
    expect(provider.code).toContain('import { _auto_SETTINGS as SETTINGS }');
  });

  it('dev mode: moved non-marker helper QRL declarations use qrlDEV and import it', () => {
    const { parent, provider } = run('dev');

    expect(parent.code).not.toMatch(/^qrl\(\(\)\s*=>\s*import\(/m);
    expect(parent.code).not.toMatch(/[^.\w]qrl\(/);

    expect(provider.code).toMatch(/const q_useMockRouter_useTask_\w+ = .*qrlDEV\(/);
    expect(provider.code).toMatch(/import \{[^}]*\bqrlDEV\b[^}]*\} from "@qwik\.dev\/core"/);
    expect(provider.code).not.toMatch(/[^.\w]qrl\(/);
  });
});

describe('moved marker-decl QRL binding ownership (Widget → Panel)', () => {
  it('dev mode: parent and segment use qrlDEV; segment imports qrlDEV + componentQrl', () => {
    const { parent, panel } = runChildMove('dev');

    expect(parent.code).toMatch(/const q_Widget_component_\w+ = .*qrlDEV\(/);
    expect(parent.code).not.toMatch(/^qrl\(\(\)\s*=>\s*import\(/m);
    expect(parent.code).not.toMatch(/[^.\w]qrl\(/);

    expect(panel.code).toMatch(/const q_Widget_component_\w+ = .*qrlDEV\(/);
    expect(panel.code).toContain('const Widget = /*#__PURE__*/ componentQrl(q_Widget_component_');
    expect(panel.code).toMatch(/import \{[^}]*\bqrlDEV\b[^}]*\} from "@qwik\.dev\/core"/);
    expect(panel.code).toMatch(/import \{[^}]*\bcomponentQrl\b[^}]*\} from "@qwik\.dev\/core"/);
    expect(panel.code).not.toMatch(/[^.\w]qrl\(/);
  });

  it('prod mode: parent demotes to bare qrl(); segment imports qrl + componentQrl', () => {
    const { parent, panel } = runChildMove('test');

    expect(parent.code).toMatch(/^qrl\(\(\)\s*=>\s*import\(/m);

    expect(panel.code).toMatch(/const q_Widget_component_\w+ = .*qrl\(\(\)\s*=>\s*import\(/);
    expect(panel.code).toContain('const Widget = /*#__PURE__*/ componentQrl(q_Widget_component_');
    expect(panel.code).toMatch(/import \{[^}]*\bqrl\b[^}]*\} from "@qwik\.dev\/core"/);
    expect(panel.code).toMatch(/import \{[^}]*\bcomponentQrl\b[^}]*\} from "@qwik\.dev\/core"/);
  });
});
