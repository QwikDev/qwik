import type {
  AstFunction,
  AstNode,
  CallExpression,
  MemberExpression,
  ForInStatement,
  ForOfStatement,
  ForStatement,
  VariableDeclarator,
  WhileStatement,
  DoWhileStatement,
} from '../../ast-types.js';
import MagicString from 'magic-string';
import { blankNonCode } from '../edit/text-scanning.js';
import { isReferenceIdentifier, walk } from 'oxc-walker';
import { parseWithRawTransfer } from '../ast/parse.js';
import {
  collectBindingNamesFromPattern,
  collectAssignedIdentifiers,
} from '../ast/binding-pattern.js';
import { ScopeQueryTracker } from '../analysis/scope-query-tracker.js';
import { paddingParam } from '../segment/post-process.js';

export interface LoopContext {
  type: 'map' | 'for-i' | 'for-of' | 'for-in' | 'while' | 'do-while';
  iterVars: string[];
  loopNode: AstNode;
  loopBodyStart: number;
  loopBodyEnd: number;
}

export function detectLoopContext(node: AstNode, _source: string): LoopContext | null {
  switch (node.type) {
    case 'CallExpression':
      return detectMapCall(node);

    case 'ForStatement':
      return buildLoopContext('for-i', extractForInitVars(node.init), node);

    case 'ForOfStatement':
      return buildLoopContext('for-of', extractForLeftVars(node.left), node);

    case 'ForInStatement':
      return buildLoopContext('for-in', extractForLeftVars(node.left), node);

    case 'WhileStatement':
      return buildLoopContext('while', [], node);

    case 'DoWhileStatement':
      return buildLoopContext('do-while', [], node);

    default:
      return null;
  }
}

function detectMapCall(node: CallExpression): LoopContext | null {
  const callee = node.callee;
  if (
    callee?.type !== 'MemberExpression' ||
    node.optional ||
    hasOptionalReceiver(callee) ||
    callee.property?.type !== 'Identifier' ||
    callee.property.name !== 'map'
  ) {
    return null;
  }

  const callback = node.arguments?.[0];
  if (!callback) {
    return null;
  }
  if (
    callback.type !== 'ArrowFunctionExpression' &&
    callback.type !== 'FunctionExpression' &&
    callback.type !== 'FunctionDeclaration'
  ) {
    return null;
  }

  const iterVars = extractCallbackParams(callback);
  const bodyRange = getCallbackBodyRange(callback);

  return {
    type: 'map',
    iterVars,
    loopNode: node,
    loopBodyStart: bodyRange.start,
    loopBodyEnd: bodyRange.end,
  };
}

function hasOptionalReceiver(member: MemberExpression): boolean {
  let current = member;
  while (current.object.type === 'MemberExpression') {
    if (current.optional) {
      return true;
    }
    current = current.object;
  }
  return current.optional || current.object.type === 'ChainExpression';
}

function buildLoopContext(
  type: LoopContext['type'],
  iterVars: string[],
  node: ForStatement | ForOfStatement | ForInStatement | WhileStatement | DoWhileStatement
): LoopContext {
  const body = node.body;
  return {
    type,
    iterVars,
    loopNode: node,
    loopBodyStart: body?.start ?? node.start,
    loopBodyEnd: body?.end ?? node.end,
  };
}

export function writeCandidates(node: AstNode) {
  if (
    node.type === 'VariableDeclaration' ||
    node.type === 'BlockStatement' ||
    node.type === 'Program'
  ) {
    return [node];
  }
  const target =
    node.type === 'AssignmentExpression'
      ? node.left
      : node.type === 'ForStatement' &&
          node.init?.type === 'VariableDeclaration' &&
          node.init.kind === 'var'
        ? node.init
        : node.type === 'UpdateExpression'
          ? node.argument
          : (node.type === 'ForOfStatement' || node.type === 'ForInStatement') &&
              (node.left.type !== 'VariableDeclaration' || node.left.kind === 'var')
            ? node.left
            : undefined;
  if (target?.type === 'VariableDeclaration') {
    return target.declarations.flatMap((declarator) => collectAssignedIdentifiers(declarator.id));
  }
  return target ? collectAssignedIdentifiers(target) : undefined;
}

