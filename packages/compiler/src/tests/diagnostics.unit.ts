import { describe, expect, test } from 'vitest';
import { transformModules } from '../index';

const options = (code: string) => ({
  input: [{ path: 'src/component.tsx', code }],
  srcDir: 'src',
  sourceMaps: false,
  transpileTs: true,
  transpileJsx: true,
  isServer: true,
});

describe('pipeline diagnostic boundary', () => {
  test('returns authored user diagnostics through the optimizer contract', async () => {
    const code = `import { component$ } from '@qwik.dev/core';
type Props = { label: string };
export default component$((props: Props) => {
  return <p><br>x</br>{props.label}</p>;
});
`;
    const output = await transformModules(options(code));

    expect(output.modules).toHaveLength(1);
    expect(output.modules[0]).toMatchObject({ path: 'src/component.tsx', code: '' });
    expect(output.diagnostics).toHaveLength(1);
    expect(output.diagnostics[0]).toMatchObject({
      scope: 'compiler',
      category: 'error',
      code: 'invalid-void-children',
      file: 'src/component.tsx',
      message: 'The void element <br> cannot have children.',
      suggestions: null,
    });
    const highlight = output.diagnostics[0].highlights?.[0];
    expect(highlight).toMatchObject({ startLine: 4 });
    expect(code.slice(highlight!.lo, highlight!.hi)).toBe('<br>x</br>');
  });

  test('keeps UnsupportedError as an implementation failure', async () => {
    await expect(
      transformModules(
        options(`import { component$, Slot } from '@qwik.dev/core';
export default component$((props: { name: string }) => {
  return <div><Slot {...props} /></div>;
});
`)
      )
    ).rejects.toThrow('pipeline does not support: Slot attributes');
  });
});
