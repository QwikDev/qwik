/**
 * Const literal propagation and inlining utilities.
 *
 * Resolves const literal values from parent bodies, inlines them into
 * capture references, propagates cascading const literals, and removes
 * dead const declarations.
 */

import { parseSync } from 'oxc-parser';
import { forEachAstChild } from '../../utils/ast.js';
import { RAW_TRANSFER_PARSER_OPTIONS } from '../../ast-types.js';

// Internal walker functions in this module traverse arbitrary OXC AST node
// shapes (including runtime-only types like StringLiteral, StaticMemberExpression)
// that are not represented in @oxc-project/types. We use `any` for walker
// parameters since the strict Node union does not cover these runtime variants.

/**
 * Parse a parent extraction body and find const declarations with literal values
 * for the given capture names. Returns a map of name -> literal source text.
 */
export function resolveConstLiterals(parentBody: string, captureNames: string[]): Map<string, string> {
  const result = new Map<string, string>();
  if (captureNames.length === 0) return result;

  const wrapperPrefix = 'const __rl__ = ';
  const wrappedSource = wrapperPrefix + parentBody;
  const parseResult = parseSync('__rl__.tsx', wrappedSource, RAW_TRANSFER_PARSER_OPTIONS);
  if (!parseResult.program || parseResult.errors?.length) return result;

  const offset = wrapperPrefix.length;
  const captureSet = new Set(captureNames);

  // Walk the parsed body to find const declarations
  function walkNode(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'VariableDeclaration' && node.kind === 'const') {
      for (const decl of node.declarations ?? []) {
        if (decl.id?.type === 'Identifier' && captureSet.has(decl.id.name) && decl.init) {
          // Check if init is a simple literal
          const init = decl.init;
          if (init.type === 'StringLiteral' || init.type === 'Literal' ||
              init.type === 'NumericLiteral' || init.type === 'BooleanLiteral' ||
              init.type === 'NullLiteral') {
            // Get the literal source text from the parent body
            const literalStart = init.start - offset;
            const literalEnd = init.end - offset;
            if (literalStart >= 0 && literalEnd <= parentBody.length) {
              result.set(decl.id.name, parentBody.slice(literalStart, literalEnd));
            }
          }
        }
      }
    }

    forEachAstChild(node, (child) => walkNode(child));
  }

  walkNode(parseResult.program);
  return result;
}

/**
 * Replace captured identifier references in a body text with their inlined
 * literal values. Uses AST-based replacement to avoid replacing property names.
 */
export function inlineConstCaptures(body: string, constValues: Map<string, string>): string {
  const wrapperPrefix = 'const __ic__ = ';
  const wrappedSource = wrapperPrefix + body;
  const parseResult = parseSync('__ic__.tsx', wrappedSource, RAW_TRANSFER_PARSER_OPTIONS);
  if (!parseResult.program || parseResult.errors?.length) return body;

  const offset = wrapperPrefix.length;
  const replacements: Array<{ start: number; end: number; value: string }> = [];

  function walkNode(node: any, parentKey?: string, parentNode?: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'Identifier' && constValues.has(node.name)) {
      // Skip declaration ids (const X = ...), property keys, and non-computed member props
      const isDeclId = parentKey === 'id' && parentNode?.type === 'VariableDeclarator';
      const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
      const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed;

      if (!isDeclId && !isPropertyKey && !isMemberProp) {
        replacements.push({
          start: node.start - offset,
          end: node.end - offset,
          value: constValues.get(node.name)!,
        });
      }
    }

    forEachAstChild(node, (child, key, parent) => {
      walkNode(child, key, parent);
    });
  }

  walkNode(parseResult.program);

  // Sort descending and apply
  replacements.sort((a, b) => b.start - a.start);
  let result = body;
  for (const r of replacements) {
    result = result.slice(0, r.start) + r.value + result.slice(r.end);
  }
  return result;
}

/**
 * Inline `const X = <literal>` within a body and remove dead declarations.
 * Iterates until no more propagation is possible (for cascading).
 */