function referencesInScope(
  tracker: ScopeQueryTracker,
  scopes: WeakMap<AstNode, string>,
  owner: AstNode
) {
  return (reference: AstNode & { name: string }) =>
    tracker.getDeclarationFromScope(reference.name, scopes.get(reference) ?? '')?.node ===
    tracker.getDeclarationFromScope(reference.name, scopes.get(owner) ?? '')?.node;
}

export function extendLoopWrittenCaptures(
  loops: Iterable<LoopContext>,
  tracker: ScopeQueryTracker,
  scopes: WeakMap<AstNode, string>,
  writes: readonly AstNode[]
): void {
  const contexts = new Set(loops);
  if (contexts.size === 0) {
    return;
  }
  const blocks = writes.filter((node) => node.type === 'BlockStatement' || node.type === 'Program');
  const referencedBindings = new Set<AstNode>();
  for (const loop of contexts) {
    const owner =
      loop.loopNode.type === 'CallExpression' ? loop.loopNode.arguments[0] : loop.loopNode;
    if (!owner) {
      continue;
    }
    walk(owner, {
      enter(node: AstNode, parent) {
        if (
          (node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
          isReferenceIdentifier(node, parent)
        ) {
          const declaration = tracker.getDeclarationFromScope(node.name, scopes.get(node) ?? '');
          if (declaration) {
            referencedBindings.add(declaration.node);
          }
        }
      },
    });
  }
  const blockUses = new Map<AstNode, ReturnType<typeof indexBindingReferences>>();
  const isInitializationAfterReference = (
    identifier: AstNode & { name: string },
    declarator: VariableDeclarator,
    binding: AstNode
  ) => {
    const owner = blocks.find(
      (block) =>
        block.start <= declarator.start &&
        declarator.end <= block.end &&
        tracker.getDeclarationFromScope(identifier.name, scopes.get(block) ?? '')?.node === binding
    );
    if (!owner) {
      return false;
    }
    let analysis = blockUses.get(owner);
    if (!analysis) {
      analysis = indexBindingReferences(owner.body, referencesInScope(tracker, scopes, owner));
      blockUses.set(owner, analysis);
    }
    const uses = analysis(identifier.name);
    return Boolean(uses && uses.start <= declarator.end);
  };
  const candidates = writes.flatMap<{
    identifier: AstNode & { name: string };
    declarator?: VariableDeclarator;
    kind?: string;
  }>((write) => {
    if (write.type === 'VariableDeclaration') {
      return write.declarations.flatMap((declarator) =>
        collectAssignedIdentifiers(declarator.id).map((identifier) => ({
          identifier,
          declarator,
          kind: write.kind,
        }))
      );
    }
    return write.type === 'Identifier' ? [{ identifier: write }] : [];
  });
  const seenDeclarations = new Set<AstNode>();
  const declarations = candidates.flatMap(({ identifier, declarator, kind }) => {
    const declaration = tracker.getDeclarationFromScope(
      identifier.name,
      scopes.get(identifier) ?? ''
    );
    if (!declaration || !referencedBindings.has(declaration.node)) {
      return [];
    }
    if (declarator) {
      const isWrite =
        Boolean(declarator.init) &&
        (seenDeclarations.has(declaration.node) ||
          (kind === 'var' &&
            isInitializationAfterReference(identifier, declarator, declaration.node)));
      seenDeclarations.add(declaration.node);
      if (!isWrite) {
        return [];
      }
    }
    return [{ name: identifier.name, node: declaration.node }];
  });
  for (const loop of contexts) {
    const owner =
      loop.loopNode.type === 'CallExpression' ? loop.loopNode.arguments[0] : loop.loopNode;
    const body = owner && scopeBodyOf(owner);
    if (!body) {
      continue;
    }
    const scope = scopes.get(body) ?? '';
    for (const declaration of declarations) {
      if (
        tracker.getDeclarationFromScope(declaration.name, scope)?.node === declaration.node &&
        !loop.iterVars.includes(declaration.name)
      ) {
        loop.iterVars.push(declaration.name);
      }
    }
  }
}

export function generateParamPadding(
  loopVarNames: string[],
  originalParams: readonly string[] = []
): string[] {
  // Author-written (event, element) params survive promotion (matches Rust's
  // `(ev, _1, store)` shape); only missing positions get padding.
  const eventParam = originalParams[0] && originalParams[0] !== '_' ? originalParams[0] : '_';
  const elementParam = originalParams[1] && originalParams[1] !== '_1' ? originalParams[1] : '_1';
  return [eventParam, elementParam, ...loopVarNames];
}

/** Return promoted captures, distinguishing real names from generated padding. */
export function eventHandlerQpParams(
  paramNames: readonly string[],
  captures?: readonly string[]
): string[] {
  // Only capture promotion creates handlers with a third-or-later param —
  // authors write at most (event, element) — so position filters suffice.
  if (paramNames.length < 3) {
    return [];
  }
  const result: string[] = [];
  for (let i = 2; i < paramNames.length; i++) {
    const p = paramNames[i];
    if (captures ? !captures.includes(p) : paddingParam.test(p)) {
      continue;
    }
    result.push(p);
  }
  return result;
}

export function buildCaptureProp(
  loopVars: string[],
  preserveOrder: boolean = false
): { propName: string; propValue: string } | null {
  if (loopVars.length === 0) {
    return null;
  }

  if (loopVars.length === 1) {
    return { propName: 'q:p', propValue: loopVars[0] };
  }

  const sorted = preserveOrder ? loopVars : [...loopVars].sort();
  return { propName: 'q:ps', propValue: '[' + sorted.join(', ') + ']' };
}

function extractCallbackParams(callback: AstFunction): string[] {
  const params = callback.params ?? [];
  const names: string[] = [];
  for (const param of params) {
    if (param.type === 'Identifier') {
      names.push(param.name);
    } else if (param.type === 'AssignmentPattern' && param.left?.type === 'Identifier') {
      names.push(param.left.name);
    }
  }
  return names;
}

function getCallbackBodyRange(callback: AstFunction): { start: number; end: number } {
  const body = callback.body;
  if (!body) {
    return { start: callback.start, end: callback.end };
  }
  return { start: body.start, end: body.end };
}

function extractForInitVars(init: ForStatement['init']): string[] {
  if (!init) {
    return [];
  }
  if (init.type === 'VariableDeclaration') {
    return extractDeclaratorNames(init.declarations ?? []);
  }
  return [];
}

function extractForLeftVars(left: ForOfStatement['left'] | ForInStatement['left']): string[] {
  if (!left) {
    return [];
  }
  if (left.type === 'VariableDeclaration') {
    return extractDeclaratorNames(left.declarations ?? []);
  }
  if (left.type === 'Identifier') {
    return [left.name];
  }
  return [];
}

function extractDeclaratorNames(declarators: VariableDeclarator[]): string[] {
  const names: string[] = [];
  for (const decl of declarators) {
    if (decl.id?.type === 'Identifier') {
      names.push(decl.id.name);
    }
  }
  return names;
}

/** A loop handler's `.w([…])` binding, with the lexical captures it closes over. */
export interface LoopWDecl {
  decl: string;
  symbolName: string;
  captureNames: readonly string[];
}

function isFunctionNode(node: AstNode): node is AstFunction {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration'
  );
}

