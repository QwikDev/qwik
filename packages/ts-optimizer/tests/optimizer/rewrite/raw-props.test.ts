import { describe, expect, it } from 'vitest';
import {
  applyRawPropsTransform,
  consolidateRawPropsInWCalls,
  extractDestructuredFieldMap,
  extractDestructuredFieldDefaultsMap,
  extractDestructuredFieldInfo,
} from '../../../src/optimizer/rewrite/raw-props.js';

describe('raw-props', () => {
  it('rewrites destructured params without reparsing the edited body', () => {
    const body = '({ count, label = "x" }) => ({ count, label, total: count + 1 })';

    const result = applyRawPropsTransform(body);

    expect(result).toBe(
      '(_rawProps) => ({ count: _rawProps.count, label: _rawProps.label ?? "x", total: _rawProps.count + 1 })'
    );
  });

  it('aborts consolidation for call-expression default (parity gate)', () => {
    const body = '({ count, label = getLabel() }) => ({ count, label, total: count + 1 })';

    const result = applyRawPropsTransform(body);

    expect(result).toBe(body);
  });

  it('aborts consolidation for nested ObjectPattern field (parity gate)', () => {
    const body = '({ count, stuff: { hey } }) => ({ count, hey })';

    const result = applyRawPropsTransform(body);

    expect(result).toBe(body);
  });

  it('rewrites body-level destructuring and keeps the original param name', () => {
    const body = '(props) => {\n  const { count, ...rest } = props;\n  return { count, rest };\n}';

    const result = applyRawPropsTransform(body);

    expect(result).toBe(
      '(props) => {\nconst rest = _restProps(props, [\n    "count"\n]);\n  return { count: props.count, rest };\n}'
    );
  });

  it('preserves a body-destructure default as a nullish-coalescing fallback', () => {
    const body =
      '(props) => {\n  const { withDefault = true, plain, ...rest } = props;\n  return { withDefault, plain, rest };\n}';

    const result = applyRawPropsTransform(body);

    expect(result).toContain('withDefault: props.withDefault ?? true');
    expect(result).toContain('plain: props.plain');
    expect(result).not.toContain('withDefault: props.withDefault,');
  });

  it('rewrites a rest-destructure of a props-derived local (not the param)', () => {
    const body =
      '(rawProps) => {\n  const props = usePlayground(rawProps, "x");\n  const { value: givenValue, ...rest } = props;\n  return givenValue ?? rest;\n}';

    const result = applyRawPropsTransform(body);

    expect(result).toContain('const props = usePlayground(rawProps, "x");');
    expect(result).toMatch(/const rest = _restProps\(props, \[\s*"value"\s*\]\);/);
    expect(result).not.toMatch(/\{\s*value:\s*givenValue\s*,\s*\.\.\.rest\s*\}/);
    expect(result).toContain('return props.value ?? rest;');
    expect(result.indexOf('_restProps')).toBeGreaterThan(result.indexOf('usePlayground'));
  });

  it('rewrites rest-only destructuring in expression bodies', () => {
    const body = '({ ...rest }) => rest';

    const result = applyRawPropsTransform(body);

    expect(result).toBe('(_rawProps) => {\nconst rest = _restProps(_rawProps);\nreturn rest;\n}');
  });

  it('extracts destructured field names for the shared session path', () => {
    const result = extractDestructuredFieldMap(
      '({ foo, "bind:value": bindValue, bar = 1, ...rest }) => foo + bindValue + bar + rest.baz'
    );

    expect(result).toEqual(
      new Map([
        ['foo', 'foo'],
        ['bindValue', 'bind:value'],
        ['bar', 'bar'],
      ])
    );
  });

  it('consolidates raw props captures after the rewrite', () => {
    const result = consolidateRawPropsInWCalls(
      'qrl(() => 1).w([a, _rawProps.count, _rawProps.label, b])'
    );

    expect(result).toBe('qrl(() => 1).w([\n        a,\n        _rawProps,\n        b\n    ])');
  });

  it('consolidates raw props captures without splitting nested comma expressions', () => {
    const result = consolidateRawPropsInWCalls(
      'qrl(() => 1).w([useStore([a, b]), _rawProps.count, fn(x, y), _rawProps[dynamicKey]])'
    );

    expect(result).toBe(
      'qrl(() => 1).w([\n        useStore([a, b]),\n        _rawProps,\n        fn(x, y)\n    ])'
    );
  });

  it('consolidates computed-member-only captures (prefilter must not gate them out)', () => {
    const result = consolidateRawPropsInWCalls('qrl(() => 1).w([a, _rawProps[key]])');

    expect(result).toBe('qrl(() => 1).w([\n        a,\n        _rawProps\n    ])');
  });

  it('returns bodies the consolidation cannot touch verbatim (prefilter paths)', () => {
    const noRawProps = 'qrl(() => 1).w([a, b, c])';
    expect(consolidateRawPropsInWCalls(noRawProps)).toBe(noRawProps);
    const noWCall = '(x) => _rawProps.count + x';
    expect(consolidateRawPropsInWCalls(noWCall)).toBe(noWCall);
  });

  it('extracts field map and defaults map from one parse (combined extractor)', () => {
    const body =
      '({ foo, "bind:value": bindValue, bar = 1 + 2, baz }) => foo + bindValue + bar + baz';

    const info = extractDestructuredFieldInfo(body);

    expect(info.fieldMap).toEqual(
      new Map([
        ['foo', 'foo'],
        ['bindValue', 'bind:value'],
        ['bar', 'bar'],
        ['baz', 'baz'],
      ])
    );
    expect(info.fieldDefaults).toEqual(new Map([['bar', '1 + 2']]));

    expect(extractDestructuredFieldMap(body)).toEqual(info.fieldMap);
    expect(extractDestructuredFieldDefaultsMap(body)).toEqual(info.fieldDefaults);
  });

  it('combined extractor honors the all-or-nothing unsafe gate for both maps', () => {
    const info = extractDestructuredFieldInfo('({ count, label = getLabel() }) => count + label');

    expect(info.fieldMap.size).toBe(0);
    expect(info.fieldDefaults.size).toBe(0);
  });
});
