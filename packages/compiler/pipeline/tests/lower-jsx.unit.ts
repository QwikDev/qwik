import { describe, expect, test } from 'vitest';
import { parseModule } from '../analyse/ast/parse';
import { unwrapExpression } from '../analyse/ast/utils';
import { lowerJsx } from '../analyse/lower-jsx';
import { createTestLowerContext } from './fixtures';
import { foldStaticOp } from '../generate/fold-static';

function fold(jsx: string, escapeTextContent = false): string {
  const source = `const a = ${jsx};`;
  const parsed = parseModule('t.tsx', source);
  expect(parsed.errors).toEqual([]);
  const statement = parsed.program.body[0];
  if (statement.type !== 'VariableDeclaration') {
    throw new Error('expected a variable declaration');
  }
  const element = unwrapExpression(statement.declarations[0].init);
  if (element?.type !== 'JSXElement') {
    throw new Error('expected a JSX element');
  }
  const { ctx } = createTestLowerContext(parsed.program, source);
  return foldStaticOp(lowerJsx(element, ctx), escapeTextContent);
}

describe('JSX lowering + static folding', () => {
  test('element with text', () => {
    expect(fold('<p>Hello Qwik</p>')).toBe('<p>Hello Qwik</p>');
  });

  test('nested elements', () => {
    expect(fold('<section><h1>A</h1><p>x</p></section>')).toBe(
      '<section><h1>A</h1><p>x</p></section>'
    );
  });

  test('void tag drops the authored slash and has no closing tag', () => {
    expect(fold('<div>a<br/>b</div>')).toBe('<div>a<br>b</div>');
  });

  test('ssr fold keeps text raw; attribute values always escape', () => {
    expect(fold('<p title="A&B">A&B</p>')).toBe('<p title="A&amp;B">A&B</p>');
  });

  test('csr fold escapes text for template markup', () => {
    expect(fold('<p title="A&B">A&B</p>', true)).toBe('<p title="A&amp;B">A&amp;B</p>');
  });

  test('string, bare-boolean, and JSX-alias attributes', () => {
    expect(fold('<main className="shell" htmlFor="x" hidden></main>')).toBe(
      '<main class="shell" for="x" hidden></main>'
    );
  });

  test('aria attributes stringify boolean-like strings', () => {
    expect(fold('<main aria-hidden="false" draggable="false"></main>')).toBe(
      '<main aria-hidden="false" draggable="false"></main>'
    );
  });

  test('multi-line JSX text normalizes whitespace', () => {
    expect(fold('(<p>\n      one\n      two\n    </p>)')).toBe('<p>one two</p>');
  });

  test('comment children render nothing', () => {
    expect(fold('<p>{/* note */}x</p>')).toBe('<p>x</p>');
  });

  test('rejects dynamic children, dynamic attributes, spreads, component tags, void children', () => {
    // A dynamic child now lowers to a hole op; only the static FOLD refuses it.
    expect(() => fold('<p>{value}</p>')).toThrow('folding the op "hole"');
    expect(() => fold('<p title={value}></p>')).toThrow('folding the non-static prop "dynamic"');
    expect(() => fold('<p {...rest}></p>')).toThrow('a JSX spread attribute');
    expect(() => fold('<Foo></Foo>')).toThrow('a non-native JSX tag');
    expect(() => fold('<br>x</br>')).toThrow('The void element <br> cannot have children.');
  });
});
