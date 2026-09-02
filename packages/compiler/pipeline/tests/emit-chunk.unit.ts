import { describe, expect, test } from 'vitest';
import {
  ArgPass,
  BindingScope,
  BoundaryKind,
  FnBodyKind,
  CaptureAccess,
  QrlBodyKind,
  QrlPayloadKind,
  VarKind,
  type LinkedModule,
  type LinkedQrl,
} from '../schema';
import {
  captureNames,
  functionText,
  resolveQrlUse,
  sourceFunctionEmission,
} from '../generate/emit-chunk';

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
    propsParts: [],
    captures: [],
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
  test('resolves capture bindings through the binding table in order', () => {
    const qrl = qrlWith({
      captures: [
        { binding: 1, access: CaptureAccess.ComponentProp },
        { binding: 0, access: CaptureAccess.Direct },
      ],
    });
    expect(captureNames(moduleWith(qrl), qrl)).toEqual(['props', 'count']);
  });
});

test('resolveQrlUse takes actuals from the use site', () => {
  const qrl = qrlWith({ captures: [{ binding: 0, access: CaptureAccess.Direct }] });
  const resolved = resolveQrlUse(
    moduleWith(qrl),
    { qrl: qrl.id, args: [{ pass: ArgPass.Binding, binding: 1 }] },
    '_props'
  );
  expect(resolved.args).toEqual(['props']);
  expect(() => resolveQrlUse(moduleWith(qrl), { qrl: qrl.id, args: [] }, '_props')).toThrow(
    'capture arity mismatch'
  );
});

const textOf = (qrl: LinkedQrl) => functionText(sourceFunctionEmission(moduleWith(qrl), qrl));

describe('sourceFunctionEmission', () => {
  test('a Function payload restores captures from the _captures prelude', () => {
    const qrl = qrlWith({ captures: [{ binding: 0, access: CaptureAccess.Direct }] });
    const emission = sourceFunctionEmission(moduleWith(qrl), qrl);
    expect([...emission.imports]).toEqual(['_captures']);
    expect(functionText(emission)).toBe(
      '() => {\n  const [count] = _captures;\n  return count.value++;\n}'
    );
  });

  test('a capture-free Function payload has no prelude lines', () => {
    const qrl = qrlWith({});
    const emission = sourceFunctionEmission(moduleWith(qrl), qrl);
    expect(emission.imports.size).toBe(0);
    expect(functionText(emission)).toBe('() => {\n  return count.value++;\n}');
  });

  test('a Value payload takes captures as parameters instead', () => {
    const qrl = qrlWith({
      payloadKind: QrlPayloadKind.Value,
      captures: [{ binding: 1, access: CaptureAccess.ComponentProp }],
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
    expect(textOf(qrl)).toBe('(props) => {\n  return props.title;\n}');
  });

  test('an authored-async body keeps its async head', () => {
    const qrl = qrlWith({ authoredAsync: true });
    expect(textOf(qrl)).toBe('async () => {\n  return count.value++;\n}');
  });

  test('block bodies refuse', () => {
    const blockQrl = qrlWith({
      origin: { ...qrlWith({}).origin, bodyKind: FnBodyKind.Block },
    });
    expect(() => textOf(blockQrl)).toThrow('a block QRL body');
  });
});
