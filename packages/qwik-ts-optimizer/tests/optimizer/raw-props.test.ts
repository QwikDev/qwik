import { describe, expect, it } from 'vitest';
import {
  applyRawPropsTransform,
  consolidateRawPropsInWCalls,
  extractDestructuredFieldMap,
} from '../../src/optimizer/rewrite/raw-props.js';

describe('raw-props', () => {
  it('rewrites destructured params without reparsing the edited body', () => {
    // Const-default (literal) — consolidation fires per SWC's `is_const_expr` gate.
    // Call-default (e.g. `label = getLabel()`) aborts consolidation; that case
    // is now covered by 'aborts consolidation for call-expression default' below.
    const body = '({ count, label = "x" }) => ({ count, label, total: count + 1 })';

    const result = applyRawPropsTransform(body);

    expect(result).toBe(
      '(_rawProps) => ({ count: _rawProps.count, label: (_rawProps.label ?? "x"), total: _rawProps.count + 1 })',
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
});
