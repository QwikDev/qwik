/**
 * JSX element transformation module for the Qwik optimizer.
 *
 * Converts JSX syntax to _jsxSorted/_jsxSplit function calls with
 * correct prop classification (varProps/constProps), flags computation,
 * key generation, spread handling, and fragment support.
 */

import type MagicString from 'magic-string';
import { walk } from 'oxc-walker';
import { forEachAstChild } from '../utils/ast.js';
import type { AstProgram, JSXElementName } from '../../ast-types.js';
import { SignalHoister } from '../signal-analysis.js';
import { collectPassiveDirectives } from './event-handlers.js';
import { detectLoopContext, type LoopContext } from '../loop-hoisting.js';
import { computeKeyPrefix } from '../key-prefix.js';

// Re-export for consumers
export { processChildren } from './jsx-children.js';
export {
  processProps,
  formatPropName,
  isRewrittenEventEntry,
  sortVarEntries,
} from './jsx-props.js';

export interface JsxTransformResult {
  tag: string;
  varProps: string | null;
  constProps: string | null;
  children: string | null;
  flags: number;
  key: string | null;
  callString: string;
  neededImports: Set<string>;
}

export interface JsxTransformOutput {
  neededImports: Set<string>;
  needsFragment: boolean;
  hoistedDeclarations: string[];
  keyCounterValue: number;
}

export function isConstBindingName(
  name: string | null,
  importedNames: Set<string>,
  constIdents?: Set<string>,
): boolean {
  if (!name) {
    return false;
  }
  return importedNames.has(name) || (constIdents?.has(name) ?? false);
}

function isReturnStatic(init: any): boolean {
  if (!init) return true;
  if (init.type === 'CallExpression' && init.callee) {
    const callee = init.callee;
    let calleeName: string | undefined;
    if (callee.type === 'Identifier') {
      calleeName = callee.name;
    }
    if (calleeName) {
      return calleeName.endsWith('$') || calleeName.endsWith('Qrl') || calleeName.startsWith('use');
    }
  }
  return false;
}

/**
 * Collect names of const-bound identifiers with "static" initializers.
 * These are treated as immutable references for prop classification.
 */
export function collectConstIdents(program: AstProgram): Set<string> {
  const constIdents = new Set<string>();

  function visitNode(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'VariableDeclaration' && node.kind === 'const') {
      for (const decl of node.declarations || []) {
        collectFromDeclarator(decl);
      }
    }

    forEachAstChild(node, (child) => visitNode(child));
  }

  function collectFromDeclarator(decl: any): void {
    if (!decl) return;
    const id = decl.id || decl.name;
    const init = decl.init;
    if (!id) return;

    if (id.type === 'Identifier') {
      if (isReturnStatic(init)) {
        constIdents.add(id.name);
      }
    } else if (id.type === 'ArrayPattern') {
      for (const elem of id.elements || []) {
        if (elem && elem.type === 'Identifier' && isReturnStatic(init)) {
          constIdents.add(elem.name);
        }
      }
    } else if (id.type === 'ObjectPattern') {
      for (const prop of id.properties || []) {
        if (prop.type === 'Property' || prop.type === 'ObjectProperty') {
          const val = prop.value || prop.key;
          if (val && val.type === 'Identifier' && isReturnStatic(init)) {
            constIdents.add(val.name);
          }
        }
      }
    }
  }

  visitNode(program);
  return constIdents;
}

/**
 * Collect all locally declared identifier names from an AST program.
 * Used to distinguish known locals from unknown globals for signal analysis.
 */
