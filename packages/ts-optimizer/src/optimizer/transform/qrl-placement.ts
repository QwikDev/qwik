import MagicString from 'magic-string';
import { walk } from 'oxc-walker';
import type { AstNode, AstProgram } from '../../ast-types.js';
import { isNonReferenceIdentifier } from '../analysis/variable-migration.js';

const QRL_FACTORIES = new Set([
  'qrl',
  'qrlDEV',
  '_noopQrl',
  '_noopQrlDEV',
  '_qrlWithChunk',
  '_qrlWithChunkDEV',
]);

/** Local names the module imports the QRL factories under. */
function qrlFactoryNames(statements: AstNode[]): Set<string> {
  const names = new Set<string>();
  for (const statement of statements) {
    if (statement.type !== 'ImportDeclaration' || statement.source.value !== '@qwik.dev/core') {
      continue;
    }
    for (const specifier of statement.specifiers ?? []) {
      const imported = specifier.type === 'ImportSpecifier' ? specifier.imported : undefined;
      const importedName: string | undefined =
        imported?.type === 'Identifier' ? imported.name : imported?.value;
      if (importedName && QRL_FACTORIES.has(importedName)) {
        names.add(specifier.local.name);
      }
    }
  }
  return names;
}

/**
 * Whether `expression` creates a QRL without running other code: a factory call with
 * side-effect-free arguments, possibly chained with the optimizer's own `.m()` or `.w([...])`.
 */
function isQrlCreation(expression: AstNode | null | undefined, factories: Set<string>): boolean {
  let current = expression ? withoutParens(expression) : undefined;
  while (current?.type === 'CallExpression') {
    if (!current.arguments.every(isSideEffectFree)) {
      return false;
    }
    const callee = withoutParens(current.callee);
    if (callee.type === 'Identifier') {
      return factories.has(callee.name);
    }
    const isOptimizerMethod =
      callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.property.type === 'Identifier' &&
      (callee.property.name === 'm' || callee.property.name === 'w');
    if (!isOptimizerMethod) {
      return false;
    }
    current = withoutParens(callee.object);
  }
  return false;
}

/** Rust's emitter drops parentheses before placement; match it. */
const withoutParens = (node: AstNode): AstNode =>
  node.type === 'ParenthesizedExpression' ? withoutParens(node.expression) : node;

/** A factory call like `qrl(() => import('./a'), 'a')` that runs no code, with nothing chained. */
function isPlainQrlCall(expression: AstNode, factories: Set<string>): boolean {
  const call = withoutParens(expression);
  return (
    call.type === 'CallExpression' &&
    withoutParens(call.callee).type === 'Identifier' &&
    isQrlCreation(call, factories)
  );
}

function isSideEffectFree(node: AstNode | null): boolean {
  if (node === null) {
    return true;
  }
  const expression = withoutParens(node);
  switch (expression.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'Literal':
    case 'Identifier':
      return true;
    case 'TemplateLiteral':
      return expression.expressions.length === 0;
    case 'ArrayExpression':
      return expression.elements.every(isSideEffectFree);
    case 'ObjectExpression':
      return expression.properties.every(
        (property: AstNode) =>
          property.type === 'Property' &&
          property.kind === 'init' &&
          !property.method &&
          !property.computed &&
          isSideEffectFree(property.value)
      );
    default:
      return false;
  }
}

/** The QRL a top-level `const q_x = qrl(...)` declares. */
function declaredQrlName(statement: AstNode, factories: Set<string>): string | undefined {
  if (statement.type !== 'VariableDeclaration' || statement.declarations.length !== 1) {
    return undefined;
  }
  const { id, init } = statement.declarations[0];
  return id.type === 'Identifier' && isQrlCreation(init, factories) ? id.name : undefined;
}

/** The QRL a top-level `q_x.s(...)` call sets. */
function setQrlName(statement: AstNode, qrlNames: Set<string>): string | undefined {
  const call = statement.type === 'ExpressionStatement' ? statement.expression : undefined;
  const callee = call?.type === 'CallExpression' ? call.callee : undefined;
  if (callee?.type !== 'MemberExpression' || callee.computed) {
    return undefined;
  }
  const isSetCall = callee.property.type === 'Identifier' && callee.property.name === 's';
  return isSetCall && callee.object.type === 'Identifier' && qrlNames.has(callee.object.name)
    ? callee.object.name
    : undefined;
}

/** A hoisted `function` declaration's name: it runs where it is called, not where it is written. */
function hoistedFunctionName(statement: AstNode): string | undefined {
  const declaration =
    statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
      ? statement.declaration
      : statement;
  if (declaration?.type !== 'FunctionDeclaration') {
    return undefined;
  }
  // Anonymous: no local code can call it, but importers can, like any export.
  return (
    declaration.id?.name ?? (statement.type === 'ExportDefaultDeclaration' ? 'default' : undefined)
  );
}