/** The body of a function or loop statement, else `undefined`. */
function scopeBodyOf(node: AstNode): AstNode | null | undefined {
  switch (node.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'FunctionDeclaration':
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement':
    case 'WhileStatement':
    case 'DoWhileStatement':
      return node.body;
    default:
      return undefined;
  }
}

/** AST nodes from `root` down to the innermost node whose range contains `pos`. */
function pathToPosition(root: AstNode, pos: number): AstNode[] {
  const path: AstNode[] = [root];
  let node: AstNode | undefined = root;
  while (node) {
    let next: AstNode | undefined;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'parent' || !value || typeof value !== 'object') {
        continue;
      }
      for (const candidate of Array.isArray(value) ? value : [value]) {
        if (
          candidate &&
          typeof candidate.type === 'string' &&
          typeof candidate.start === 'number' &&
          candidate.start <= pos &&
          pos < candidate.end
        ) {
          next = candidate as AstNode;
          break;
        }
      }
      if (next) {
        break;
      }
    }
    if (next) {
      path.push(next);
    }
    node = next;
  }
  return path;
}

function declarationNames(stmt: AstNode | null | undefined): string[] {
  if (!stmt) {
    return [];
  }
  if (stmt.type === 'VariableDeclaration') {
    return stmt.declarations.flatMap((d) => collectBindingNamesFromPattern(d.id));
  }
  if ((stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration') && stmt.id) {
    return [stmt.id.name];
  }
  return [];
}

/** Whether `node` introduces a binding for one of `names`; block declarations cover the whole block. */
function declaresAny(node: AstNode, names: ReadonlySet<string>): boolean {
  const hit = (bindings: string[]) => bindings.some((name) => names.has(name));
  switch (node.type) {
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'FunctionDeclaration':
      return node.params.some((param) => hit(collectBindingNamesFromPattern(param)));
    case 'BlockStatement':
      return node.body.some((stmt) => hit(declarationNames(stmt)));
    case 'ForStatement':
      return node.init?.type === 'VariableDeclaration' && hit(declarationNames(node.init));
    case 'ForInStatement':
    case 'ForOfStatement':
      return node.left.type === 'VariableDeclaration' && hit(declarationNames(node.left));
    default:
      return false;
  }
}

/** Start of the first value or JSX tag reference to `name`; strings and property keys don't count. */
function findReferenceStart(
  root: AstNode,
  name: string,
  matches: (node: AstNode) => boolean = () => true
): number | undefined {
  let referenceStart: number | undefined;
  walk(root, {
    enter(node: AstNode, parent) {
      if (
        referenceStart === undefined &&
        (node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
        node.name === name &&
        isReferenceIdentifier(node, parent) &&
        matches(node)
      ) {
        referenceStart = node.start;
      }
    },
  });
  return referenceStart;
}

function declaratorSites(statements: readonly AstNode[]) {
  return statements.flatMap((statement) => {
    const nodes = statement.type === 'VariableDeclaration' ? statement.declarations : [statement];
    return nodes.map((node, declaratorIndex) => ({ statement, node, declaratorIndex }));
  });
}

/** Index lexical references, accounting for hoisted function availability. */
export function indexBindingReferences(
  statements: readonly AstNode[],
  matches: (node: AstNode & { name: string }) => boolean = () => true
) {
  const sites = declaratorSites(statements);
  const references: Array<{ name: string; owner?: string; first: number; start: number }> = [];
  const functions = new Map<
    string,
    { uses: Set<string>; boundary?: { first: number; start: number } }
  >();
  for (const { node } of sites) {
    if (node.type === 'FunctionDeclaration' && node.id) {
      functions.set(node.id.name, { uses: new Set() });
    }
  }
  sites.forEach((site, index) => {
    const owner = site.node.type === 'FunctionDeclaration' ? site.node.id?.name : undefined;
    const blocks = [statements[0].start];
    const hoistedFunctions: number[] = [];
    walk(site.node, {
      enter(node: AstNode, parent) {
        if (node.type === 'FunctionDeclaration') {
          hoistedFunctions.push(Math.min(blocks.at(-1)!, hoistedFunctions.at(-1) ?? Infinity));
        }
        if (node.type === 'BlockStatement') {
          blocks.push(node.start);
        }
        if (
          (node.type === 'Identifier' || node.type === 'JSXIdentifier') &&
          isReferenceIdentifier(node, parent) &&
          matches(node)
        ) {
          const start = Math.min(node.start, hoistedFunctions.at(-1) ?? Infinity);
          const first = start < site.node.start ? 0 : index;
          references.push({ name: node.name, owner, first, start });
        }
      },
      leave(node: AstNode) {
        if (node.type === 'BlockStatement') {
          blocks.pop();
        }
        if (node.type === 'FunctionDeclaration') {
          hoistedFunctions.pop();
        }
      },
    });
  });
  const roots: typeof references = [];
  for (const reference of references) {
    if (functions.has(reference.name)) {
      if (reference.owner) {
        functions.get(reference.owner)!.uses.add(reference.name);
      } else {
        roots.push(reference);
      }
    }
  }
  roots.sort((a, b) => a.start - b.start || a.first - b.first);
  for (const root of roots) {
    const pending = [root.name];
    for (const name of pending) {
      const declaration = functions.get(name)!;
      if (declaration.boundary) {
        continue;
      }
      declaration.boundary = root;
      pending.push(...declaration.uses);
    }
  }
  const indexed = new Map<string, { first: number; start: number }>();
  for (const reference of references) {
    const boundary = reference.owner
      ? (functions.get(reference.owner)!.boundary ?? { first: 0, start: statements[0].start })
      : reference;
    const previous = indexed.get(reference.name);
    indexed.set(reference.name, {
      first: Math.min(previous?.first ?? Infinity, boundary.first),
      start: Math.min(previous?.start ?? Infinity, boundary.start),
    });
  }
  return (name: string) => {
    const reference = indexed.get(name);
    if (reference) {
      return { start: reference.start, first: sites[reference.first] };
    }
  };
}

/** Plan a declarator boundary after captures initialize and before execution. */
function bindingPosition(
  statements: readonly AstNode[],
  name: string,
  captureNames: ReadonlySet<string>,
  uses: ReturnType<typeof indexBindingReferences>
) {
  const firstUse = uses(name)?.first;
  if (!firstUse) {
    return;
  }
  let position: ReturnType<typeof declaratorSites>[number] = firstUse;
  const sites = declaratorSites(statements);
  for (const site of sites) {
    const capturesReady =
      (site.statement.type === 'VariableDeclaration' &&
        site.node.type === 'VariableDeclarator' &&
        (site.statement.kind !== 'var' ||
          (site.node.init &&
            (site.statement.start < firstUse.statement.start ||
              (site.statement === firstUse.statement &&
                site.declaratorIndex < firstUse.declaratorIndex)))) &&
        collectBindingNamesFromPattern(site.node.id).some((name) => captureNames.has(name))) ||
      (site.node.type === 'ClassDeclaration' &&
        declarationNames(site.node).some((name) => captureNames.has(name)));
    if (
      capturesReady &&
      (site.statement.start > position.statement.start ||
        (site.statement === position.statement && site.declaratorIndex >= position.declaratorIndex))
    ) {
      position = { ...site, declaratorIndex: site.declaratorIndex + 1 };
    }
  }
  return position;
}

function unplacedBindingError(symbolNames: readonly string[], reason: string): Error {
  return new Error(
    `Qwik optimizer: cannot place loop handler binding ${symbolNames.join(', ')}: ${reason}`
  );
}

/**
 * Places each loop handler's `.w([…])` binding in the innermost scope that declares one of its
 * captures, right before the statement that uses it. When every capture is component-scoped that is
 * the component body; when a capture comes from an outer loop (`items.map((item) => …)` nested in
 * `facets.map((facet) => …)` capturing `facet`), the binding goes inside the outer loop callback.
 * Either scope is turned into a block body if it was expression-bodied. Mirrors the Rust optimizer.
 * Statement boundaries come from a parse — text scanning breaks on `;` inside type annotations.
 */
export function insertLoopWDecls(body: string, decls: readonly LoopWDecl[]): string {
  const wrapperPrefixText = 'const __w__ = ';
  const offset = wrapperPrefixText.length;
  const parsed = parseWithRawTransfer('__w__.tsx', wrapperPrefixText + body + ';');
  const init = parsed.program?.body?.[0];
  const root = init?.type === 'VariableDeclaration' ? init.declarations?.[0]?.init : undefined;
  if (!root || !isFunctionNode(root) || !root.body) {
    throw unplacedBindingError(
      decls.map((d) => d.symbolName),
      'the body is not a function'
    );
  }

  const tracker = new ScopeQueryTracker({ preserveExitedScopes: true });
  const scopes = new WeakMap<AstNode, string>();
  walk(root, {
    scopeTracker: tracker,
    enter(node: AstNode) {
      scopes.set(node, tracker.getCurrentScope());
    },
  });
  tracker.freeze();
  const s = new MagicString(body);
  const splitPositions = new Set<number>();
  const blockUses = new Map<AstNode, ReturnType<typeof indexBindingReferences>>();
  const statementBindings: Array<{ statement: AstNode; declaratorIndex: number; decl: string }> =
    [];
  const statementBodies = new Map<AstNode, string[]>();
  const defaultBindings = new Map<AstNode, string[]>();
  // Expression-bodied callbacks to rewrite as `{ <decls> return <expr>; }`, keyed by node start.
  const expressionBodies = new Map<number, { node: AstNode; body: AstNode; decls: string[] }>();

  for (const { decl, symbolName, captureNames } of decls) {
    const usePos = findReferenceStart(root, symbolName);
    if (usePos === undefined) {
      throw unplacedBindingError([symbolName], 'the body never uses it');
    }
    const path = pathToPosition(root, usePos);
    const defaultPattern = [...path]
      .reverse()
      .find(
        (node) =>
          node.type === 'AssignmentPattern' && node.right.start <= usePos && usePos < node.right.end
      );
    const names = new Set(captureNames);
    let scopeIdx = 0;
    for (let i = path.length - 2; i > 0; i--) {
      if (declaresAny(path[i], names)) {
        scopeIdx = i;
        break;
      }
    }
    if (defaultPattern?.type === 'AssignmentPattern' && path.indexOf(defaultPattern) > scopeIdx) {
      const loop = path.find(
        (node) =>
          node.start >= defaultPattern.right.start && detectLoopContext(node, body)?.type === 'map'
      );
      const expression = loop?.type === 'CallExpression' ? loop.arguments[0] : defaultPattern.right;
      const bindings = defaultBindings.get(expression) ?? [];
      bindings.push(decl);
      defaultBindings.set(expression, bindings);
      continue;
    }
    let scope = path[scopeIdx];
    let child = path[scopeIdx + 1];
    const scopeBody = scopeBodyOf(scope);
    if (scopeBody) {
      if (scopeBody.type !== 'BlockStatement') {
        if (scope.type === 'ArrowFunctionExpression') {
          const entry = expressionBodies.get(scope.start) ?? {
            node: scope,
            body: scopeBody,
            decls: [],
          };
          entry.decls.push(decl);
          expressionBodies.set(scope.start, entry);
          continue;
        }
        // `for (…) stmt;` — wrap the single statement in a block.
        const bindings = statementBodies.get(scopeBody) ?? [];
        bindings.push(decl);
        statementBodies.set(scopeBody, bindings);
        continue;
      }
      scope = scopeBody;
      child = path[path.indexOf(scopeBody) + 1];
    }
    if (scope.type !== 'BlockStatement') {
      throw unplacedBindingError([symbolName], `${scope.type} has no statement list`);
    }
    if (!scope.body.some((statement) => statement === child)) {
      throw unplacedBindingError([symbolName], 'its use is outside the scope statements');
    }
    const uses =
      blockUses.get(scope) ??
      indexBindingReferences(scope.body, referencesInScope(tracker, scopes, scope));
    blockUses.set(scope, uses);
    const position = bindingPosition(scope.body, symbolName, names, uses) ?? {
      statement: child,
      declaratorIndex: 0,
    };
    statementBindings.push({ ...position, decl });
  }

  for (const { statement, declaratorIndex, decl } of statementBindings) {
    if (statement.type === 'VariableDeclaration' && declaratorIndex > 0) {
      const declarations = statement.declarations;
      if (declaratorIndex < declarations.length) {
        const previousEnd = declarations[declaratorIndex - 1].end - offset;
        const start = declarations[declaratorIndex].start - offset;
        const separator = previousEnd + blankNonCode(body.slice(previousEnd, start)).indexOf(',');
        if (!splitPositions.has(separator)) {
          s.overwrite(separator, separator + 1, ';');
          splitPositions.add(separator);
          s.appendRight(start, `${statement.kind} `);
        }
        s.appendLeft(start, `${decl}\n        `);
        continue;
      }
    }
    if (declaratorIndex > 0) {
      s.appendLeft(statement.end - offset, `\n        ${decl}`);
    } else {
      s.appendLeft(statement.start - offset, `${decl}\n        `);
    }
  }

  for (const [statement, bindings] of statementBodies) {
    s.appendLeft(statement.start - offset, `{\n        ${bindings.join('\n        ')}\n        `);
    s.appendRight(statement.end - offset, '\n    }');
  }

  for (const [expression, bindings] of defaultBindings) {
    s.appendRight(expression.start - offset, `(() => { ${bindings.join(' ')} return `);
    s.appendLeft(expression.end - offset, '; })()');
  }

  for (const { node, body: exprNode, decls: bodyDecls } of expressionBodies.values()) {
    // The parsed body boundary (a parenthesised body is a ParenthesizedExpression, so its parens are
    // kept): comments after `=>` stay ahead of the new block and can't swallow `return`.
    const exprStart = exprNode.start - offset;
    const indent = '\n        ';
    s.appendRight(exprStart, `{${indent}${bodyDecls.join(indent)}${indent}return `);
    s.appendLeft(node.end - offset, ';\n    }');
  }

  return s.toString();
}