export function propagateConstLiteralsInBody(body: string): string {
  const MAX_ITERATIONS = 5;
  let result = body;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const wrapperPrefix = 'const __pb__ = ';
    const wrappedSource = wrapperPrefix + result;
    const parseResult = parseSync('__pb__.tsx', wrappedSource, RAW_TRANSFER_PARSER_OPTIONS);
    if (!parseResult.program || parseResult.errors?.length) break;

    const offset = wrapperPrefix.length;

    // Literal inits: always inline. Non-literal inits: only if single-use.
    const constDecls = new Map<string, { value: string; isLiteral: boolean; stmtStart: number; stmtEnd: number }>();

    function findConstDecls(node: any): void {
      if (!node || typeof node !== 'object') return;

      if (node.type === 'VariableDeclaration' && node.kind === 'const' &&
          node.declarations?.length === 1) {
        const decl = node.declarations[0];
        if (decl.id?.type === 'Identifier' && decl.init) {
          const init = decl.init;
          const isLiteral = init.type === 'StringLiteral' || init.type === 'Literal' ||
              init.type === 'NumericLiteral' || init.type === 'BooleanLiteral' ||
              init.type === 'NullLiteral';
          const initStart = init.start - offset;
          const initEnd = init.end - offset;
          const stmtStart = node.start - offset;
          const stmtEnd = node.end - offset;
          if (initStart >= 0 && initEnd <= result.length) {
            constDecls.set(decl.id.name, {
              value: result.slice(initStart, initEnd),
              isLiteral,
              stmtStart,
              stmtEnd,
            });
          }
        }
      }

      forEachAstChild(node, (child) => findConstDecls(child));
    }

    findConstDecls(parseResult.program);
    if (constDecls.size === 0) break;

    // Phase 2: Count references to each const (excluding the declaration's own id)
    const refCounts = new Map<string, number>();
    for (const name of constDecls.keys()) refCounts.set(name, 0);

    function countRefs(node: any, parentKey?: string, parentNode?: any): void {
      if (!node || typeof node !== 'object') return;

      if (node.type === 'Identifier' && constDecls.has(node.name)) {
        if (parentKey === 'id' && parentNode?.type === 'VariableDeclarator') {
          // declaration id — skip
        } else {
          const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
          const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed;
          if (!isPropertyKey && !isMemberProp) {
            refCounts.set(node.name, (refCounts.get(node.name) ?? 0) + 1);
          }
        }
      }

      forEachAstChild(node, (child, key, parent) => {
        countRefs(child, key, parent);
      });
    }

    countRefs(parseResult.program);

    // Phase 3: Inline literal consts and remove their declarations.
    const toInline = new Map<string, string>();
    const toRemove = new Set<string>();

    for (const [name, info] of constDecls) {
      if (!info.isLiteral) continue;
      const refs = refCounts.get(name) ?? 0;
      if (refs > 0) {
        toInline.set(name, info.value);
      }
      toRemove.add(name);
    }

    if (toInline.size === 0 && toRemove.size === 0) break;

    if (toInline.size > 0) {
      result = inlineConstCaptures(result, toInline);
    }
    if (toRemove.size > 0) {
      result = removeConstDeclarations(result, toRemove);
    }
  }

  // After literal propagation, inline single-use non-literal consts
  // (e.g., `const value = FOO['A']` used once becomes inline)
  result = propagateSingleUseNonLiterals(result);

  return result;
}

/**
 * Check if an AST init expression is side-effect-free (safe to inline).
 * Only allows simple member access chains and identifiers.
 */
function isSimpleSideEffectFree(node: any): boolean {
  if (!node || typeof node !== 'object') return false;
  switch (node.type) {
    case 'Identifier':
      // Skip generated identifiers
      return !node.name.startsWith('_');
    case 'StringLiteral':
    case 'Literal':
    case 'NumericLiteral':
    case 'BooleanLiteral':
    case 'NullLiteral':
      return true;
    case 'MemberExpression':
    case 'StaticMemberExpression':
      return isSimpleSideEffectFree(node.object);
    case 'ComputedMemberExpression':
      return isSimpleSideEffectFree(node.object) && isSimpleSideEffectFree(node.property);
    default:
      return false;
  }
}

/**
 * Inline single-use const declarations with side-effect-free init expressions.
 * This is a post-literal-propagation pass that handles patterns like:
 *   const value = FOO_MAPPING['A']; return <>{value}</>
 * -> return <>{FOO_MAPPING['A']}</>
 */
