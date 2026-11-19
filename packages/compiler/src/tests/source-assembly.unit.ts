import MagicString, {
  SourceMap as MagicStringSourceMap,
  type SourceMapSegment,
} from 'magic-string';
import { SourceMap as NodeSourceMap } from 'node:module';
import type { SourceMap } from 'oxc-transform';
import { describe, expect, test, vi } from 'vitest';
import { createGeneratedModuleAssembler } from '../generate/source-assembly';
import { sourceRelativeToMap } from '../source-maps';
import type { Range } from '../schema';

const nodeSourceMaps = vi.hoisted(() => ({ created: 0 }));

vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  class CountedSourceMap extends actual.SourceMap {
    constructor(...args: ConstructorParameters<typeof actual.SourceMap>) {
      super(...args);
      nodeSourceMaps.created++;
    }
  }
  return { ...actual, SourceMap: CountedSourceMap };
});

const source = `const a = 1;\nexport const b = () => {\n  return a;\n};\n`;
const normalizedMap: SourceMap = {
  version: 3,
  file: 'src/app.js',
  sources: ['src/app.tsx'],
  sourcesContent: [`const a: number = 1;\nexport const b = () => {\n  return a;\n};\n`],
  names: [],
  mappings: 'AAAA,MAAM,CAAC,GAAW;AAClB;AACA;AACA',
};

/** The pre-change path: magic-string over the whole module, then a JSON round trip. */
function referenceChunkMap(
  code: string,
  anchor: Range,
  outputPath: string,
  normalized: SourceMap | null
): string {
  const magic = new MagicString(source, { filename: 'src/app.tsx' });
  const [start, end] = anchor;
  if (start > 0) {
    magic.remove(0, start);
  }
  magic.overwrite(start, end, code);
  if (end < source.length) {
    magic.remove(end, source.length);
  }
  const emitted = magic.generateDecodedMap({
    file: outputPath,
    source: 'src/app.tsx',
    includeContent: true,
    hires: true,
  });
  let map = new MagicStringSourceMap(emitted);
  if (normalized !== null) {
    const trace = new NodeSourceMap({ ...normalized, file: '', sourceRoot: '' });
    map = new MagicStringSourceMap({
      ...emitted,
      mappings: emitted.mappings.map((line) =>
        line.map((segment): SourceMapSegment => {
          if (segment.length === 1) {
            return segment;
          }
          const original = trace.findEntry(segment[2], segment[3]);
          return 'originalLine' in original
            ? [segment[0], 0, original.originalLine, original.originalColumn]
            : [segment[0]];
        })
      ),
      names: [],
      sources: normalized.sources,
      sourcesContent: normalized.sourcesContent,
    });
  }
  const json = JSON.parse(map.toString());
  json.file = outputPath;
  if (json.sources.length === 1) {
    json.sources[0] = sourceRelativeToMap(outputPath, 'src/app.tsx');
  }
  return JSON.stringify(json);
}

describe('generated chunk source maps', () => {
  const anchor: Range = [source.indexOf('()'), source.lastIndexOf('}') + 1];
  const chunkCodes = ['', 'x', '\n', 'a\nb', 'a\n', 'a\n\nb\n', 'export const s = () => {\n};'];

  test.each([
    ['without', null],
    ['with', normalizedMap],
  ] as const)('match the whole-module magic-string map %s a normalization map', (_, normalized) => {
    const assembleChunk = createGeneratedModuleAssembler(source, 'src/app.tsx', true, normalized);
    for (const code of chunkCodes) {
      const chunk = assembleChunk('src/app.tsx_s.js', code, anchor);
      expect(chunk.code).toBe(code);
      expect(chunk.map, JSON.stringify(code)).toBe(
        referenceChunkMap(code, anchor, 'src/app.tsx_s.js', normalized)
      );
    }
  });

  test('parse the normalization map once per module, not once per chunk', () => {
    const before = nodeSourceMaps.created;
    const assembleChunk = createGeneratedModuleAssembler(
      source,
      'src/app.tsx',
      true,
      normalizedMap
    );
    for (let index = 0; index < 20; index++) {
      assembleChunk(`src/app.tsx_s${index}.js`, `export const s${index} = 1;`, anchor);
    }
    expect(nodeSourceMaps.created - before).toBe(1);
  });
});