function collectAllLocalNames(program: AstProgram): Set<string> {
  const names = new Set<string>();

  function addIdent(node: any): void {
    if (!node) return;
    if (node.type === 'Identifier') {
      names.add(node.name);
    } else if (node.type === 'ArrayPattern') {
      for (const elem of node.elements || []) {
        if (elem) addIdent(elem.type === 'RestElement' ? elem.argument : elem);
      }
    } else if (node.type === 'ObjectPattern') {
      for (const prop of node.properties || []) {
        if (prop.type === 'RestElement') {
          addIdent(prop.argument);
        } else {
          addIdent(prop.value || prop.key);
        }
      }
    } else if (node.type === 'AssignmentPattern') {
      addIdent(node.left);
    }
  }

  function visit(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'VariableDeclaration') {
      for (const decl of node.declarations || []) {
        addIdent(decl.id || decl.name);
      }
    }

    if (node.type === 'FunctionDeclaration' && node.id) {
      addIdent(node.id);
    }

    if (node.type === 'ClassDeclaration' && node.id) {
      addIdent(node.id);
    }

    if ((node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' ||
         node.type === 'ArrowFunctionExpression') && node.params) {
      for (const param of node.params) {
        addIdent(param);
      }
    }

    if (node.type === 'CatchClause' && node.param) {
      addIdent(node.param);
    }

    if ((node.type === 'ForInStatement' || node.type === 'ForOfStatement') && node.left) {
      if (node.left.type === 'VariableDeclaration') {
        for (const decl of node.left.declarations || []) {
          addIdent(decl.id || decl.name);
        }
      }
    }

    forEachAstChild(node, (child) => visit(child));
  }

  visit(program);
  return names;
}

/**
 * Determine if an expression is immutable (const) or mutable (var).
 * Mirrors SWC's `is_const_expr`.
 */
export function classifyProp(
  exprNode: any,
  importedNames: Set<string>,
  constIdents?: Set<string>,
): 'const' | 'var' {
  if (!exprNode) return 'const';

  switch (exprNode.type) {
    case 'StringLiteral':
    case 'Literal':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
      return 'const';

    case 'TemplateLiteral': {
      if (!exprNode.expressions || exprNode.expressions.length === 0) return 'const';
      for (const expr of exprNode.expressions) {
        if (classifyProp(expr, importedNames, constIdents) === 'var') return 'var';
      }
      return 'const';
    }

    case 'Identifier': {
      const name = exprNode.name;
      if (name === 'undefined') return 'const';
      if (importedNames.has(name)) return 'const';
      if (constIdents?.has(name)) return 'const';
      return 'var';
    }

    case 'MemberExpression':
    case 'StaticMemberExpression':
    case 'ComputedMemberExpression': {
      const obj = exprNode.object;
      if (obj && obj.type === 'Identifier' && importedNames.has(obj.name)) return 'const';
      return 'var';
    }

    case 'CallExpression':
      return 'var';

    case 'UnaryExpression':
      return classifyProp(exprNode.argument, importedNames, constIdents);

    case 'BinaryExpression':
    case 'LogicalExpression': {
      const leftClass = classifyProp(exprNode.left, importedNames, constIdents);
      const rightClass = classifyProp(exprNode.right, importedNames, constIdents);
      return leftClass === 'var' || rightClass === 'var' ? 'var' : 'const';
    }

    case 'ConditionalExpression': {
      const testClass = classifyProp(exprNode.test, importedNames, constIdents);
      const consClass = classifyProp(exprNode.consequent, importedNames, constIdents);
      const altClass = classifyProp(exprNode.alternate, importedNames, constIdents);
      return testClass === 'var' || consClass === 'var' || altClass === 'var' ? 'var' : 'const';
    }

    case 'ObjectExpression': {
      if (!exprNode.properties) return 'const';
      for (const prop of exprNode.properties) {
        if (prop.type === 'SpreadElement') {
          if (classifyProp(prop.argument, importedNames, constIdents) === 'var') return 'var';
        } else if (prop.value) {
          if (classifyProp(prop.value, importedNames, constIdents) === 'var') return 'var';
        }
      }
      return 'const';
    }

    case 'ArrayExpression': {
      if (!exprNode.elements) return 'const';
      for (const el of exprNode.elements) {
        if (el === null) continue;
        if (el.type === 'SpreadElement') {
          if (classifyProp(el.argument, importedNames, constIdents) === 'var') return 'var';
        } else {
          if (classifyProp(el, importedNames, constIdents) === 'var') return 'var';
        }
      }
      return 'const';
    }

    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return 'const';

    case 'ParenthesizedExpression':
      return classifyProp(exprNode.expression, importedNames, constIdents);

    case 'SequenceExpression': {
      for (const expr of exprNode.expressions) {
        if (classifyProp(expr, importedNames, constIdents) === 'var') return 'var';
      }
      return 'const';
    }

    default:
      return 'var';
  }
}

