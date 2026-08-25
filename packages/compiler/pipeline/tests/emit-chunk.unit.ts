import { describe, expect, test } from 'vitest';
import {
  BindingScope,
  BoundaryKind,
  FnBodyKind,
  FormalAccess,
  QrlBodyKind,
  QrlPayloadKind,
  VarKind,
  type LinkedModule,
  type LinkedQrl,
} from '../schema';
import { captureNames, chunkFunctionText } from '../generate/emit-chunk';

// `() => count.value++` at 10..30 with the body at 16..30; `(props) => props.title` variant below.
const SOURCE = '/*head*/ (() => count.value++); ((props) => props.title);';

function moduleWith(qrl: LinkedQrl): LinkedModule {
  return {
    path: 'src/component.tsx',
    source: { code: SOURCE, originalPath: 'src/component.tsx', normalizationMap: null },
    bindings: [
      {
        id: 0,
        name: 'count',
        scope: BindingScope.Local,
        varKind: VarKind.Const,
        declarationRange: null,
      },
      { id: 1, name: 'props', scope: BindingScope.Param, varKind: null, declarationRange: null },
    ],
    qrls: [qrl],
  } as LinkedModule;
}

function qrlWith(overrides: Partial<LinkedQrl>): LinkedQrl {
  return {
    id: 'segment_0',
    parent: null,
    name: 'sym',
    ctxName: 'onClick$',
    boundary: { kind: BoundaryKind.Implicit, role: 'event' },
    markerAttributes: [],
    payloadKind: QrlPayloadKind.Function,
    authoredAsync: false,
    body: { b: QrlBodyKind.Js, payload: 0 },
    formals: [],
    params: { authored: 0, used: [], sources: [] },
    origin: {
      range: [10, 30],
      functionRange: [10, 30],
      calleeRange: null,
      argumentRanges: [],
      paramRanges: [],
      bodyRange: [16, 29],
      bodyKind: FnBodyKind.Expression,
    },
    ...overrides,
  } as LinkedQrl;
}

describe('captureNames', () => {
  test('resolves formal bindings through the binding table in order', () => {
    const qrl = qrlWith({
      formals: [
        { binding: 1, access: FormalAccess.ComponentProp },
        { binding: 0, access: FormalAccess.Direct },
      ],
    });
    expect(captureNames(moduleWith(qrl), qrl)).toEqual(['props', 'count']);
  });
});

describe('chunkFunctionText', () => {
  test('a Function payload restores captures from the _captures prelude', () => {
    const qrl = qrlWith({ formals: [{ binding: 0, access: FormalAccess.Direct }] });
    expect(chunkFunctionText(moduleWith(qrl), qrl)).toBe(
      '() => {\n  const count = _captures[0];\n  return count.value++;\n}'
    );
  });

  test('a capture-free Function payload has no prelude lines', () => {
    const qrl = qrlWith({});
    expect(chunkFunctionText(moduleWith(qrl), qrl)).toBe('() => {\n  return count.value++;\n}');
  });

  test('a Value payload takes captures as parameters instead', () => {
    const qrl = qrlWith({
      payloadKind: QrlPayloadKind.Value,
      formals: [{ binding: 1, access: FormalAccess.ComponentProp }],
      origin: {
        range: [33, 56],
        functionRange: [33, 56],
        calleeRange: null,
        argumentRanges: [],
        paramRanges: [[34, 39]],
        bodyRange: [44, 55],
        bodyKind: FnBodyKind.Expression,
      },
    });
    expect(chunkFunctionText(moduleWith(qrl), qrl)).toBe('(props) => {\n  return props.title;\n}');
  });

  test('an authored-async body keeps its async head', () => {
    const qrl = qrlWith({ authoredAsync: true });
    expect(chunkFunctionText(moduleWith(qrl), qrl)).toBe(
      'async () => {\n  return count.value++;\n}'
    );
  });

  test('block bodies and program bodies refuse', () => {
    const blockQrl = qrlWith({
      origin: { ...qrlWith({}).origin, bodyKind: FnBodyKind.Block },
    });
    expect(() => chunkFunctionText(moduleWith(blockQrl), blockQrl)).toThrow('a block QRL body');
    const programQrl = qrlWith({ body: { b: QrlBodyKind.Program, program: 0 } });
    expect(() => chunkFunctionText(moduleWith(programQrl), programQrl)).toThrow(
      'a program/task QRL body'
    );
  });
});
