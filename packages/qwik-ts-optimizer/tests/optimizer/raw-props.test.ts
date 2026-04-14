import { describe, expect, it } from 'vitest';
import {
  applyRawPropsTransform,
  consolidateRawPropsInWCalls,
  extractDestructuredFieldMap,
} from '../../src/optimizer/rewrite/raw-props.js';

describe('raw-props', () => {
  it('rewrites destructured params without reparsing the edited body', () => {
    const body = '({ count, label = getLabel() }) => ({ count, label, total: count + 1 })';

    const result = applyRawPropsTransform(body);

    expect(result).toBe(
      '(_rawProps) => ({ count: _rawProps.count, label: (_rawProps.label ?? getLabel()), total: _rawProps.count + 1 })',
    );
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