/** Local names the module exports: importers may call them at any time. */
function exportedNames(statements: AstNode[]): string[] {
  return statements.flatMap((statement) => {
    if (statement.type === 'ExportNamedDeclaration' && !statement.source) {
      const declared = hoistedFunctionName(statement);
      const locals = statement.specifiers.flatMap((specifier) =>
        specifier.local.type === 'Identifier' ? [specifier.local.name] : []
      );
      return declared ? [declared, ...locals] : locals;
    }
    if (statement.type === 'ExportDefaultDeclaration') {
      const declaration = statement.declaration;
      const name =
        declaration?.type === 'Identifier' ? declaration.name : hoistedFunctionName(statement);
      return name ? [name] : [];
    }
    return [];
  });
}

function referencedNames(statement: AstNode): Set<string> {
  const names = new Set<string>();
  walk(statement, {
    enter(node: AstNode, parent: AstNode | null) {
      if (node.type === 'Identifier' && !isNonReferenceIdentifier(node, parent)) {
        names.add(node.name);
      }
    },
  });
  return names;
}

/**
 * Moves each QRL declaration and its `.s()` call down to just before the first statement using the
 * QRL, keeping their order, so the QRL is created where the source created it. A use inside a
 * hoisted function counts where that function is used, or from the start if the module exports it.
 * QRLs nothing uses go to the end.
 */
export function declareQrlsBeforeFirstUse(code: string, program: AstProgram): string {
  const statements = program.body as AstNode[];
  const factories = qrlFactoryNames(statements);
  if (factories.size === 0) {
    return code;
  }
  const declared = statements.map((statement) => declaredQrlName(statement, factories));
  const qrlNames = new Set(declared.filter((name) => name !== undefined));
  const qrlStatementNames = statements.map(
    (statement, index) => declared[index] ?? setQrlName(statement, qrlNames)
  );
  const isUnusedQrl = statements.map(
    (statement) =>
      statement.type === 'ExpressionStatement' && isPlainQrlCall(statement.expression, factories)
  );

  const functionNames = statements.map(hoistedFunctionName);

  // What each QRL and hoisted function needs, counted where it is used.
  const deferredRefs = new Map<string, Set<string>>();
  statements.forEach((statement, index) => {
    const name = qrlStatementNames[index] ?? functionNames[index];
    if (!name) {
      return;
    }
    const refs = deferredRefs.get(name) ?? new Set<string>();
    for (const ref of referencedNames(statement)) {
      if (ref !== name) {
        refs.add(ref);
      }
    }
    deferredRefs.set(name, refs);
  });

  const firstUse = new Map<string, number>();
  const markUsed = (used: string[], index: number) => {
    while (used.length > 0) {
      const name = used.pop()!;
      const refs = deferredRefs.get(name);
      if (refs && !firstUse.has(name)) {
        firstUse.set(name, index);
        used.push(...refs);
      }
    }
  };
  const hoistedFunctions = new Set(functionNames);
  markUsed(
    exportedNames(statements).filter((name) => hoistedFunctions.has(name)),
    0
  );
  statements.forEach((statement, index) => {
    if (!qrlStatementNames[index] && !isUnusedQrl[index] && !functionNames[index]) {
      markUsed([...referencedNames(statement)], index);
    }
  });

  const s = new MagicString(code);
  // Include comments leading a statement on its line, like `/*#__PURE__*/`.
  const lineStart = (pos: number) => {
    const start = code.lastIndexOf('\n', pos - 1) + 1;
    return /^\s*(\/\*.*?\*\/\s*)*$/.test(code.slice(start, pos)) ? start : pos;
  };
  const moves: { start: number; end: number; to: number | undefined }[] = [];
  const moveStatement = (statement: AstNode, to: number | undefined) => {
    const end = code[statement.end] === '\n' ? statement.end + 1 : statement.end;
    moves.push({ start: lineStart(statement.start), end, to });
  };
  statements.forEach((statement, index) => {
    const name = qrlStatementNames[index];
    if (!name) {
      if (isUnusedQrl[index]) {
        moveStatement(statement, undefined);
      }
      return;
    }
    const useIndex = firstUse.get(name);
    if (useIndex === undefined) {
      moveStatement(statement, undefined);
    } else if (useIndex > index) {
      moveStatement(statement, lineStart(statements[useIndex].start));
    }
  });
  // All removes before all inserts: alternating them makes MagicString rescan its chunks.
  for (const { start, end } of moves) {
    s.remove(start, end);
  }
  for (const { start, end, to } of moves) {
    const text = code.slice(start, end);
    if (to === undefined) {
      s.append(text.endsWith('\n') ? `\n${text.slice(0, -1)}` : `\n${text}`);
    } else {
      // On the target's own chunk, so moved statements keep their order.
      s.appendRight(to, text);
    }
  }
  return s.toString();
}
