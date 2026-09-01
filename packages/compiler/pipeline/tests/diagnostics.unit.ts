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
    const code = `type Props = { label: string };
export default (props: Props) => {
  return <p><br>x</br>{props.label}</p>;
};
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
    expect(highlight).toMatchObject({ startLine: 3 });
    expect(code.slice(highlight!.lo, highlight!.hi)).toBe('<br>x</br>');
  });

  test('keeps UnsupportedError as an implementation failure', async () => {
    await expect(
      transformModules(
        options(`export default () => {
  return <button onClick$={() => { console.log(1); }}>go</button>;
};
`)
      )
    ).rejects.toThrow('pipeline does not support: a block-bodied event handler');
  });
});
