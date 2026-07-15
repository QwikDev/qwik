import { describe, expect, it } from 'vitest';
import { assembleGeneratedModule, assembleModule } from './module-assembly';

describe('assembleModule', () => {
  it('preserves untouched module content and applies range edits', () => {
    const source = `'use strict';\n// keep\nexport const value = 1;\n`;
    const start = source.indexOf('1');
    const result = assembleModule(
      source,
      '/src/input.tsx',
      '/src/input.js',
      [{ range: [start, start + 1], value: '2' }],
      false,
      null
    );

    expect(result).toEqual({
      code: `'use strict';\n// keep\nexport const value = 2;\n`,
      map: null,
    });
  });

  it('emits a map only when requested', () => {
    const source = 'export const value = 1;\n';
    const result = assembleModule(source, '/src/input.tsx', '/src/input.js', [], true, null);
    const map = JSON.parse(result.map!);

    expect(map.file).toBe('/src/input.js');
    expect(map.sources).toEqual(['/src/input.tsx']);
    expect(map.sourcesContent).toEqual([source]);
  });

  it('composes the emitted map with the normalization map', () => {
    const normalized = 'export const value = 1;\n';
    const original = 'export const value: number = 1;\n';
    const normalizationMap = {
      version: 3,
      file: '/src/input.tsx',
      names: [],
      sources: ['/src/input.tsx'],
      sourcesContent: [original],
      mappings:
        'AAAA,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC,CAAS,CAAC,CAAC,CAAC,CAAC,CAAC,CAAC',
    };
    const result = assembleModule(
      normalized,
      '/src/input.tsx',
      '/src/input.js',
      [],
      true,
      normalizationMap
    );
    const map = JSON.parse(result.map!);

    expect(map.file).toBe('/src/input.js');
    expect(map.sources).toEqual(['/src/input.tsx']);
    expect(map.sourcesContent).toEqual([original]);
  });

  it('anchors a generated entry to its originating range', () => {
    const source = `const before = 1;\nexport function App() { return <div />; }\nconst after = 2;\n`;
    const start = source.indexOf('function App');
    const end = source.indexOf('\nconst after');
    const result = assembleGeneratedModule(
      source,
      '/src/input.tsx',
      '/src/input.tsx_App.js',
      'export function App() { return "compiled"; }\n',
      [start, end],
      true,
      null
    );

    expect(result.code).toBe('export function App() { return "compiled"; }\n');
    expect(JSON.parse(result.map!).sourcesContent).toEqual([source]);
  });
});
