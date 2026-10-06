import type MagicString from 'magic-string';
import { isReferenceIdentifier, ScopeTracker, walk } from 'oxc-walker';
import type {
  ArrowFunctionExpression,
  AstNode,
  AstParentNode,
  AstProgram,
  CallExpression,
  FunctionBody,
  VariableDeclaration,
  VariableDeclarator,
} from '../../ast-types.js';
import { TS_EXPRESSION_WRAPPERS } from '../edit/range-replace.js';
import { collectImports } from '../extraction/marker-detection.js';
import { isShorthandPropertyValue } from './flatten-destructures.js';

interface LeadingConst {
  readonly statement: VariableDeclaration;
  readonly declarator: VariableDeclarator;
  readonly value: AstNode;
}

interface ConstReference {
  readonly referencedConst: LeadingConst;
  readonly node: AstNode;
  readonly name: string;
  readonly isRewritable: boolean;
  readonly isShorthand: boolean;
  readonly isMemberObject: boolean;
}

interface InlinedLiteral {
  readonly text: string;
  readonly isNumeric: boolean;
}

const QWIK_CORE_SOURCES = new Set(['@qwik.dev/core', '@builder.io/qwik']);

export function inlineComponentConstLiterals(
  source: string,
  program: AstProgram,
  target: MagicString,
  transpileTs: boolean
): { changed: boolean } {
  if (!source.includes('const') || !source.includes('=>')) {
    return { changed: false };
  }
  const leadingConsts = collectComponentBodies(program).flatMap((body) =>
    collectLeadingConsts(body, transpileTs)
  );
  if (!leadingConsts.some(({ value }) => value.type === 'Literal')) {
    return { changed: false };
  }

  const references = collectReferences(program, leadingConsts);
  const inlinedLiterals = resolveInlinedLiterals(source, leadingConsts, references);
  if (inlinedLiterals.size === 0) {
    return { changed: false };
  }

  const removedDeclarators = new Set(inlinedLiterals.keys());
  for (const reference of references) {
    const literal = inlinedLiterals.get(reference.referencedConst.declarator);
    if (literal && !isInsideAny(reference.node, removedDeclarators)) {
      target.overwrite(reference.node.start, reference.node.end, formatLiteral(reference, literal));
    }
  }
  for (const statement of new Set(leadingConsts.map(({ statement }) => statement))) {
    removeDeclarators(statement, removedDeclarators, target);
  }
  return { changed: true };
}

function collectComponentBodies(program: AstProgram): FunctionBody[] {
  const coreImports = [...collectImports(program).values()].filter((info) =>
    QWIK_CORE_SOURCES.has(info.source)
  );
  const localNamesOf = (...importedNames: string[]): Set<string> =>
    new Set(
      coreImports
        .filter((info) => importedNames.includes(info.importedName))
        .map((info) => info.localName)
    );
  const componentCallees = localNamesOf('component$');
  const inlinedQrlCallees = localNamesOf('inlinedQrl', 'inlinedQrlDEV');

  const bodies = new Set<FunctionBody>();
  walk(program, {
    enter(node, parent, { key, index }) {
      if (key === 'arguments' && index === 0 && isCallTo(parent, inlinedQrlCallees)) {
        this.skip();
        return;
      }
      if (isCallTo(node, componentCallees)) {
        const [component] = node.arguments;
        if (
          component?.type === 'ArrowFunctionExpression' &&
          component.body.type === 'BlockStatement'
        ) {
          bodies.add(component.body);
        }
      }
      if (node.type === 'ArrowFunctionExpression' && isInlineComponentArrow(node)) {
        bodies.add(node.body);
      }
    },
  });
  return [...bodies];
}

function isCallTo(node: AstParentNode, calleeNames: ReadonlySet<string>): node is CallExpression {
  return (
    node?.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    calleeNames.has(node.callee.name)
  );
}

function isInlineComponentArrow(
  arrow: ArrowFunctionExpression
): arrow is ArrowFunctionExpression & { body: FunctionBody } {
  return (
    arrow.params.length === 1 &&
    arrow.body.type === 'BlockStatement' &&
    arrow.body.body.some((statement) => statement.type === 'ReturnStatement')
  );
}

function collectLeadingConsts(body: FunctionBody, transpileTs: boolean): LeadingConst[] {
  if (startsWithCaptureReads(body)) {
    return [];
  }
  const leadingConsts: LeadingConst[] = [];
  for (const statement of body.body) {
    if (statement.type !== 'VariableDeclaration') {
      continue;
    }
    if (statement.kind === 'let' || statement.kind === 'var') {
      break;
    }
    if (statement.kind !== 'const') {
      continue;
    }
    for (const declarator of statement.declarations) {
      if (declarator.id.type !== 'Identifier' || !declarator.init) {
        continue;
      }
      const value = transpileTs ? unwrapTypeExpressions(declarator.init) : declarator.init;
      if (value.type === 'Literal' || value.type === 'Identifier') {
        leadingConsts.push({ statement, declarator, value });
      }
    }
  }
  return leadingConsts;
}

