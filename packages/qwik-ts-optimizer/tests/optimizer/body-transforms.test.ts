import { describe, expect, it } from 'vitest';
import {
  applySelfRefIndirection,
  injectCapturesUnpacking,
  rewriteFunctionSignature,
} from '../../src/optimizer/segment-codegen/body-transforms.js';

describe('body-transforms', () => {
  describe('rewriteFunctionSignature', () => {
    it('rewrites single-param arrow signatures through the shared function session', () => {
      expect(rewriteFunctionSignature('value => value + 1', ['props', 'state'])).toBe(
        '(props, state) => value + 1',
      );
    });

    it('rewrites zero-param arrow signatures without reparsing edited output', () => {
      expect(rewriteFunctionSignature('() => 1', ['props'])).toBe('(props) => 1');
    });

    it('rewrites function expression signatures through AST positions', () => {
      expect(rewriteFunctionSignature('function named() { return 1; }', ['props', 'key'])).toBe(
        'function named(props, key) { return 1; }',
      );
    });
  });

  describe('injectCapturesUnpacking', () => {
    it('injects captures into block bodies via the shared function session', () => {
      expect(injectCapturesUnpacking('(props) => {\n  return props.count;\n}', ['count'])).toBe(
        '(props) => {\nconst count = _captures[0];\n  return props.count;\n}',
      );
    });

    it('converts expression bodies to block bodies when injecting captures', () => {
      expect(injectCapturesUnpacking('(props) => props.count + 1', ['count', 'label'])).toBe(
        '(props) => {\nconst count = _captures[0], label = _captures[1];\nreturn props.count + 1;\n}',
      );
    });
  });

  describe('applySelfRefIndirection', () => {
    it('rewrites self-referential const declarators', () => {
      const output = applySelfRefIndirection('() => {\n  const x = call(q_abc.w([x]));\n  return x;\n}');
      const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
      expect(normalize(output)).toBe(normalize(`() => {
        const _ref = {};
        _ref.x = call(q_abc.w([_ref.x]));
        const { x } = _ref;
        return x;
      }`));
    });

    it('does not rewrite non-const self-referential declarators', () => {
      expect(applySelfRefIndirection('() => {\n  let x = call(q_abc.w([x]));\n  return x;\n}')).toBe(
        '() => {\n  let x = call(q_abc.w([x]));\n  return x;\n}',
      );
    });
  });
});