/**
 * Compute the flags bitmask for a JSX element.
 *
 * Bit 0 (1): static_listeners -- all event handler props are const
 * Bit 1 (2): static_subtree -- children are static or none
 * Bit 2 (4): moved_captures -- loop context (q:p/q:ps)
 */
export function computeFlags(
  hasVarProps: boolean,
  childrenType: 'none' | 'static' | 'dynamic',
  inLoop: boolean = false,
  hasVarEventHandler: boolean = false,
): number {
  let flags = 0;
  if (!hasVarEventHandler && (!inLoop || !hasVarProps)) {
    flags |= 1;
  }
  if (childrenType !== 'dynamic') {
    flags |= 2;
  }
  if (inLoop) {
    flags |= 4;
  }
  return flags;
}

export class JsxKeyCounter {
  private count: number;
  private prefix: string;

  constructor(startAt = 0, prefix = 'u6') {
    this.count = startAt;
    this.prefix = prefix;
  }

  next(): string {
    return `${this.prefix}_${this.count++}`;
  }

  current(): number {
    return this.count;
  }

  reset(): void {
    this.count = 0;
  }
}

export function isHtmlElement(tagName: string): boolean {
  return tagName.length > 0 && tagName[0] === tagName[0].toLowerCase();
}

/** Text-only HTML elements whose children should NOT be signal-wrapped. */
const TEXT_ONLY_TAGS = new Set([
  'text', 'textarea', 'title', 'option', 'script', 'style', 'noscript',
]);

export function isTextOnlyElement(tagName: string): boolean {
  return TEXT_ONLY_TAGS.has(tagName);
}

/**
 * Extract tag representation from a JSX opening element name node.
 */
export function processJsxTag(nameNode: JSXElementName | null | undefined): string {
  if (!nameNode) return '"div"';

  switch (nameNode.type) {
    case 'JSXIdentifier': {
      const name = nameNode.name;
      return isHtmlElement(name) ? `"${name}"` : name;
    }
    case 'JSXMemberExpression': {
      const parts: string[] = [];
      let current: JSXElementName = nameNode;
      while (current.type === 'JSXMemberExpression') {
        parts.unshift(current.property.name);
        current = current.object as JSXElementName;
      }
      if (current.type === 'JSXIdentifier') {
        parts.unshift(current.name);
      }
      return parts.join('.');
    }
    case 'JSXNamespacedName':
      return `"${nameNode.namespace.name}:${nameNode.name.name}"`;
    default:
      return '"div"';
  }
}

function isInSkipRange(
  nodeStart: number,
  nodeEnd: number,
  skipRanges: Array<{ start: number; end: number }>,
): boolean {
  for (const range of skipRanges) {
    if (nodeStart >= range.start && nodeEnd <= range.end) return true;
  }
  return false;
}

/**
 * Apply two-phase rename (old -> temp -> new) to avoid collisions when
 * renumbering _hf variables to match SWC's top-down source order.
 */
function applySignalHoistRenames(
  s: MagicString,
  renameMap: Map<string, string>,
): void {
  const content = s.toString();
  let renamed = content;

  const tempMap = new Map<string, string>();
  for (const [oldName, newName] of renameMap) {
    const temp = `__hf_temp_${oldName.slice(3)}__`;
    tempMap.set(temp, newName);
    renamed = renamed.split(`${oldName}_str`).join(`${temp}_str`);
    renamed = renamed.split(oldName).join(temp);
  }

  for (const [temp, newName] of tempMap) {
    renamed = renamed.split(`${temp}_str`).join(`${newName}_str`);
    renamed = renamed.split(temp).join(newName);
  }

  if (renamed !== content) {
    s.overwrite(0, s.original.length, renamed);
  }
}

/** Append dev source location info to a JSX call string. */
function appendDevSuffix(callString: string, devSuffix: string): string {
  if (!devSuffix) return callString;
  return callString.slice(0, -1) + devSuffix + ')';
}

// Import element/fragment transform functions
import { transformJsxElement, transformJsxFragment } from './jsx-elements-core.js';

// Re-export for consumers
export { transformJsxElement, transformJsxFragment };