function unwrapTypeExpressions(node: AstNode): AstNode {
  let current = node;
  while (TS_EXPRESSION_WRAPPERS.has(current.type)) {
    current = (current as AstNode & { expression: AstNode }).expression;
  }
  return current;
}

function startsWithCaptureReads(body: FunctionBody): boolean {
  const [first] = body.body;
  return (
    first?.type === 'VariableDeclaration' &&
    first.declarations.some(
      ({ init }) => init?.type === 'MemberExpression' && isCapturesObject(init.object)
    )
  );
}

function isCapturesObject(node: AstNode): boolean {
  if (node.type === 'Identifier') {
    return node.name === '_captures';
  }
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    node.property.type === 'Identifier' &&
    node.property.name === '_'
  );
}

function collectReferences(
  program: AstProgram,
  leadingConsts: readonly LeadingConst[]
): ConstReference[] {
  const constsByBindingStart = new Map(
    leadingConsts.map((leadingConst) => [leadingConst.declarator.id.start, leadingConst])
  );
  const tracker = new ScopeTracker({ preserveExitedScopes: true });
  walk(program, { scopeTracker: tracker });
  tracker.freeze();

  const references: ConstReference[] = [];
  let assignmentTargetDepth = 0;
  walk(program, {
    scopeTracker: tracker,
    enter(node, parent, { key }) {
      if (isAssignmentTarget(node, parent, key)) {
        assignmentTargetDepth++;
      }
      if (node.type.startsWith('TS') && !TS_EXPRESSION_WRAPPERS.has(node.type)) {
        this.skip();
        return;
      }
      if (node.type !== 'Identifier' && node.type !== 'JSXIdentifier') {
        return;
      }
      if (!isReferenceIdentifier(node, parent)) {
        return;
      }
      const declaration = tracker.getDeclaration(node.name);
      const referencedConst =
        declaration?.type === 'Variable'
          ? constsByBindingStart.get(declaration.node.start)
          : undefined;
      if (!referencedConst) {
        return;
      }
      references.push({
        referencedConst,
        node,
        name: node.name,
        isRewritable: node.type === 'Identifier' && assignmentTargetDepth === 0,
        isShorthand: isShorthandPropertyValue(node, parent),
        isMemberObject: parent?.type === 'MemberExpression' && key === 'object',
      });
    },
    leave(node, parent, { key }) {
      if (isAssignmentTarget(node, parent, key)) {
        assignmentTargetDepth--;
      }
    },
  });
  return references;
}

function isAssignmentTarget(node: AstNode, parent: AstParentNode, key: unknown): boolean {
  switch (parent?.type) {
    case 'AssignmentExpression':
      return key === 'left';
    case 'ForInStatement':
    case 'ForOfStatement':
      return key === 'left' && node.type !== 'VariableDeclaration';
    case 'UpdateExpression':
      return true;
    default:
      return false;
  }
}

function resolveInlinedLiterals(
  source: string,
  leadingConsts: readonly LeadingConst[],
  references: readonly ConstReference[]
): Map<VariableDeclarator, InlinedLiteral> {
  const referencedConstByNode = new Map(
    references.map((reference) => [reference.node, reference.referencedConst])
  );
  const literals = new Map<VariableDeclarator, InlinedLiteral>();
  for (const { declarator, value } of leadingConsts) {
    const aliased = value.type === 'Identifier' ? referencedConstByNode.get(value) : undefined;
    const literal =
      value.type === 'Literal'
        ? { text: source.slice(value.start, value.end), isNumeric: typeof value.value === 'number' }
        : aliased && literals.get(aliased.declarator);
    if (literal) {
      literals.set(declarator, literal);
    }
  }
  for (const reference of references) {
    if (!reference.isRewritable) {
      literals.delete(reference.referencedConst.declarator);
    }
  }
  return literals;
}

function isInsideAny(node: AstNode, containers: ReadonlySet<AstNode>): boolean {
  for (const container of containers) {
    if (node.start >= container.start && node.end <= container.end) {
      return true;
    }
  }
  return false;
}

function formatLiteral(reference: ConstReference, literal: InlinedLiteral): string {
  if (reference.isShorthand) {
    return `${reference.name}: ${literal.text}`;
  }
  return reference.isMemberObject && literal.isNumeric ? `(${literal.text})` : literal.text;
}

function removeDeclarators(
  statement: VariableDeclaration,
  removed: ReadonlySet<VariableDeclarator>,
  target: MagicString
): void {
  const { declarations } = statement;
  if (declarations.every((declarator) => removed.has(declarator))) {
    target.remove(statement.start, statement.end);
    return;
  }
  for (let first = 0; first < declarations.length; first++) {
    if (!removed.has(declarations[first])) {
      continue;
    }
    let last = first;
    while (last + 1 < declarations.length && removed.has(declarations[last + 1])) {
      last++;
    }
    if (last + 1 < declarations.length) {
      target.remove(declarations[first].start, declarations[last + 1].start);
    } else {
      target.remove(declarations[first - 1].end, declarations[last].end);
    }
    first = last;
  }
}
