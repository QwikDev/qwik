import { describe, expect, it } from 'vitest';
import { transformModule } from '../../../src/index.js';
import type { DecoratorOptions, EntryStrategy } from '../../../src/index.js';
import { mkFilePath, mkSourceText } from '../../../src/optimizer/types/brands.js';

const source = `import { component$ } from '@qwik.dev/core';
const Entity = (): ClassDecorator => (target) => target;
const Inject = (): ParameterDecorator => () => {};
@Entity()
export class Top {}
export default component$(() => {
  @Entity()
  class User {
    greet(@Inject() name: string) {
      return name;
    }
  }
  return <p>{new User().greet('hi')}</p>;
});
`;

function transform(entryStrategy: EntryStrategy, decorator?: DecoratorOptions) {
  const result = transformModule({
    input: [{ path: mkFilePath('m.tsx'), code: mkSourceText(source) }],
    srcDir: mkFilePath('.'),
    entryStrategy,
    transpileTs: true,
    transpileJsx: true,
    isServer: entryStrategy.type === 'hoist',
    decorator,
  });
  const parent = result.modules.find((m) => m.kind === 'parent')!.code;
  const segment = result.modules.find(
    (m) => m.kind === 'segment' && m.segment.ctxName === 'component$'
  )?.code;
  return { parent, segment };
}

describe('legacy decorators', () => {
  it('lowers decorators in segments and keeps what they reference', () => {
    const { parent, segment } = transform({ type: 'segment' }, { legacy: true });
    expect(parent).not.toContain('@Entity');
    expect(segment).not.toMatch(/@(Entity|Inject)/);
    expect(segment).toContain('_decorateParam(0, Inject())');
    expect(segment).toMatch(/const Inject =/);
  });

  it('lowers decorators in hoisted segments', () => {
    const { parent } = transform({ type: 'hoist' }, { legacy: true });
    expect(parent).not.toMatch(/@(Entity|Inject)/);
    expect(parent).toContain('_decorateParam(0, Inject())');
  });

  it('leaves decorators alone without the option', () => {
    const { parent } = transform({ type: 'hoist' });
    expect(parent).toContain('@Entity()');
  });
});
