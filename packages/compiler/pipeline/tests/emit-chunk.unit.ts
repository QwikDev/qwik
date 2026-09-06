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
import { captureNames, createQrlResolver, functionText } from '../generate/emit-chunk';
import { sourceFunctionEmission } from '../generate/emit-function';
import { deepFreeze } from './fixtures';

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
  const resolveQrlUse = createQrlResolver(deepFreeze(moduleWith(qrl)));
  const resolved = resolveQrlUse(
    { qrl: qrl.id, args: [{ pass: ArgPass.Binding, binding: 1 }] },
    '_props'
  );
  expect(resolved.args).toEqual(['props']);
  const propsUse = { qrl: qrl.id, args: [{ pass: ArgPass.Props as const }] };
  expect(resolveQrlUse(propsUse, 'firstProps').args).toEqual(['firstProps']);
  expect(resolveQrlUse(propsUse, 'secondProps').args).toEqual(['secondProps']);
  expect(() => resolveQrlUse({ qrl: qrl.id, args: [] }, '_props')).toThrow(
    'capture arity mismatch'
  );
});

test('QRL resolvers stay local to a generation and reject missing symbols', () => {
  const first = qrlWith({ name: 'first' });
  const second = qrlWith({ name: 'second' });
  const resolveFirst = createQrlResolver(deepFreeze(moduleWith(first)));
  const resolveSecond = createQrlResolver(deepFreeze(moduleWith(second)));
  const use = { qrl: first.id, args: [] };
  expect(resolveFirst(use, 'props').qrl).toBe(first);
  expect(resolveSecond(use, 'props').qrl).toBe(second);
  expect(resolveFirst(use, 'props').qrl).toBe(first);
  expect(() => resolveFirst({ qrl: 'missing', args: [] }, 'props')).toThrow(
    'pipeline.generate: unknown qrl "missing"'
  );
});

test('QRL indexing preserves the first match for duplicate ids', () => {
  const first = qrlWith({ name: 'first' });
  const module = moduleWith(first);
  module.qrls.push(qrlWith({ name: 'second' }));
  const resolve = createQrlResolver(deepFreeze(module));
  expect(resolve({ qrl: first.id, args: [] }, 'props').qrl).toBe(first);
});

function emissionOf(qrl: LinkedQrl) {
  const module = moduleWith(qrl);
  return sourceFunctionEmission(module, qrl, createQrlResolver(module));
}

const textOf = (qrl: LinkedQrl) => functionText(emissionOf(qrl));

describe('sourceFunctionEmission', () => {
  test('a Function payload restores captures from the _captures prelude', () => {
    const qrl = qrlWith({ captures: [{ binding: 0, access: CaptureAccess.Direct }] });
    const emission = emissionOf(qrl);
    expect([...emission.imports]).toEqual(['_captures']);
    expect(functionText(emission)).toBe(
      '() => {\n  const [count] = _captures;\n  return count.value++;\n}'
    );
  });

  test('a capture-free Function payload has no prelude lines', () => {
    const qrl = qrlWith({});
    const emission = emissionOf(qrl);
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

  test('block bodies restore captures without adding a return expression', () => {
    const source = '{ if (count.value > 10) return; count.value++; }';
    const blockQrl = qrlWith({
      captures: [{ binding: 0, access: CaptureAccess.Direct }],
      origin: { ...qrlWith({}).origin, bodyKind: FnBodyKind.Block, bodyRange: [0, source.length] },
    });
    const module = moduleWith(blockQrl);
    module.source.code = source;
    const emission = sourceFunctionEmission(
      deepFreeze(module),
      blockQrl,
      createQrlResolver(module)
    );
    expect(functionText(emission)).toBe(
      '() => {\n  const [count] = _captures;\n  if (count.value > 10) return; count.value++;\n}'
    );
  });
});