/**
 * Walk the AST bottom-up and transform all JSX nodes.
 * Uses leave callback to ensure inner JSX is transformed before outer JSX.
 */
export function transformAllJsx(
  source: string,
  s: MagicString,
  program: AstProgram,
  importedNames: Set<string>,
  skipRanges?: Array<{ start: number; end: number }>,
  devOptions?: { relPath: string },
  keyCounterStart?: number,
  enableSignals: boolean = true,
  qpOverrides?: Map<number, string[]>,
  qrlsWithCaptures?: Set<string>,
  paramNames?: Set<string>,
  relPath?: string,
  sharedSignalHoister?: SignalHoister,
  constIdents?: Set<string>,
): JsxTransformOutput {
  const resolvedConstIdents = constIdents ?? collectConstIdents(program);
  const allDeclaredNames = collectAllLocalNames(program);
  const prefix = relPath ? computeKeyPrefix(relPath) : 'u6';
  const keyCounter = new JsxKeyCounter(keyCounterStart ?? 0, prefix);
  const signalHoister = sharedSignalHoister ?? new SignalHoister();
  const neededImports = new Set<string>();
  let needsFragment = false;
  const ranges = skipRanges ?? [];

  let lineStarts: number[] | null = null;
  if (devOptions) {
    lineStarts = [0];
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '\n') lineStarts.push(i + 1);
    }
  }

  function getDevSourceSuffix(nodeStart: number): string {
    if (!devOptions || !lineStarts) return '';
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= nodeStart) lo = mid;
      else hi = mid - 1;
    }
    const lineNumber = lo + 1;
    const columnNumber = nodeStart - lineStarts[lo] + 1;
    return `, {\n    fileName: "${devOptions.relPath}",\n    lineNumber: ${lineNumber},\n    columnNumber: ${columnNumber}\n}`;
  }

  const loopStack: LoopContext[] = [];
  const childJsxNodes = new WeakSet<object>();

  walk(program, {
    enter(node: any) {
      const loopCtx = detectLoopContext(node, source);
      if (loopCtx) {
        loopStack.push(loopCtx);
      }

      if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
        for (const child of node.children ?? []) {
          if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
            childJsxNodes.add(child);
          }
        }
      }
    },
    leave(node: any) {
      if (loopStack.length > 0 && loopStack[loopStack.length - 1].loopNode === node) {
        loopStack.pop();
      }

      if (ranges.length > 0 && isInSkipRange(node.start, node.end, ranges)) return;

      const currentLoop = loopStack.length > 0 ? loopStack[loopStack.length - 1] : null;

      if (node.type === 'JSXElement') {
        const passiveEvents = collectPassiveDirectives(node.openingElement?.attributes ?? []);
        const isSoleChild = childJsxNodes.has(node);

        const result = transformJsxElement(
          node, source, s, importedNames, keyCounter,
          passiveEvents, signalHoister, currentLoop, isSoleChild,
          enableSignals, qpOverrides, qrlsWithCaptures, paramNames,
          resolvedConstIdents, allDeclaredNames,
        );
        if (result) {
          const callStr = appendDevSuffix(result.callString, getDevSourceSuffix(node.start));
          s.overwrite(node.start, node.end, `/*#__PURE__*/ ${callStr}`);
          for (const imp of result.neededImports) neededImports.add(imp);
        }
      } else if (node.type === 'JSXFragment') {
        const isChildFragment = childJsxNodes.has(node);
        const result = transformJsxFragment(
          node, source, s, importedNames, keyCounter,
          isChildFragment, resolvedConstIdents, signalHoister, allDeclaredNames,
        );
        if (result) {
          const callStr = appendDevSuffix(result.callString, getDevSourceSuffix(node.start));
          s.overwrite(node.start, node.end, `/*#__PURE__*/ ${callStr}`);
          for (const imp of result.neededImports) neededImports.add(imp);
          needsFragment = true;
        }
      }
    },
  });

  const renameMap = signalHoister.buildRenameMap();
  if (renameMap && renameMap.size > 0) {
    applySignalHoistRenames(s, renameMap);
  }

  const hoistedDeclarations = signalHoister.getDeclarations();
  return { neededImports, needsFragment, hoistedDeclarations, keyCounterValue: keyCounter.current() };
}
