import { describe, expect, test } from 'vitest';
import { transformModules } from '../transform-modules';

const compile = (code: string, decorator?: { legacy?: boolean; emitDecoratorMetadata?: boolean }) =>
  transformModules({
    srcDir: 'src',
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    isServer: false,
    decorator,
    input: [{ path: 'src/app.tsx', code }],
  }).then((output) => output.modules.map((module) => module.code).join('\n'));

const QWIK_MODULE = `import { component$ } from '@qwik.dev/core';
const Entity = (): ClassDecorator => (target) => target;
const Inject = (): ParameterDecorator => () => {};
export default component$(() => <button onClick$={() => {
  @Entity()
  class User {
    greet(@Inject() name: string) {
      return name;
    }
  }
  return new User().greet('hi');
}}>hi</button>);
`;

const FOREIGN_MODULE = `const Entity = (): ClassDecorator => (target) => target;
@Entity()
export class User {}
`;

describe('decorators', () => {
  test.each([
    ['a Qwik module', QWIK_MODULE],
    ['a foreign module', FOREIGN_MODULE],
  ])('lowers legacy decorators in %s', async (_name, code) => {
    const output = await compile(code, { legacy: true });
    expect(output).not.toContain('@Entity');
    expect(output).not.toContain('@Inject');
  });

  test.each([
    ['a Qwik module', QWIK_MODULE],
    ['a foreign module', FOREIGN_MODULE],
  ])('keeps standard decorators in %s', async (_name, code) => {
    expect(await compile(code)).toContain('@Entity()');
  });
});
