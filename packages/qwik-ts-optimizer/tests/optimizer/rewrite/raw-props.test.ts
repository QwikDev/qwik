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
    // Const-default (literal) — consolidation fires per SWC's `is_const_expr` gate.
    // Call-default (e.g. `label = getLabel()`) aborts consolidation; that case
    // is now covered by 'aborts consolidation for call-expression default' below.
    //
    // `label: <accessor>` lands in `Property` value position, which
    // is precedence-safe for the `??` operator — no defensive parens needed.
    // `count + 1` is a non-defaulted reference (no `??` clause at all) so
    // it's just `_rawProps.count + 1` — also no parens. Pre-fix this emitted
    // `label: (_rawProps.label ?? "x")` unconditionally; the new output is
    // bare and matches SWC's emit.
    const body = '({ count, label = "x" }) => ({ count, label, total: count + 1 })';

    const result = applyRawPropsTransform(body);

    expect(result).toBe(
      '(_rawProps) => ({ count: _rawProps.count, label: _rawProps.label ?? "x", total: _rawProps.count + 1 })',
    );
  });

  it('aborts consolidation for call-expression default (parity gate)', () => {
    // Matches SWC's `transform_pat` `skip = true` arm
    // (`swc-reference-only/props_destructuring.rs:389-391`): when an
    // AssignmentPattern default contains a CallExpression the destructure
    // is preserved verbatim instead of being rewritten to `_rawProps.<key>`.
    const body = '({ count, label = getLabel() }) => ({ count, label, total: count + 1 })';

    const result = applyRawPropsTransform(body);

    // No consolidation — source returned unchanged.
    expect(result).toBe(body);
  });

  it('aborts consolidation for nested ObjectPattern field (parity gate)', () => {
    // Matches SWC's `transform_pat` skip arm for KeyValue with a nested
    // ObjectPattern value (`swc-reference-only/props_destructuring.rs:456-458`).
    const body = '({ count, stuff: { hey } }) => ({ count, hey })';

    const result = applyRawPropsTransform(body);

    // No consolidation — source returned unchanged.
    expect(result).toBe(body);
  });

  it('rewrites body-level destructuring and keeps the original param name', () => {
    const body = '(props) => {\n  const { count, ...rest } = props;\n  return { count, rest };\n}';

    const result = applyRawPropsTransform(body);

    expect(result).toBe(
      '(props) => {\nconst rest = _restProps(props, [\n    "count"\n]);\n  return { count: props.count, rest };\n}',
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

    expect(result).toBe(
      '(_rawProps) => {\nconst rest = _restProps(_rawProps);\nreturn rest;\n}',
    );
  });

  it('extracts destructured field names for the shared session path', () => {
    const result = extractDestructuredFieldMap(
      '({ foo, "bind:value": bindValue, bar = 1, ...rest }) => foo + bindValue + bar + rest.baz',
    );

    expect(result).toEqual(
      new Map([
        ['foo', 'foo'],
        ['bindValue', 'bind:value'],
        ['bar', 'bar'],
      ]),
    );
  });

  it('consolidates raw props captures after the rewrite', () => {
    const result = consolidateRawPropsInWCalls(
      'qrl(() => 1).w([a, _rawProps.count, _rawProps.label, b])',
    );

    expect(result).toBe('qrl(() => 1).w([\n        a,\n        _rawProps,\n        b\n    ])');
  });

  it('consolidates raw props captures without splitting nested comma expressions', () => {
    const result = consolidateRawPropsInWCalls(
      'qrl(() => 1).w([useStore([a, b]), _rawProps.count, fn(x, y), _rawProps[dynamicKey]])',
    );

    expect(result).toBe(
      'qrl(() => 1).w([\n        useStore([a, b]),\n        _rawProps,\n        fn(x, y)\n    ])',
    );
  });

  it('consolidates computed-member-only captures (prefilter must not gate them out)', () => {
    // `_rawProps[key]` has no `_rawProps.` substring — the textual
    // prefilter must use the bare token or this regresses silently.
    const result = consolidateRawPropsInWCalls(
      'qrl(() => 1).w([a, _rawProps[key]])',
    );

    expect(result).toBe('qrl(() => 1).w([\n        a,\n        _rawProps\n    ])');
  });

  it('returns bodies the consolidation cannot touch verbatim (prefilter paths)', () => {
    // No `_rawProps` at all.
    const noRawProps = 'qrl(() => 1).w([a, b, c])';
    expect(consolidateRawPropsInWCalls(noRawProps)).toBe(noRawProps);
    // `_rawProps` referenced but no `.w(` call.
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
      ]),
    );
    expect(info.fieldDefaults).toEqual(new Map([['bar', '1 + 2']]));

    // The thin wrappers project the same single-parse result.
    expect(extractDestructuredFieldMap(body)).toEqual(info.fieldMap);
    expect(extractDestructuredFieldDefaultsMap(body)).toEqual(info.fieldDefaults);
  });

  it('combined extractor honors the all-or-nothing unsafe gate for both maps', () => {
    const info = extractDestructuredFieldInfo(
      '({ count, label = getLabel() }) => count + label',
    );

    expect(info.fieldMap.size).toBe(0);
    expect(info.fieldDefaults.size).toBe(0);
  });
});
