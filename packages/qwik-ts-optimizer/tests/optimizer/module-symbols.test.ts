import { describe, expect, it } from 'vitest';
import { parseSync } from 'oxc-parser';
import { collectSameFileSymbolInfo } from '../../src/optimizer/utils/module-symbols.js';

describe('module-symbols', () => {
  it('collects top-level bindings, default exports, and renamed exports', () => {
    const program = parseSync(
      'module.ts',
      `
        export { localThing as aliasedThing };
        export default function DefaultThing() {}
        function localFn() {}
        class LocalClass {}
        const { alpha, beta: bravo } = source;
        enum LocalEnum { A }
      `,
    ).program;

    const info = collectSameFileSymbolInfo(program);

    expect(info.sameFileSymbols.has('aliasedThing')).toBe(true);
    expect(info.sameFileSymbols.has('localThing')).toBe(true);
    expect(info.sameFileSymbols.has('DefaultThing')).toBe(true);
    expect(info.sameFileSymbols.has('localFn')).toBe(true);
    expect(info.sameFileSymbols.has('LocalClass')).toBe(true);
    expect(info.sameFileSymbols.has('alpha')).toBe(true);
    expect(info.sameFileSymbols.has('bravo')).toBe(true);
    expect(info.sameFileSymbols.has('LocalEnum')).toBe(true);

    expect(info.defaultExportedNames.has('DefaultThing')).toBe(true);
    expect(info.renamedExports.get('localThing')).toBe('aliasedThing');
  });
});