function propagateSingleUseNonLiterals(body: string): string {
  const MAX_ITERATIONS = 3;
  let result = body;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const wrapperPrefix = 'const __su__ = ';
    const wrappedSource = wrapperPrefix + result;
    const parseResult = parseSync('__su__.tsx', wrappedSource, RAW_TRANSFER_PARSER_OPTIONS);
    if (!parseResult.program || parseResult.errors?.length) break;

    const offset = wrapperPrefix.length;

    // Collect all mutable (let/var) variable names -- these must not be referenced
    // by inlining candidates since their values can change between declaration and use.
    const mutableVars = new Set<string>();

    function collectMutableVars(node: any): void {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'VariableDeclaration' && (node.kind === 'let' || node.kind === 'var')) {
        for (const decl of node.declarations ?? []) {
          if (decl.id?.type === 'Identifier') mutableVars.add(decl.id.name);
        }
      }
      forEachAstChild(node, (child) => collectMutableVars(child));
    }
    collectMutableVars(parseResult.program);

    // Collect identifiers referenced in an init expression
    function collectInitIdentifiers(node: any): Set<string> {
      const ids = new Set<string>();
      function walk(n: any): void {
        if (!n || typeof n !== 'object') return;
        if (n.type === 'Identifier') { ids.add(n.name); return; }
        for (const key of Object.keys(n)) {
          if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
          const val = n[key];
          if (val && typeof val === 'object') {
            if (Array.isArray(val)) {
              for (const item of val) { if (item && typeof item.type === 'string') walk(item); }
            } else if (typeof val.type === 'string') {
              walk(val);
            }
          }
        }
      }
      walk(node);
      return ids;
    }

    // Find single-declarator const declarations with non-literal, side-effect-free inits
    // that don't reference any mutable variables
    const candidates = new Map<string, { value: string }>();

    function findCandidates(node: any): void {
      if (!node || typeof node !== 'object') return;

      if (node.type === 'VariableDeclaration' && node.kind === 'const' &&
          node.declarations?.length === 1) {
        const decl = node.declarations[0];
        if (decl.id?.type === 'Identifier' && decl.init) {
          const init = decl.init;
          const isLiteral = init.type === 'StringLiteral' || init.type === 'Literal' ||
              init.type === 'NumericLiteral' || init.type === 'BooleanLiteral' ||
              init.type === 'NullLiteral';
          if (!isLiteral && isSimpleSideEffectFree(init)) {
            // Check that no identifier in the init is a mutable variable
            const initIds = collectInitIdentifiers(init);
            const referencesMutable = [...initIds].some(id => mutableVars.has(id));
            if (!referencesMutable) {
              const initStart = init.start - offset;
              const initEnd = init.end - offset;
              if (initStart >= 0 && initEnd <= result.length) {
                candidates.set(decl.id.name, {
                  value: result.slice(initStart, initEnd),
                });
              }
            }
          }
        }
      }

      for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
        const val = node[key];
        if (val && typeof val === 'object') {
          if (Array.isArray(val)) {
            for (const item of val) {
              if (item && typeof item.type === 'string') findCandidates(item);
            }
          } else if (typeof val.type === 'string') {
            findCandidates(val);
          }
        }
      }
    }

    findCandidates(parseResult.program);
    if (candidates.size === 0) break;

    // Count references
    const refCounts = new Map<string, number>();
    for (const name of candidates.keys()) refCounts.set(name, 0);

    function countRefs(node: any, parentKey?: string, parentNode?: any): void {
      if (!node || typeof node !== 'object') return;

      if (node.type === 'Identifier' && candidates.has(node.name)) {
        if (parentKey === 'id' && parentNode?.type === 'VariableDeclarator') {
          // skip declaration id
        } else {
          const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
          const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed;
          if (!isPropertyKey && !isMemberProp) {
            refCounts.set(node.name, (refCounts.get(node.name) ?? 0) + 1);
          }
        }
      }

      for (const key of Object.keys(node)) {
        if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
        const val = node[key];
        if (val && typeof val === 'object') {
          if (Array.isArray(val)) {
            for (const item of val) {
              if (item && typeof item.type === 'string') countRefs(item, key, node);
            }
          } else if (typeof val.type === 'string') {
            countRefs(val, key, node);
          }
        }
      }
    }

    countRefs(parseResult.program);

    const toInline = new Map<string, string>();
    const toRemove = new Set<string>();

    for (const [name, info] of candidates) {
      const refs = refCounts.get(name) ?? 0;
      if (refs === 1) {
        toInline.set(name, info.value);
        toRemove.add(name);
      } else if (refs === 0) {
        toRemove.add(name);
      }
    }

    if (toInline.size === 0 && toRemove.size === 0) break;

    if (toInline.size > 0) {
      result = inlineConstCaptures(result, toInline);
    }
    if (toRemove.size > 0) {
      result = removeConstDeclarations(result, toRemove);
    }
  }

  return result;
}

/**
 * Remove const declarations for the given variable names from a body text.
 * Handles surrounding whitespace/newline cleanup.
 */
function removeConstDeclarations(body: string, varNames: Set<string>): string {
  const wrapperPrefix = 'const __rd__ = ';
  const wrappedSource = wrapperPrefix + body;
  const parseResult = parseSync('__rd__.tsx', wrappedSource, RAW_TRANSFER_PARSER_OPTIONS);
  if (!parseResult.program || parseResult.errors?.length) return body;

  const offset = wrapperPrefix.length;
  const removals: Array<{ start: number; end: number }> = [];

  function findDecls(node: any): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'VariableDeclaration' && node.kind === 'const' &&
        node.declarations?.length === 1) {
      const decl = node.declarations[0];
      if (decl.id?.type === 'Identifier' && varNames.has(decl.id.name)) {
        let start = node.start - offset;
        let end = node.end - offset;
        // Consume trailing semicolon and whitespace/newline
        while (end < body.length && (body[end] === ';' || body[end] === ' ' || body[end] === '\t')) end++;
        if (end < body.length && body[end] === '\n') end++;
        // Consume leading whitespace
        while (start > 0 && (body[start - 1] === ' ' || body[start - 1] === '\t')) start--;
        removals.push({ start, end });
      }
    }

    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
      const val = node[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item.type === 'string') findDecls(item);
          }
        } else if (typeof val.type === 'string') {
          findDecls(val);
        }
      }
    }
  }

  findDecls(parseResult.program);

  removals.sort((a, b) => b.start - a.start);
  let result = body;
  for (const r of removals) {
    result = result.slice(0, r.start) + result.slice(r.end);
  }
  return result;
}
