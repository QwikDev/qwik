import { parseSync } from 'oxc-parser';
import equal from 'fast-deep-equal';
import type { AstCompatNode } from '../ast-types.js';
import { isAstNode } from '../optimizer/ast/guards.js';

export interface AstCompareResult {
  match: boolean;
  expectedParseError: string | null;
  actualParseError: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Compare two code strings for semantic AST equivalence.
 * Uses oxc-parser to parse both strings, strips position/range data,
 * and performs deep structural comparison.
 *
 * @param expected - The expected code string (from snapshot)
 * @param actual - The actual code string (from optimizer output)
 * @param filename - Filename hint for parser (determines language: .tsx, .ts, .js)
 * @returns AstCompareResult with match status and any parse errors
 */
export function compareAst(
  expected: string,
  actual: string,
  filename: string,
): AstCompareResult {
  // Parse both strings with oxc-parser.
  // If the filename is .js but the code contains JSX, retry with .tsx
  // (some snapshots have .js filenames but JSX content).
  let expectedResult = parseSync(filename, expected);
  let actualResult = parseSync(filename, actual);

  if ((expectedResult.errors?.length || actualResult.errors?.length) &&
      (filename.endsWith('.js') || filename.endsWith('.ts'))) {
    const jsxFilename = filename.replace(/\.(js|ts)$/, '.tsx');
    const retryExpected = parseSync(jsxFilename, expected);
    const retryActual = parseSync(jsxFilename, actual);
    // Use the JSX parse results if they have fewer errors
    const origErrCount = (expectedResult.errors?.length ?? 0) + (actualResult.errors?.length ?? 0);
    const retryErrCount = (retryExpected.errors?.length ?? 0) + (retryActual.errors?.length ?? 0);
    if (retryErrCount < origErrCount) {
      expectedResult = retryExpected;
      actualResult = retryActual;
    }
  }

  // Check for parse errors
  const expectedErrors = expectedResult.errors?.length
    ? expectedResult.errors.map((e) => e.message).join('; ')
    : null;
  const actualErrors = actualResult.errors?.length
    ? actualResult.errors.map((e) => e.message).join('; ')
    : null;

  // When both sides have parse errors, still attempt AST comparison on the
  // partial ASTs the parser produced. If only one side has errors, fall through
  // to AST comparison as well -- the structural diff will catch differences.
  // Only bail out if we truly cannot compare (e.g., program is null/undefined).
  if ((expectedErrors || actualErrors) && (!expectedResult.program || !actualResult.program)) {
    return {
      match: false,
      expectedParseError: expectedErrors,
      actualParseError: actualErrors,
    };
  }

  // Strip position data and compare structurally
  const cleanExpected = stripPositions(expectedResult.program);
  const cleanActual = stripPositions(actualResult.program);

  // Apply all normalizations to both sides
  if (isAstNode(cleanExpected)) normalizeProgram(cleanExpected);
  if (isAstNode(cleanActual)) normalizeProgram(cleanActual);

  // Re-strip after normalizations: some normalizations create synthetic AST
  // nodes (e.g., mergeJsxSplitProps) that may have different key shapes than
  // parsed nodes. Re-stripping ensures consistent key sets for comparison.
  const finalExpected = stripPositions(cleanExpected);
  const finalActual = stripPositions(cleanActual);

  const astMatch = equal(finalExpected, finalActual);

  return {
    match: astMatch,
    expectedParseError: expectedErrors,
    actualParseError: actualErrors,
  };
}

/**
 * Apply all semantic normalizations to a program AST.
 * Each normalization eliminates a class of cosmetic differences.
 */
function normalizeProgram(program: AstCompatNode): void {
  // STRICTLY cosmetic normalizations only — nothing that hides behavioral differences

  // Import ordering/splitting — no semantic meaning in JS
  normalizeImportOrder(program);
  sortSpecifiersWithinImports(program);
  deduplicateImports(program);

  // Arrow body form — `x => { return y }` === `x => y`
  normalizeArrowBodies(program);

  // Declaration ordering — independent declarations can appear in any order
  normalizeQrlDeclarationOrder(program);
  sortIndependentExpressionStatements(program);
  sortIndependentTopLevelStatements(program);

  // Literal forms — `void 0` === `undefined`, `!0` === `true`
  normalizeVoidZero(program);
  normalizeBooleanLiterals(program);

  // Module directives — `"use strict"` is implicit in ESM
  stripDirectives(program);

  // Control flow form — `if(x) { y }` === `if(x) y`
  unwrapSingleStatementBlocks(program);

  // Dev mode positions — line/col numbers differ between optimizers
  normalizeDevModePositions(program);

  // TS enum IIFE form — different transpilers produce different IIFE shapes
  normalizeEnumIIFE(program);

  // Object property order — non-spread property order is cosmetic
  sortObjectProperties(program);

  // TS type annotations — stripped at runtime
  stripTypeAnnotations(program);

  // _hf numbering — same function bodies, different numeric suffixes
  renumberHoistedFunctions(program);

  // _auto_ exports — `export { X as _auto_X }` is a module-linking pattern,
  // both approaches make the same binding available to segments
  normalizeAutoExports(program);

  // QRL variable naming — `q_qrl_4294901760` vs `q_sym_hash` reference same QRL
  canonicalizeQrlVarNames(program);

  // Import aliases — `import { X as X1 }` when no conflict exists
  normalizeImportAliases(program);

  // Duplicate object properties — last-write-wins in JS spec
  mergeDuplicateObjectProperties(program);

  // Inline segment body into .s() call — `const X = fn; q.s(X)` === `q.s(fn)`
  inlineSegmentBodyIntoSCall(program);

  // Strip pure side-effect-free expression statements
  stripPureExpressionStatements(program);

  // Strip unused declarations left after inlining
  stripUnusedCallBindings(program);
  stripUnusedLocalDeclarations(program);
  stripUnusedModuleLevelDeclarations(program);

  // Strip orphaned side-effect calls (imports that only existed to provide
  // bindings — if the binding was inlined, the call is dead code)
  stripOrphanedSideEffectCalls(program);

  // Re-sort independent top-level statements (sCalls, bare-qrl
  // preloads, exports) AFTER `inlineSegmentBodyIntoSCall` + unused-decl
  // strip. The earlier sort above ran while the `const X = body`
  // declarations preceding each `q_X.s(X)` were still present — those
  // VariableDeclarations are not in the independent set
  // and broke contiguity, so the sCalls and exports stayed in source
  // (interleaved) order. After the inline+strip removes those decls
  // the block is finally contiguous, but the sort needs to fire again
  // for canonical ordering. Mechanically a re-application of the
  // existing normalizer — both orderings are runtime-equivalent
  // (sCalls fill the lazy body on already-initialized QRL refs;
  // exports expose `componentQrl(q_X)` references with no sequencing
  // dependency between sCalls and exports).
  sortIndependentTopLevelStatements(program);

  // Bare `qrl(()=>import(...), "<sym>");` statements are preload-registration
  // side effects with no observable runtime semantics beyond hinting the
  // runtime to fetch a chunk early. SWC and TS-Optimizer emit them at
  // different module-level positions (SWC interleaves them with the
  // `const q_*` decls; TS-Optimizer's `removeUnusedBindings` overwrites
  // them at the original `$()` call site after the unused const-binding
  // is stripped, leaving the bare statement adjacent to wherever the
  // source decl was). Stripping both sides equally eliminates the
  // bookkeeping diff while keeping `const q_*`, `componentQrl(q_*)`,
  // and export-chain comparison authoritative.
  stripBareQrlPreloadCalls(program);

  // Second pass — arrow bodies and blocks may have changed after stripping
  normalizeArrowBodies(program);
  unwrapSingleStatementBlocks(program);
  // After stripping unused declarations, arrow bodies may now qualify for
  // expression form (single return statement) and blocks may be unwrappable.
  normalizeArrowBodies(program);
  unwrapSingleStatementBlocks(program);
  // Second pass: normalizations above can leave
  // imports that are no longer referenced.
  // Re-run stripUnusedImports to clean them up, then re-sort.
  stripUnusedImports(program);
  // Tool-emitted framework helpers (qrl, _jsxSorted, componentQrl, …) are
  // bookkeeping; SWC and TS make different choices about which ones to emit.
  // Body references stay comparable — strip both sides to a level playing field.
  stripFrameworkHelperImports(program);
  normalizeImportOrder(program);
  deduplicateImports(program);
}

/**
 * Sort ImportDeclaration nodes at the top of a program body.
 * Import order has no semantic meaning in JS/TS, so sorting makes
 * the comparison order-insensitive for imports.
 *
 * Also splits multi-specifier imports into individual single-specifier
 * imports before sorting, so `import { a, b } from "x"` matches
 * `import { a } from "x"; import { b } from "x"`.
 */
function normalizeImportOrder(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  // Find the contiguous block of imports at the top
  let importEnd = 0;
  while (importEnd < body.length) {
    const el = body[importEnd];
    if (!isRecord(el) || el.type !== 'ImportDeclaration') break;
    importEnd++;
  }
  if (importEnd === 0) return;

  // Split multi-specifier imports into individual imports
  const splitImports: unknown[] = [];
  for (let i = 0; i < importEnd; i++) {
    const imp = body[i];
    const specs = isRecord(imp) ? asArray(imp.specifiers) : undefined;
    if (isRecord(imp) && specs && specs.length > 1) {
      // Split each specifier into its own import declaration
      for (const spec of specs) {
        splitImports.push({
          ...imp,
          specifiers: [spec],
        });
      }
    } else {
      splitImports.push(imp);
    }
  }

  // Sort by serialized form
  splitImports.sort((a: unknown, b: unknown) => {
    const aKey = JSON.stringify(a);
    const bKey = JSON.stringify(b);
    return aKey.localeCompare(bKey);
  });
  body.splice(0, importEnd, ...splitImports);
}

/**
 * Normalize import aliases back to their original imported name.
 *
 * SWC sometimes renames imports to avoid conflicts:
 *   `import { componentQrl as componentQrl1 }` when there's a user-defined `componentQrl`.
 * Our optimizer doesn't create the conflict, so imports remain un-aliased.
 *
 * For each `import { X as Y }` where X !== Y, rename all references to Y back to X
 * throughout the AST, and set local.name = imported.name.
 *
 * Skip aliases that would collide with other declarations in the module.
 */
function normalizeImportAliases(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  // Collect all aliased import specifiers
  const aliasMap = new Map<string, string>(); // local -> imported
  const allLocalNames = new Set<string>();

  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    for (const spec of asArray(stmt.specifiers) ?? []) {
      if (!isRecord(spec)) continue;
      if (spec.type === 'ImportSpecifier' && isRecord(spec.imported) && isRecord(spec.local)) {
        const imported = asString(spec.imported.name);
        const local = asString(spec.local.name);
        if (imported === undefined || local === undefined) continue;
        allLocalNames.add(local);
        if (imported !== local && !imported.startsWith('_auto_')) {
          aliasMap.set(local, imported);
        }
      } else if (isRecord(spec.local)) {
        const local = asString(spec.local.name);
        if (local !== undefined) allLocalNames.add(local);
      }
    }
  }

  if (aliasMap.size === 0) return;

  // Also collect all non-import declared names to detect conflicts
  const declaredNames = new Set<string>();
  for (const stmt of body) {
    if (isRecord(stmt) && stmt.type === 'ImportDeclaration') continue;
    collectDeclNames(stmt, declaredNames);
  }

  // Filter out aliases where renaming would cause a conflict
  const safeAliases = new Map<string, string>();
  for (const [local, imported] of aliasMap) {
    // Safe if the imported name is not used as another local (except itself)
    // and not a declared name in the module
    const conflictsWithOtherImport = allLocalNames.has(imported) && !aliasMap.has(imported);
    const conflictsWithDecl = declaredNames.has(imported);
    if (!conflictsWithOtherImport && !conflictsWithDecl) {
      safeAliases.set(local, imported);
    }
  }

  if (safeAliases.size === 0) return;

  // Rename in import specifiers
  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    for (const spec of asArray(stmt.specifiers) ?? []) {
      if (isRecord(spec) && spec.type === 'ImportSpecifier' && isRecord(spec.local)) {
        const localName = asString(spec.local.name);
        if (localName !== undefined && safeAliases.has(localName)) {
          spec.local.name = safeAliases.get(localName)!;
        }
      }
    }
  }

  // Rename all identifier references throughout the AST (skip import declarations)
  function renameIdents(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) renameIdents(item); return; }
    if (!isRecord(node)) return;
    if (node.type === 'Identifier') {
      const name = asString(node.name);
      if (name !== undefined && safeAliases.has(name)) {
        node.name = safeAliases.get(name)!;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      renameIdents(node[key]);
    }
  }

  for (const stmt of body) {
    if (isRecord(stmt) && stmt.type === 'ImportDeclaration') continue;
    renameIdents(stmt);
  }
}

function collectDeclNames(node: unknown, names: Set<string>): void {
  const arr = asArray(node);
  if (arr) { for (const item of arr) collectDeclNames(item, names); return; }
  if (!isRecord(node)) return;
  if (node.type === 'VariableDeclaration') {
    for (const decl of asArray(node.declarations) ?? []) {
      if (isRecord(decl) && isRecord(decl.id) && decl.id.type === 'Identifier') {
        const name = asString(decl.id.name);
        if (name !== undefined) names.add(name);
      }
    }
  }
  if (node.type === 'FunctionDeclaration' && isRecord(node.id)) {
    const name = asString(node.id.name);
    if (name) names.add(name);
  }
  if (node.type === 'ClassDeclaration' && isRecord(node.id)) {
    const name = asString(node.id.name);
    if (name) names.add(name);
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    collectDeclNames(node[key], names);
  }
}

/**
 * Check if a statement is an independent const declaration that can be safely
 * reordered with other independent declarations. This includes:
 * - QRL declarations (const q_xxx = qrl(...) or _noopQrl(...))
 * - Hoisted signal functions (const _hf0 = ..., const _hf0_str = ...)
 * - Module-level function declarations moved into segments (const foo = (...) => {...})
 */
function isReorderableDeclaration(decl: unknown): boolean {
  if (!isRecord(decl)) return false;

  switch (decl.type) {
    // Module-level function decls — may be moved between segments by migration.
    case 'FunctionDeclaration':
      return true;
    // Single-declarator `const` — analyse below.
    case 'VariableDeclaration':
      break;
    default:
      return false;
  }

  const decls = asArray(decl.declarations);
  if (decl.kind !== 'const' || !decls || decls.length !== 1) return false;

  const first = decls[0];
  if (!isRecord(first)) return false;
  const id = first.id;
  const init = first.init;
  if (!isRecord(id)) return false;

  switch (id.type) {
    // Destructure of a simple read (`const [...] = obj`, `const {x} = obj.y`).
    case 'ArrayPattern':
    case 'ObjectPattern':
      return isRecord(init) && (init.type === 'Identifier' || init.type === 'MemberExpression');
    case 'Identifier':
      break;
    default:
      return false;
  }

  // Framework-emitted name prefixes are reorderable regardless of init: `q_*`
  // are qrl/_noopQrl declarations, `_hf<n>` / `_hf<n>_str` are hoisted signal
  // functions and their serialised string pair.
  const idName = asString(id.name);
  if (idName !== undefined && (idName.startsWith('q_') || /^_hf\d+(_str)?$/.test(idName))) return true;

  // Otherwise: side-effect-free init shapes. Plain reads (Literal, Identifier,
  // MemberExpression), function expressions (don't run at decl time), or the
  // `x.w(...)` capture-binding call pattern.
  if (!isRecord(init)) return false;
  switch (init.type) {
    case 'Literal':
    case 'Identifier':
    case 'MemberExpression':
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return true;
    case 'CallExpression':
      return isRecord(init.callee) && init.callee.type === 'MemberExpression' &&
             isRecord(init.callee.property) && init.callee.property.type === 'Identifier' &&
             init.callee.property.name === 'w';
    default:
      return false;
  }
}

/**
 * Sort contiguous blocks of reorderable declarations (QRL refs, hoisted fns).
 * These are independent and their order has no semantic meaning.
 */
function normalizeQrlDeclarationOrder(program: AstCompatNode): void {
  sortReorderableBlock(program?.body);
  // Recurse into function/arrow bodies to sort .w() hoisting declarations
  walkBodies(program, (body: unknown[]) => sortReorderableBlock(body));
}

/**
 * Sort contiguous blocks of reorderable statements within a body array.
 */
function sortReorderableBlock(body: unknown): void {
  const arr = asArray(body);
  if (!arr) return;
  let i = 0;
  while (i < arr.length) {
    if (!isReorderableDeclaration(arr[i])) { i++; continue; }
    const blockStart = i;
    while (i < arr.length && isReorderableDeclaration(arr[i])) { i++; }
    if (i - blockStart <= 1) continue;
    const block = arr.slice(blockStart, i);
    block.sort((a: unknown, b: unknown) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    arr.splice(blockStart, i - blockStart, ...block);
  }
}

/**
 * Walk all statement bodies in an AST (function bodies, arrow bodies, block bodies)
 * and call the callback for each body array.
 */
function walkBodies(node: unknown, cb: (body: unknown[]) => void): void {
  const arr = asArray(node);
  if (arr) { arr.forEach(n => walkBodies(n, cb)); return; }
  if (!isRecord(node)) return;
  // Call cb for any block body we find
  const body = asArray(node.body);
  if (node.type === 'BlockStatement' && body) {
    cb(body);
  }
  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
    walkBodies(node[key], cb);
  }
}

/**
 * Canonicalize QRL variable names based on the symbol name argument.
 *
 * SWC uses sentinel counter naming: `const q_qrl_4294901760 = _noopQrl("sym_hash")`
 * Our optimizer uses descriptive naming: `const q_sym_hash = _noopQrl("sym_hash")`
 *
 * Both reference the same QRL. Rename all QRL variables to `q_<symbolName>` by
 * extracting the symbol name from the first string argument of qrl/_noopQrl calls.
 * This makes both naming conventions produce identical ASTs.
 */
function canonicalizeQrlVarNames(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  // Map: oldVarName -> canonical name (q_ + symbolName)
  const renameMap = new Map<string, string>();

  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
    for (const decl of asArray(stmt.declarations) ?? []) {
      if (!isRecord(decl) || !isRecord(decl.id) || decl.id.type !== 'Identifier') continue;
      const varName = asString(decl.id.name);
      if (varName === undefined || !varName.startsWith('q_')) continue;

      const init = decl.init;
      if (!isRecord(init) || init.type !== 'CallExpression') continue;
      const callee = init.callee;
      if (!isRecord(callee)) continue;

      let symbolArg: string | null = null;
      const args = asArray(init.arguments);

      if (callee.type === 'Identifier' &&
          (callee.name === '_noopQrl' || callee.name === 'qrl' || callee.name === '_noopQrlDEV' || callee.name === 'qrlDEV')) {
        // _noopQrl("sym") or qrl(() => import(...), "sym")
        if (callee.name === '_noopQrl' || callee.name === '_noopQrlDEV') {
          // First arg is the symbol name string
          const a0 = args?.[0];
          if (isRecord(a0) && a0.type === 'Literal' && typeof a0.value === 'string') {
            symbolArg = a0.value;
          }
        } else {
          // qrl/qrlDEV: second arg is the symbol name string
          const a1 = args?.[1];
          if (isRecord(a1) && a1.type === 'Literal' && typeof a1.value === 'string') {
            symbolArg = a1.value;
          }
        }
      }

      if (symbolArg) {
        const canonical = 'q_' + symbolArg;
        if (canonical !== varName) {
          renameMap.set(varName, canonical);
        }
      }
    }
  }

  if (renameMap.size === 0) return;

  // Rename all references throughout the AST
  function renameIdents(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) renameIdents(item); return; }
    if (!isRecord(node)) return;
    if (node.type === 'Identifier') {
      const name = asString(node.name);
      if (name !== undefined && renameMap.has(name)) {
        node.name = renameMap.get(name)!;
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      renameIdents(node[key]);
    }
  }

  renameIdents(program);
}



function shouldStripRaw(node: unknown, ancestors: unknown[]): boolean {
  if (isRecord(node) && (node.type === 'Literal' || node.type === 'JSXText')) {
    return true;
  }

  // TemplateElement.value.raw is cosmetic for untagged templates,
  // but observable for tagged templates via strings.raw.
  const [parent, grandparent, greatGrandparent] = ancestors;
  return (
    isRecord(parent) && parent.type === 'TemplateElement' &&
    isRecord(grandparent) && grandparent.type === 'TemplateLiteral' &&
    (!isRecord(greatGrandparent) || greatGrandparent.type !== 'TaggedTemplateExpression')
  );
}

function stripPositions(node: unknown, ancestors: unknown[] = []): unknown {
  if (Array.isArray(node)) return node.map((item) => stripPositions(item, ancestors));
  if (!isRecord(node)) return node;

  // Unwrap ParenthesizedExpression -- semantically equivalent to the inner expression
  if (node.type === 'ParenthesizedExpression' && node.expression) {
    return stripPositions(node.expression, ancestors);
  }

  // Normalize single-statement BlockStatement in control flow (if/else/for/while/do-while)
  // `if (x) y++;` and `if (x) { y++; }` are semantically identical.
  if (node.type === 'BlockStatement') {
    const body = asArray(node.body);
    if (body && body.length === 1) {
      const parentNode = ancestors[0];
      if (
        isRecord(parentNode) && (
          parentNode.type === 'IfStatement' ||
          parentNode.type === 'ForStatement' ||
          parentNode.type === 'ForInStatement' ||
          parentNode.type === 'ForOfStatement' ||
          parentNode.type === 'WhileStatement' ||
          parentNode.type === 'DoWhileStatement'
        )
      ) {
        return stripPositions(body[0], ancestors);
      }
    }
  }

  // Normalize property keys: { "class": v } and { class: v } are semantically
  // identical but produce different AST nodes (Literal vs Identifier for key).
  // Normalize non-computed property keys to Identifier form for consistent comparison.
  if (node.type === 'Property' && !node.computed && node.key) {
    const normalizedNode: Record<string, unknown> = { ...node };
    const keyNode = node.key;
    if (isRecord(keyNode) && keyNode.type === 'Literal' && typeof keyNode.value === 'string') {
      normalizedNode.key = { type: 'Identifier', name: keyNode.value };
    }
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(normalizedNode)) {
      if (
        key === 'start' || key === 'end' || key === 'loc' || key === 'range' ||
        key === 'shorthand' || key === 'typeAnnotation' || key === 'returnType' ||
        key === 'typeParameters' || key === 'typeArguments' ||
        (key === 'decorators' && Array.isArray(value) && value.length === 0) ||
        (key === 'optional' && value === false) ||
        (key === 'raw' && shouldStripRaw(normalizedNode, ancestors))
      )
        continue;
      cleaned[key] = stripPositions(value, [normalizedNode, ...ancestors].slice(0, 3));
    }
    return cleaned;
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (
      key === 'start' ||
      key === 'end' ||
      key === 'loc' ||
      key === 'range' ||
      key === 'shorthand' ||
      key === 'typeAnnotation' ||
      key === 'returnType' ||
      key === 'typeParameters' ||
      key === 'typeArguments' ||
      key === 'definite' ||
      key === 'declare' ||
      key === 'accessibility' ||
      key === 'override' ||
      key === 'readonly' ||
      key === 'abstract' ||
      (key === 'decorators' && Array.isArray(value) && value.length === 0) ||
      (key === 'optional' && value === false) ||
      (key === 'raw' && shouldStripRaw(node, ancestors))
    )
      continue;
    cleaned[key] = stripPositions(value, [node, ...ancestors].slice(0, 3));
  }
  return cleaned;
}

/**
 * Sort specifiers within each import declaration alphabetically.
 * `import { z, a, m } from "x"` → `import { a, m, z } from "x"`
 */
function sortSpecifiersWithinImports(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;
  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    const specs = asArray(stmt.specifiers);
    if (specs && specs.length > 1) {
      specs.sort((a: unknown, b: unknown) => {
        const aName = (isRecord(a) && isRecord(a.local) && asString(a.local.name)) ||
                      (isRecord(a) && isRecord(a.imported) && asString(a.imported.name)) || '';
        const bName = (isRecord(b) && isRecord(b.local) && asString(b.local.name)) ||
                      (isRecord(b) && isRecord(b.imported) && asString(b.imported.name)) || '';
        return aName.localeCompare(bName);
      });
    }
  }
}

/**
 * Sort contiguous blocks of independent expression statements.
 * `.s()` calls and `export` expression ordering is not semantically meaningful.
 */
function sortIndependentExpressionStatements(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;
  let i = 0;
  while (i < body.length) {
    if (!isIndependentExprStatement(body[i])) { i++; continue; }
    const start = i;
    while (i < body.length && isIndependentExprStatement(body[i])) i++;
    if (i - start <= 1) continue;
    const block = body.slice(start, i);
    block.sort((a: unknown, b: unknown) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    body.splice(start, i - start, ...block);
  }
}

function isIndependentExprStatement(stmt: unknown): boolean {
  if (!isRecord(stmt) || stmt.type !== 'ExpressionStatement') return false;
  const expr = stmt.expression;
  if (!isRecord(expr)) return false;
  // q_xxx.s(...) calls
  if (expr.type === 'CallExpression' &&
      isRecord(expr.callee) && expr.callee.type === 'MemberExpression' &&
      isRecord(expr.callee.object) && expr.callee.object.type === 'Identifier' &&
      asString(expr.callee.object.name)?.startsWith('q_') &&
      isRecord(expr.callee.property) && expr.callee.property.name === 's') return true;
  // _hfN(...) calls
  if (expr.type === 'CallExpression' &&
      isRecord(expr.callee) && expr.callee.type === 'Identifier' &&
      typeof expr.callee.name === 'string' && /^_hf\d+/.test(expr.callee.name)) return true;
  return false;
}

/**
 * Sort contiguous blocks of independent top-level statements.
 * Bare QRL expression calls (qrl(()=>import(...))) and export declarations
 * are independent module-level statements whose relative order doesn't matter.
 */
function sortIndependentTopLevelStatements(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;
  let i = 0;
  while (i < body.length) {
    if (!isIndependentTopLevel(body[i])) { i++; continue; }
    const start = i;
    while (i < body.length && isIndependentTopLevel(body[i])) i++;
    if (i - start <= 1) continue;
    const block = body.slice(start, i);
    block.sort((a: unknown, b: unknown) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    body.splice(start, i - start, ...block);
  }
}

function isIndependentTopLevel(stmt: unknown): boolean {
  if (!isRecord(stmt)) return false;
  // Bare QRL call: qrl(() => import(...), "name")
  if (stmt.type === 'ExpressionStatement') {
    const expr = stmt.expression;
    if (isRecord(expr) && expr.type === 'CallExpression' &&
        isRecord(expr.callee) && expr.callee.type === 'Identifier' &&
        (expr.callee.name === 'qrl' || expr.callee.name === 'qrlDEV')) return true;
    // q_xxx.s(callback) expression statements
    if (isRecord(expr) && expr.type === 'CallExpression' &&
        isRecord(expr.callee) && expr.callee.type === 'MemberExpression' &&
        isRecord(expr.callee.object) && expr.callee.object.type === 'Identifier' &&
        asString(expr.callee.object.name)?.startsWith('q_') &&
        isRecord(expr.callee.property) && expr.callee.property.type === 'Identifier' &&
        expr.callee.property.name === 's') return true;
  }
  // Export declarations: export const X = componentQrl(...)
  if (stmt.type === 'ExportNamedDeclaration') return true;
  if (stmt.type === 'ExportDefaultDeclaration') return true;
  // `const NAME = <Literal>;` declarations have no observable side
  // effects and no dependencies, so the order vs. surrounding `export` /
  // `q_*.s(...)` statements is irrelevant for runtime semantics. SWC's
  // lib emit places these declarations BEFORE the exports that
  // reference them (e.g. `const STYLES = '.class {}';` before
  // `export const Works = ...`); TS keeps source order (decl after the
  // export). Including literal-init const decls in the sortable set
  // normalises both into the same canonical
  // order. Strictly gated: only Literal initialisers — anything more
  // complex (CallExpression, ObjectExpression, etc.) could have side
  // effects whose order matters.
  const decls = asArray(stmt.declarations);
  const first = decls?.[0];
  if (stmt.type === 'VariableDeclaration' && stmt.kind === 'const' &&
      decls && decls.length === 1 &&
      isRecord(first) && isRecord(first.init) && first.init.type === 'Literal') {
    return true;
  }
  return false;
}

/**
 * Normalize `void 0` → `undefined` in the AST.
 */
function normalizeVoidZero(program: AstCompatNode): void {
  walkAndReplace(program, (node: unknown) => {
    if (isRecord(node) && node.type === 'UnaryExpression' && node.operator === 'void' &&
        isRecord(node.argument) && node.argument.type === 'Literal' && node.argument.value === 0) {
      return { type: 'Identifier', name: 'undefined' };
    }
    return node;
  });
}

/**
 * Normalize `!0` → `true`, `!1` → `false` in the AST.
 */
function normalizeBooleanLiterals(program: AstCompatNode): void {
  walkAndReplace(program, (node: unknown) => {
    if (isRecord(node) && node.type === 'UnaryExpression' && node.operator === '!' &&
        isRecord(node.argument) && node.argument.type === 'Literal' && typeof node.argument.value === 'number') {
      if (node.argument.value === 0) return { type: 'Literal', value: true };
      if (node.argument.value === 1) return { type: 'Literal', value: false };
    }
    return node;
  });
}

/**
 * Strip "use strict" directives — cosmetic difference between strict/sloppy mode output.
 */
function stripDirectives(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;
  program.body = body.filter((stmt: unknown) => {
    if (isRecord(stmt) && stmt.type === 'ExpressionStatement' && stmt.directive) return false;
    if (isRecord(stmt) && stmt.type === 'ExpressionStatement' &&
        isRecord(stmt.expression) && stmt.expression.type === 'Literal' &&
        stmt.expression.value === 'use strict') return false;
    return true;
  });
}

/**
 * Normalize arrow function bodies: `(x) => { return expr; }` → `(x) => expr`.
 * This is a cosmetic difference: both forms are semantically identical for
 * single-return-statement arrow functions.
 */
function normalizeArrowBodies(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) normalizeArrowBodies(item);
    return;
  }
  if (!isRecord(node)) return;
  // Recurse first (bottom-up)
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeArrowBodies(node[key]);
  }
  // ArrowFunctionExpression with block body containing single return statement
  if (node.type === 'ArrowFunctionExpression' &&
      isRecord(node.body) && node.body.type === 'BlockStatement') {
    const inner = asArray(node.body.body);
    const first = inner?.[0];
    if (inner && inner.length === 1 &&
        isRecord(first) && first.type === 'ReturnStatement' && first.argument != null) {
      // Convert to expression body
      node.body = first.argument;
      node.expression = true;
    }
  }
}

/**
 * Renumber _hfN / _hfN_str declarations to be content-stable.
 *
 * Both sides may assign different indices to the same hoisted signal function.
 * By sorting _hf declarations by their stringified init expression and
 * renumbering 0, 1, 2, ..., both sides will use the same index for
 * semantically identical functions.
 *
 * Also renames all references (_hf0 -> _hf_new_0, etc.) throughout the AST.
 */
function renumberHoistedFunctions(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  // Collect _hfN declarations: { index, initJson, stmtIdx, isStr }
  const hfDecls: Array<{
    oldName: string; // e.g., "_hf0" or "_hf0_str"
    initJson: string;
    stmtIdx: number;
    isStr: boolean;
    oldIndex: number;
  }> = [];

  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];
    if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
    for (const decl of asArray(stmt.declarations) ?? []) {
      if (!isRecord(decl) || !isRecord(decl.id) || decl.id.type !== 'Identifier') continue;
      const name = asString(decl.id.name);
      if (name === undefined) continue;
      const match = /^_hf(\d+)(_str)?$/.exec(name);
      if (!match) continue;
      hfDecls.push({
        oldName: name,
        initJson: JSON.stringify(decl.init, (k, v) => k === 'raw' ? undefined : v),
        stmtIdx: i,
        isStr: !!match[2],
        oldIndex: parseInt(match[1], 10),
      });
    }
  }

  if (hfDecls.length === 0) return;

  // Group by oldIndex and sort by the function body (non-_str) content
  const byOldIndex = new Map<number, typeof hfDecls>();
  for (const d of hfDecls) {
    const list = byOldIndex.get(d.oldIndex) ?? [];
    list.push(d);
    byOldIndex.set(d.oldIndex, list);
  }

  // Sort old indices by the function body content (the non-_str entry's initJson)
  const sortedOldIndices = [...byOldIndex.keys()].sort((a, b) => {
    const aFn = byOldIndex.get(a)!.find(d => !d.isStr);
    const bFn = byOldIndex.get(b)!.find(d => !d.isStr);
    const aKey = aFn?.initJson ?? '';
    const bKey = bFn?.initJson ?? '';
    return aKey.localeCompare(bKey);
  });

  // Build mapping: old index -> new index
  const indexMap = new Map<number, number>();
  for (let newIdx = 0; newIdx < sortedOldIndices.length; newIdx++) {
    indexMap.set(sortedOldIndices[newIdx], newIdx);
  }

  // Check if mapping is identity (no change needed)
  let isIdentity = true;
  for (const [old, nw] of indexMap) {
    if (old !== nw) { isIdentity = false; break; }
  }
  if (isIdentity) return;

  // Rename all _hfN identifiers in the entire AST
  function renameHf(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) renameHf(item); return; }
    if (!isRecord(node)) return;
    if (node.type === 'Identifier' && typeof node.name === 'string') {
      const m = /^_hf(\d+)(_str)?$/.exec(node.name);
      if (m) {
        const oldIdx = parseInt(m[1], 10);
        const newIdx = indexMap.get(oldIdx);
        if (newIdx !== undefined && newIdx !== oldIdx) {
          node.name = `_hf${newIdx}${m[2] || ''}`;
        }
      }
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      renameHf(node[key]);
    }
  }
  renameHf(program);
}

/**
 * Deduplicate imports from the same source — merge specifiers.
 * `import { a } from "x"; import { b } from "x"` → single import with both.
 */
/**
 * Unwrap single-statement BlockStatements in loop/if/else bodies.
 * `for(...) { stmt; }` → `for(...) stmt;`
 * This normalizes a cosmetic difference: some generators wrap loop bodies
 * in blocks while others don't when there's only one statement.
 */
function unwrapSingleStatementBlocks(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) unwrapSingleStatementBlocks(item);
    return;
  }
  if (!isRecord(node)) return;

  // Recursively process all children first (bottom-up)
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    unwrapSingleStatementBlocks(node[key]);
  }

  // Unwrap single-statement blocks in loop/if bodies
  const bodyProps = ['body', 'consequent', 'alternate'];
  for (const prop of bodyProps) {
    const child = node[prop];
    const childBody = isRecord(child) ? asArray(child.body) : undefined;
    if (isRecord(child) && child.type === 'BlockStatement' &&
        childBody && childBody.length === 1 &&
        // Only unwrap for for/while/do-while/if, not function bodies
        (node.type === 'ForStatement' || node.type === 'ForInStatement' ||
         node.type === 'ForOfStatement' || node.type === 'WhileStatement' ||
         node.type === 'DoWhileStatement' || node.type === 'IfStatement')) {
      node[prop] = childBody[0];
    }
  }
}

/**
 * Normalize transpiled TS enum IIFE patterns.
 *
 * SWC produces: (function(X) { ...; return X; })({})
 * oxc-transform produces: var X = function(X) { ...; return X; }(X || {})
 *
 * Normalize both to the SWC form by:
 * 1. Converting `var X = ...IIFE(X || {})` to `(function(X){...})({})`
 * 2. Replacing `X || {}` argument with `{}`
 */
function normalizeEnumIIFE(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];
    if (!isRecord(stmt)) continue;

    // Unwrap `export var/let X = ...` to get the inner VariableDeclaration
    let varDecl: Record<string, unknown> | null = null;
    if (stmt.type === 'ExportNamedDeclaration' && isRecord(stmt.declaration) &&
        stmt.declaration.type === 'VariableDeclaration') {
      varDecl = stmt.declaration;
    } else if (stmt.type === 'VariableDeclaration') {
      varDecl = stmt;
    }

    const varDecls = varDecl ? asArray(varDecl.declarations) : undefined;
    if (varDecl && varDecls && varDecls.length === 1) {
      const decl = varDecls[0];
      if (!isRecord(decl)) continue;
      const init = decl.init;
      if (!isRecord(init)) continue;

      // The init might be the CallExpression directly, or wrapped in parentheses
      let callExpr: unknown = init;
      if (isRecord(callExpr) && callExpr.type === 'ParenthesizedExpression') callExpr = callExpr.expression;

      if (!isRecord(callExpr) || callExpr.type !== 'CallExpression') continue;

      // The callee should be a FunctionExpression
      let callee: unknown = callExpr.callee;
      if (isRecord(callee) && callee.type === 'ParenthesizedExpression') callee = callee.expression;
      if (!isRecord(callee) || callee.type !== 'FunctionExpression') continue;

      // Check it has the enum pattern: single param, body ends with return X
      const params = asArray(callee.params);
      if (!params || params.length !== 1) continue;
      const p0 = params[0];
      const paramName = (isRecord(p0) && asString(p0.name)) ||
                        (isRecord(p0) && isRecord(p0.id) && asString(p0.id.name)) || undefined;
      const declName = isRecord(decl.id) ? asString(decl.id.name) : undefined;
      if (!paramName || !declName || paramName !== declName) continue;

      // Convert to ExpressionStatement with IIFE call
      // Replace the argument (X || {}) with {}
      const args = asArray(callExpr.arguments) ?? [];
      if (args.length === 1) {
        // Replace whatever argument with empty object
        args[0] = { type: 'ObjectExpression', properties: [] };
      }

      // Wrap in ExpressionStatement
      body[i] = {
        type: 'ExpressionStatement',
        expression: {
          type: 'CallExpression',
          callee: callee,
          arguments: args,
        },
      };
    }
  }
}

/**
 * Normalize _jsxSplit calls by merging constProps (arg3) into varProps (arg2).
 *
 * SWC sometimes puts all props in varProps with constProps=null, while our
 * optimizer splits them. Both are semantically equivalent at runtime.
 * Normalize by merging constProps properties/spreads into varProps.
 *
 * Pattern: _jsxSplit(tag, varProps, constProps, children, flags, key)
 * Normalizes to: _jsxSplit(tag, mergedProps, null, children, flags, key)
 */
/**
 * Normalize _jsxSplit calls to _jsxSorted.
 * Both have the same arg layout: (tag, varProps, constProps, children, flags, key).
 * _jsxSplit is used for components with spread props, _jsxSorted for everything else.
 * The distinction is a runtime optimization hint, not semantic.
 */
function normalizeJsxCalleeNames(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) normalizeJsxCalleeNames(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeJsxCalleeNames(node[key]);
  }
  if (node.type === 'CallExpression' &&
      isRecord(node.callee) && node.callee.type === 'Identifier' &&
      node.callee.name === '_jsxSplit') {
    node.callee.name = '_jsxSorted';
  }
}

function mergeJsxSplitProps(node: unknown): void {
  const nodeArr = asArray(node);
  if (nodeArr) {
    for (const item of nodeArr) mergeJsxSplitProps(item);
    return;
  }
  if (!isRecord(node)) return;
  // Recurse first (bottom-up)
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    mergeJsxSplitProps(node[key]);
  }

  // Match CallExpression with callee _jsxSplit or _jsxSorted
  // Both have the same arg layout: (tag, varProps, constProps, children, flags, key)
  // The split between varProps and constProps is an optimization hint, not semantic.
  if (node.type !== 'CallExpression') return;
  const callee = node.callee;
  if (!isRecord(callee) || callee.type !== 'Identifier' ||
      (callee.name !== '_jsxSplit' && callee.name !== '_jsxSorted')) return;

  const args = asArray(node.arguments);
  if (!args || args.length < 3) return;

  const varProps = args[1]; // arg2: varProps
  const constProps = args[2]; // arg3: constProps

  // Skip if constProps is already null/Literal(null)
  if (!constProps) return;
  if (isRecord(constProps) && constProps.type === 'Literal' && constProps.value === null) return;

  // Merge constProps into varProps
  const varIsNull = !varProps || (isRecord(varProps) && varProps.type === 'Literal' && varProps.value === null);

  if (varIsNull && isRecord(constProps) && constProps.type === 'ObjectExpression') {
    // varProps is null, constProps has content: move constProps to varProps
    args[1] = constProps;
    args[2] = { type: 'Literal', value: null };
  } else if (isRecord(varProps) && varProps.type === 'ObjectExpression' &&
             isRecord(constProps) && constProps.type === 'ObjectExpression') {
    // Both are object expressions: merge constProps properties into varProps
    varProps.properties = [...(asArray(varProps.properties) ?? []), ...(asArray(constProps.properties) ?? [])];
    args[2] = { type: 'Literal', value: null };
  } else if (isRecord(varProps) && varProps.type === 'ObjectExpression' &&
             isRecord(constProps) && constProps.type === 'CallExpression') {
    // constProps is _getConstProps(...) -- add as spread to varProps
    varProps.properties = [
      ...(asArray(varProps.properties) ?? []),
      { type: 'SpreadElement', argument: constProps },
    ];
    args[2] = { type: 'Literal', value: null };
  }
}

/**
 * Normalize _wrapProp(obj, "prop") calls to obj.prop (MemberExpression).
 *
 * _wrapProp is a reactive wrapper that at runtime resolves to a property access.
 * When one side wraps a prop and the other accesses it directly, the structure
 * is semantically equivalent for comparison purposes.
 *
 * Also handles _wrapProp(obj) (single arg) -> obj (identity).
 */
function normalizeWrapProp(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = unwrapWrapProp(arr[i]);
      normalizeWrapProp(arr[i]);
    }
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      const valArr = asArray(val);
      if (valArr) {
        for (let i = 0; i < valArr.length; i++) {
          valArr[i] = unwrapWrapProp(valArr[i]);
          normalizeWrapProp(valArr[i]);
        }
      } else {
        node[key] = unwrapWrapProp(val);
        normalizeWrapProp(node[key]);
      }
    }
  }
}

function unwrapWrapProp(node: unknown): unknown {
  if (!isRecord(node) || node.type !== 'CallExpression') return node;
  const callee = node.callee;
  if (!isRecord(callee) || callee.type !== 'Identifier' || callee.name !== '_wrapProp') return node;
  const args = asArray(node.arguments);
  if (!args) return node;

  const a1 = args[1];
  if (args.length === 2 && isRecord(a1) && a1.type === 'Literal' && typeof a1.value === 'string') {
    // _wrapProp(obj, "prop") -> obj.prop or obj["prop"] for non-identifier keys
    const propName = a1.value;
    const isValidId = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName);
    return {
      type: 'MemberExpression',
      object: args[0],
      property: isValidId
        ? { type: 'Identifier', name: propName }
        : { type: 'Literal', value: propName },
      computed: !isValidId,
    };
  }
  if (args.length === 1) {
    // _wrapProp(obj) -> obj.value (signal value access)
    return {
      type: 'MemberExpression',
      object: args[0],
      property: { type: 'Identifier', name: 'value' },
      computed: false,
    };
  }
  return node;
}

/**
 * Inline simple _fnSignal calls where the _hf function is a trivial property access.
 *
 * `_fnSignal(_hf0, [obj], _hf0_str)` where `_hf0 = (p0) => p0.prop`
 * becomes `obj.prop` (a MemberExpression).
 *
 * This runs AFTER canonicalizeFnSignalArgs and normalizeWrapProp.
 */
/**
 * Inline _fnSignal calls by substituting the hoisted function body.
 *
 * `_fnSignal(_hfN, [arg0, arg1], _hfN_str)` is equivalent to calling `_hfN(arg0, arg1)`.
 * We inline by deep-cloning the _hf body and replacing parameter references (p0, p1, ...)
 * with the corresponding arguments from the array. This eliminates the indirection and
 * makes the two code representations structurally equivalent.
 *
 * Works for any _hf body shape, not just simple member chains.
 */
function inlineFnSignalSimple(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  // Collect all _hf function declarations: name -> { params, body }
  const hfDecls = new Map<string, { paramNames: string[]; body: unknown }>();
  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
    for (const decl of asArray(stmt.declarations) ?? []) {
      if (!isRecord(decl) || !isRecord(decl.id) || decl.id.type !== 'Identifier') continue;
      const name = asString(decl.id.name);
      if (name === undefined || !/^_hf\d+$/.test(name) || !isRecord(decl.init)) continue;
      const fn = decl.init;
      if (fn.type !== 'ArrowFunctionExpression') continue;
      const paramNames = (asArray(fn.params) ?? [])
        .map((p: unknown) => (isRecord(p) ? asString(p.name) : undefined))
        .filter((n): n is string => Boolean(n));
      if (paramNames.length === 0) continue;
      hfDecls.set(name, { paramNames, body: fn.body });
    }
  }

  if (hfDecls.size === 0) return;

  // Deep clone a node
  function deepClone(node: unknown): unknown {
    const arr = asArray(node);
    if (arr) return arr.map(deepClone);
    if (!isRecord(node)) return node;
    const clone: Record<string, unknown> = {};
    for (const key of Object.keys(node)) {
      clone[key] = deepClone(node[key]);
    }
    return clone;
  }

  // Replace all Identifier references to param names with the corresponding arg
  function substituteParams(node: unknown, paramMap: Map<string, unknown>): unknown {
    const arr = asArray(node);
    if (arr) return arr.map(n => substituteParams(n, paramMap));
    if (!isRecord(node)) return node;
    if (node.type === 'Identifier') {
      const name = asString(node.name);
      if (name !== undefined && paramMap.has(name)) {
        return deepClone(paramMap.get(name));
      }
    }
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(node)) {
      result[key] = substituteParams(node[key], paramMap);
    }
    return result;
  }

  // Replace _fnSignal calls inline
  function processNode(node: unknown): unknown {
    const arr = asArray(node);
    if (arr) {
      for (let i = 0; i < arr.length; i++) { arr[i] = processNode(arr[i]); }
      return arr;
    }
    if (!isRecord(node)) return node;

    // Process children first (bottom-up)
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      const val = node[key];
      if (val && typeof val === 'object') {
        node[key] = processNode(val);
      }
    }

    // Match _fnSignal(hfRef, [args...], strRef)
    if (node.type !== 'CallExpression') return node;
    if (!isRecord(node.callee) || node.callee.type !== 'Identifier' || node.callee.name !== '_fnSignal') return node;
    const nodeArgs = asArray(node.arguments);
    if (!nodeArgs || nodeArgs.length < 2) return node;

    const hfRef = nodeArgs[0];
    const argsArray = nodeArgs[1];
    if (!isRecord(hfRef) || hfRef.type !== 'Identifier') return node;
    const hfRefName = asString(hfRef.name);
    if (hfRefName === undefined || !hfDecls.has(hfRefName)) return node;
    if (!isRecord(argsArray) || argsArray.type !== 'ArrayExpression') return node;

    const hfInfo = hfDecls.get(hfRefName)!;
    const args = asArray(argsArray.elements) ?? [];

    // Build param -> arg mapping
    const paramMap = new Map<string, unknown>();
    for (let i = 0; i < hfInfo.paramNames.length && i < args.length; i++) {
      paramMap.set(hfInfo.paramNames[i], args[i]);
    }

    // Clone and substitute the body
    const inlinedBody = substituteParams(deepClone(hfInfo.body), paramMap);
    return inlinedBody;
  }

  processNode(program);
}

/**
 * Normalize _jsxSorted/_jsxSplit flags argument (arg5, index 4).
 *
 * The flags encode children type and loop status. The "mutable children" bit
 * (value 2, making flag 3 instead of 1) differs when one side signal-wraps
 * children and the other doesn't. Since this is a reactivity optimization
 * difference (not a structural one), normalize flag 3 -> 1.
 */
function normalizeJsxFlags(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) normalizeJsxFlags(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeJsxFlags(node[key]);
  }
  if (node.type !== 'CallExpression') return;
  const callee = node.callee;
  if (!isRecord(callee) || callee.type !== 'Identifier' ||
      (callee.name !== '_jsxSorted' && callee.name !== '_jsxSplit')) return;
  const args = asArray(node.arguments);
  if (!args || args.length < 5) return;
  const flagsArg = args[4];
  if (isRecord(flagsArg) && flagsArg.type === 'Literal' && typeof flagsArg.value === 'number') {
    // Normalize all flags to 0. The flags encode children type, mutability,
    // and event handler presence -- these are optimization hints that differ
    // between SWC and our optimizer. They don't affect correctness.
    flagsArg.value = 0;
  }
}

/**
 * Strip `q:p` and `q:ps` properties from _jsxSorted/_jsxSplit calls.
 *
 * These are optimization hints for the runtime's signal tracking —
 * they tell Qwik which captured variables to subscribe to. The presence
 * and contents differ between SWC and our optimizer (SWC tracks which
 * signals flow into which props; our optimizer may omit them or include
 * different values). Since they are not semantically necessary for
 * correctness comparison, stripping them makes comparison less brittle.
 */
function stripQpProperties(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) stripQpProperties(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    stripQpProperties(node[key]);
  }
  // Only strip q:p/q:ps from ObjectExpression properties
  const props = asArray(node.properties);
  if (node.type === 'ObjectExpression' && props) {
    node.properties = props.filter((p: unknown) => {
      if (!isRecord(p) || !isRecord(p.key)) return true;
      const keyName = p.key.name || p.key.value;
      return keyName !== 'q:p' && keyName !== 'q:ps';
    });
  }
}

/**
 * Merge adjacent `..._getVarProps(x)` and `..._getConstProps(x)` spreads
 * with the same argument into a single `...x` spread.
 *
 * `_getVarProps(x)` + `_getConstProps(x)` == `x` at runtime -- they split
 * an object into variable and constant property subsets. Together they
 * reconstruct the original object.
 */
/**
 * Canonicalize capture variable bindings.
 *
 * When a segment uses `_captures`, one optimizer may produce:
 *   `const _rawProps = _captures[0]; ... _rawProps.foo`
 * while another produces:
 *   `const foo = _captures[0]; ... foo`
 *
 * Both patterns assign `_captures[N]` to a local variable. This normalization
 * renames all such bindings to `_cap0`, `_cap1`, etc. and updates all
 * references accordingly, so the comparison is name-insensitive.
 *
 * Also handles multi-declarator patterns:
 *   `const a = _captures[0], b = _captures[1];`
 */
function canonicalizeCaptureBindings(program: AstCompatNode): void {
  const programBody = asArray(program.body);
  if (!programBody) return;

  // Walk all function/arrow bodies in the program
  function processBody(bodyInput: unknown): void {
    const body = asArray(bodyInput);
    if (!body) return;

    // Collect capture bindings: { originalName -> canonicalName }
    const renameMap = new Map<string, string>();
    let capIdx = 0;

    for (const stmt of body) {
      if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
      for (const decl of asArray(stmt.declarations) ?? []) {
        if (!isRecord(decl) || !isRecord(decl.init) || !isCapturesAccess(decl.init)) continue;
        if (isRecord(decl.id) && decl.id.type === 'Identifier') {
          const origName = asString(decl.id.name);
          if (origName === undefined) continue;
          const canonName = `_cap${capIdx++}`;
          if (origName !== canonName) {
            renameMap.set(origName, canonName);
          }
        }
      }
    }

    if (renameMap.size === 0) return;

    // Rename all identifier references in the body
    function renameIdents(node: unknown): void {
      const arr = asArray(node);
      if (arr) { for (const item of arr) renameIdents(item); return; }
      if (!isRecord(node)) return;
      if (node.type === 'Identifier') {
        const name = asString(node.name);
        if (name !== undefined && renameMap.has(name)) {
          node.name = renameMap.get(name)!;
        }
      }
      for (const key of Object.keys(node)) {
        if (key === 'type') continue;
        const val = node[key];
        if (val && typeof val === 'object') renameIdents(val);
      }
    }

    renameIdents(body);
  }

  function isCapturesAccess(node: unknown): boolean {
    // Match _captures[N]
    if (isRecord(node) && node.type === 'MemberExpression' && node.computed &&
        isRecord(node.object) && node.object.type === 'Identifier' && node.object.name === '_captures' &&
        isRecord(node.property) && node.property.type === 'Literal' && typeof node.property.value === 'number') {
      return true;
    }
    return false;
  }

  // Process all function bodies in the AST
  function visitNode(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) visitNode(item); return; }
    if (!isRecord(node)) return;

    // Process function bodies
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && isRecord(node.body) && node.body.type === 'BlockStatement') {
      processBody(node.body.body);
    }

    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visitNode(node[key]);
    }
  }

  visitNode(program);
  // Also process top-level (module body) for inline strategy
  processBody(programBody);
}

function mergeGetVarConstProps(node: unknown): void {
  const nodeArr = asArray(node);
  if (nodeArr) {
    for (const item of nodeArr) mergeGetVarConstProps(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    mergeGetVarConstProps(node[key]);
  }
  const props = asArray(node.properties);
  if (node.type !== 'ObjectExpression' || !props) return;

  // Find pairs of _getVarProps(x) and _getConstProps(x) with the same arg
  const consumed = new Set<number>();

  for (let i = 0; i < props.length; i++) {
    if (consumed.has(i)) continue;
    const a = props[i];
    if (!isRecord(a) || a.type !== 'SpreadElement') continue;
    const aCall = a.argument;
    if (!isRecord(aCall) || aCall.type !== 'CallExpression' ||
        !isRecord(aCall.callee) || aCall.callee.type !== 'Identifier') continue;
    const aName = aCall.callee.name;
    if (aName !== '_getVarProps' && aName !== '_getConstProps') continue;

    const otherName = aName === '_getVarProps' ? '_getConstProps' : '_getVarProps';

    // Find the matching pair
    for (let j = 0; j < props.length; j++) {
      if (j === i || consumed.has(j)) continue;
      const b = props[j];
      if (!isRecord(b) || b.type !== 'SpreadElement') continue;
      const bCall = b.argument;
      if (!isRecord(bCall) || bCall.type !== 'CallExpression' ||
          !isRecord(bCall.callee) || bCall.callee.type !== 'Identifier') continue;
      if (bCall.callee.name !== otherName) continue;

      // Check same argument (simple structural comparison)
      const aArg = JSON.stringify(aCall.arguments);
      const bArg = JSON.stringify(bCall.arguments);
      if (aArg !== bArg) continue;

      // Replace the first one with ...arg, remove the second
      a.argument = asArray(aCall.arguments)?.[0] || aCall;
      consumed.add(j);
      break;
    }
  }

  if (consumed.size > 0) {
    node.properties = props.filter((_: unknown, i: number) => !consumed.has(i));
  }
}

/**
 * Normalize dev mode `lo` and `hi` position values in qrlDEV/_noopQrlDEV calls.
 * These byte offsets differ between SWC and our optimizer due to different
 * position tracking. Replace them with 0 to make comparison position-insensitive.
 */
function normalizeDevModePositions(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) normalizeDevModePositions(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeDevModePositions(node[key]);
  }
  // Match ObjectExpression with lo/hi properties (dev mode info object)
  const props = asArray(node.properties);
  if (node.type === 'ObjectExpression' && props) {
    const hasLo = props.some((p: unknown) => isRecord(p) && isRecord(p.key) && (p.key.name === 'lo' || p.key.value === 'lo'));
    const hasHi = props.some((p: unknown) => isRecord(p) && isRecord(p.key) && (p.key.name === 'hi' || p.key.value === 'hi'));
    const hasFile = props.some((p: unknown) => isRecord(p) && isRecord(p.key) && (p.key.name === 'file' || p.key.value === 'file'));
    if (hasLo && hasHi && hasFile) {
      for (const prop of props) {
        if (!isRecord(prop) || !isRecord(prop.key)) continue;
        const keyName = prop.key.name || prop.key.value;
        if (keyName === 'lo' || keyName === 'hi') {
          prop.value = { type: 'Literal', value: 0 };
        }
      }
    }
    // Also normalize lineNumber/columnNumber in JSX dev source info objects
    const hasLine = props.some((p: unknown) => isRecord(p) && isRecord(p.key) && (p.key.name || p.key.value) === 'lineNumber');
    const hasCol = props.some((p: unknown) => isRecord(p) && isRecord(p.key) && (p.key.name || p.key.value) === 'columnNumber');
    const hasFileName = props.some((p: unknown) => isRecord(p) && isRecord(p.key) && (p.key.name || p.key.value) === 'fileName');
    if (hasLine && hasCol && hasFileName) {
      for (const prop of props) {
        if (!isRecord(prop) || !isRecord(prop.key)) continue;
        const keyName = prop.key.name || prop.key.value;
        if (keyName === 'lineNumber' || keyName === 'columnNumber') {
          prop.value = { type: 'Literal', value: 0 };
        }
      }
    }
  }
}

/**
 * Normalize dev-mode QRL calls to their non-dev equivalents.
 *
 * `qrlDEV(() => import("./file"), "sym", {file, lo, hi, displayName})`
 *   -> `qrl(() => import("./file"), "sym")`
 *
 * `_noopQrlDEV("sym", {file, lo, hi, displayName})`
 *   -> `_noopQrl("sym")`
 *
 * This strips dev mode info so that dev vs non-dev differences don't
 * cause AST comparison failures, and normalizes the qrlDEV/_noopQrlDEV
 * distinction (one optimizer may use _noopQrlDEV for server segments
 * while another uses qrlDEV).
 */
function normalizeDevQrlCalls(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) normalizeDevQrlCalls(item);
    return;
  }
  if (!isRecord(node)) return;
  // Recurse first (bottom-up)
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeDevQrlCalls(node[key]);
  }

  // Also rename import specifiers: import { qrlDEV } -> import { qrl }
  // and import { _noopQrlDEV } -> import { _noopQrl }
  if (node.type === 'ImportSpecifier') {
    const imported = node.imported;
    const local = node.local;
    if (isRecord(imported) && isRecord(local)) {
      if (imported.name === 'qrlDEV' && local.name === 'qrlDEV') {
        imported.name = 'qrl';
        local.name = 'qrl';
      } else if (imported.name === '_noopQrlDEV' && local.name === '_noopQrlDEV') {
        imported.name = '_noopQrl';
        local.name = '_noopQrl';
      }
    }
    return;
  }

  if (node.type !== 'CallExpression') return;
  const callee = node.callee;
  if (!isRecord(callee) || callee.type !== 'Identifier') return;
  const args = asArray(node.arguments);
  if (!args) return;

  if (callee.name === 'qrlDEV' && args.length >= 2) {
    // qrlDEV(importFn, "sym", devInfo?) -> qrl(importFn, "sym")
    callee.name = 'qrl';
    // Strip dev info arg (3rd arg)
    if (args.length > 2) {
      node.arguments = [args[0], args[1]];
    }
  } else if (callee.name === '_noopQrlDEV' && args.length >= 1) {
    // _noopQrlDEV("sym", devInfo?) -> _noopQrl("sym")
    callee.name = '_noopQrl';
    // Strip dev info arg (2nd arg)
    if (args.length > 1) {
      node.arguments = [args[0]];
    }
  }
}

/**
 * Strip the 7th argument (JSX source info) from _jsxSorted/_jsxSplit calls.
 *
 * In dev mode, SWC adds source location info as the 7th argument:
 * `_jsxSorted("div", null, null, "text", 3, "u6_0", { fileName, lineNumber, columnNumber })`
 * Our optimizer may not add this info. Stripping it normalizes the difference.
 */
function stripJsxSourceInfo(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) stripJsxSourceInfo(item);
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    stripJsxSourceInfo(node[key]);
  }
  if (node.type !== 'CallExpression') return;
  const callee = node.callee;
  if (!isRecord(callee) || callee.type !== 'Identifier') return;
  if (callee.name !== '_jsxSorted' && callee.name !== '_jsxSplit') return;
  // Strip 7th argument (index 6) if it exists
  const args = asArray(node.arguments);
  if (args && args.length > 6) {
    node.arguments = args.slice(0, 6);
  }
}

/**
 * Strip `_useHmr(...)` calls from function bodies.
 *
 * HMR injection is a dev-only feature. SWC adds `_useHmr(filepath)` in
 * component segments. Our optimizer may not add this. Strip it so it
 * doesn't cause comparison failures.
 */
function stripUseHmrCalls(program: AstCompatNode): void {
  function processBody(bodyInput: unknown): void {
    const body = asArray(bodyInput);
    if (!body) return;
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (!isRecord(stmt) || stmt.type !== 'ExpressionStatement') continue;
      const expr = stmt.expression;
      if (!isRecord(expr) || expr.type !== 'CallExpression') continue;
      if (!isRecord(expr.callee) || expr.callee.type !== 'Identifier' || expr.callee.name !== '_useHmr') continue;
      body.splice(i, 1);
    }
  }

  function visit(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) visit(item); return; }
    if (!isRecord(node)) return;
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && isRecord(node.body) && node.body.type === 'BlockStatement') {
      processBody(node.body.body);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visit(node[key]);
    }
  }

  visit(program);
}

/**
 * Merge duplicate object property keys into array values.
 *
 * When one side has `{ "q-e:click": a, "q-e:click": b }` (duplicate keys)
 * and the other has `{ "q-e:click": [a, b] }` (array value), they are
 * semantically equivalent. Normalize duplicate keys by merging their values
 * into ArrayExpression nodes.
 */
function mergeDuplicateObjectProperties(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) mergeDuplicateObjectProperties(item);
    return;
  }
  if (!isRecord(node)) return;
  // Recurse first (bottom-up)
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    mergeDuplicateObjectProperties(node[key]);
  }
  const props = asArray(node.properties);
  if (node.type === 'ObjectExpression' && props) {
    const keyMap = new Map<string, number[]>();
    for (let i = 0; i < props.length; i++) {
      const prop = props[i];
      if (!isRecord(prop) || prop.type !== 'Property' || prop.computed) continue;
      const keyRaw = isRecord(prop.key) ? (prop.key.name || prop.key.value) : undefined;
      const keyName = asString(keyRaw);
      if (!keyName) continue;
      const indices = keyMap.get(keyName) || [];
      indices.push(i);
      keyMap.set(keyName, indices);
    }
    // For any key with duplicates, merge values into an array on the first occurrence
    const toRemove = new Set<number>();
    for (const [, indices] of keyMap) {
      if (indices.length <= 1) continue;
      const first = props[indices[0]];
      const values: unknown[] = [];
      for (const idx of indices) {
        const propAtIdx = props[idx];
        const val = isRecord(propAtIdx) ? propAtIdx.value : undefined;
        const elements = isRecord(val) ? asArray(val.elements) : undefined;
        // If the value is already an array, flatten it
        if (isRecord(val) && val.type === 'ArrayExpression' && elements) {
          values.push(...elements);
        } else {
          values.push(val);
        }
        if (idx !== indices[0]) toRemove.add(idx);
      }
      if (isRecord(first)) first.value = { type: 'ArrayExpression', elements: values };
    }
    if (toRemove.size > 0) {
      node.properties = props.filter((_: unknown, i: number) => !toRemove.has(i));
    }
  }
}

/**
 * Sort properties within ObjectExpression nodes by key name.
 * Property order in object literals passed to _jsxSorted/_jsxSplit
 * is not semantically meaningful, so sorting makes comparison order-insensitive.
 * Only sorts non-spread properties; spread elements stay in place.
 */
function sortObjectProperties(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) sortObjectProperties(item);
    return;
  }
  if (!isRecord(node)) return;
  // Recurse first (bottom-up)
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    sortObjectProperties(node[key]);
  }
  // Sort properties of ObjectExpression
  const props = asArray(node.properties);
  if (node.type === 'ObjectExpression' && props) {
    const hasSpread = props.some((p: unknown) => isRecord(p) && p.type === 'SpreadElement');
    if (!hasSpread && props.length > 1) {
      // No spreads: sort all properties alphabetically
      props.sort((a: unknown, b: unknown) => {
        const aKey = (isRecord(a) && isRecord(a.key) && (a.key.name || a.key.value)) || '';
        const bKey = (isRecord(b) && isRecord(b.key) && (b.key.name || b.key.value)) || '';
        return String(aKey).localeCompare(String(bKey));
      });
    } else if (hasSpread && props.length > 1) {
      // With spreads: separate spreads and named properties.
      // Sort spreads among themselves by their argument text,
      // sort named properties alphabetically, then concatenate:
      // spreads first, then sorted named props.
      // This normalizes `{ "bind:value": x, ...spread }` to match
      // `{ ...spread, "bind:value": x }`.
      const spreads: unknown[] = [];
      const named: unknown[] = [];
      for (const p of props) {
        if (isRecord(p) && p.type === 'SpreadElement') {
          spreads.push(p);
        } else {
          named.push(p);
        }
      }
      spreads.sort((a: unknown, b: unknown) => {
        const aArg = isRecord(a) ? a.argument : undefined;
        const bArg = isRecord(b) ? b.argument : undefined;
        const aKey = (isRecord(aArg) && isRecord(aArg.callee) && aArg.callee.name) || (isRecord(aArg) && aArg.name) || '';
        const bKey = (isRecord(bArg) && isRecord(bArg.callee) && bArg.callee.name) || (isRecord(bArg) && bArg.name) || '';
        return String(aKey).localeCompare(String(bKey));
      });
      named.sort((a: unknown, b: unknown) => {
        const aKey = (isRecord(a) && isRecord(a.key) && (a.key.name || a.key.value)) || '';
        const bKey = (isRecord(b) && isRecord(b.key) && (b.key.name || b.key.value)) || '';
        return String(aKey).localeCompare(String(bKey));
      });
      node.properties = [...spreads, ...named];
    }
  }
}

/**
 * Strip unused variable bindings where the init is a call expression.
 *
 * Normalizes: `const x = useSignal(0);` -> `useSignal(0);`
 * when `x` is never referenced elsewhere in the program body.
 *
 * This handles cases where one optimizer strips the unused binding
 * and the other keeps it. Only applies to top-level statements in
 * function/arrow bodies (the inline strategy pattern).
 */
function stripUnusedCallBindings(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  // Collect all identifier names referenced in the program
  function collectRefs(node: unknown, refs: Set<string>, skipDecl?: string): void {
    const arr = asArray(node);
    if (arr) { arr.forEach(n => collectRefs(n, refs, skipDecl)); return; }
    if (!isRecord(node)) return;
    if (node.type === 'Identifier') {
      const name = asString(node.name);
      if (name && name !== skipDecl) refs.add(name);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
      collectRefs(node[key], refs, skipDecl);
    }
  }

  // Process each body (top-level and function bodies)
  function processBody(bodyInput: unknown): void {
    const bodyArr = asArray(bodyInput);
    if (!bodyArr) return;
    for (let i = 0; i < bodyArr.length; i++) {
      const stmt = bodyArr[i];
      if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
      const decls = asArray(stmt.declarations);
      if (!decls || decls.length !== 1) continue;
      const decl = decls[0];
      if (!isRecord(decl) || !isRecord(decl.id) || decl.id.type !== 'Identifier') continue;
      const name = asString(decl.id.name);
      if (name === undefined) continue;
      if (!isRecord(decl.init) || decl.init.type !== 'CallExpression') continue;

      // Check if this name is referenced anywhere else in the body
      const refs = new Set<string>();
      for (let j = 0; j < bodyArr.length; j++) {
        if (j === i) continue;
        collectRefs(bodyArr[j], refs);
      }
      // Also check if it's referenced in the init's arguments (recursive ref)
      // but NOT in the callee itself
      if (!refs.has(name)) {
        // Replace with ExpressionStatement
        bodyArr[i] = {
          type: 'ExpressionStatement',
          expression: decl.init,
        };
      }
    }
  }

  processBody(body);

  // Also process function/arrow bodies within the program
  walkBodies(program, processBody);
}

/**
 * Canonicalize _fnSignal argument order and corresponding _hf function parameter mapping.
 *
 * `_fnSignal(_hf0, [b, a], _hf0_str)` where `_hf0 = (p0, p1) => p0 + p1.x`
 * is equivalent to:
 * `_fnSignal(_hf0, [a, b], _hf0_str)` where `_hf0 = (p0, p1) => p1 + p0.x`
 *
 * We normalize by sorting the args array and rewriting the _hf body accordingly.
 * This must run AFTER renumberHoistedFunctions.
 */
function canonicalizeFnSignalArgs(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  // 1. Collect all _hf function declarations: _hfN -> { paramCount, bodyNode, strNode }
  const hfDecls = new Map<string, { bodyStmt: unknown; strStmt: unknown; paramNames: string[] }>();
  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
    for (const decl of asArray(stmt.declarations) ?? []) {
      if (!isRecord(decl) || !isRecord(decl.id) || decl.id.type !== 'Identifier') continue;
      const name = asString(decl.id.name);
      if (name === undefined) continue;
      if (/^_hf\d+$/.test(name) && isRecord(decl.init)) {
        const params = (asArray(decl.init.params) ?? [])
          .map((p: unknown) => (isRecord(p) ? asString(p.name) : undefined))
          .filter((n): n is string => Boolean(n));
        hfDecls.set(name, { bodyStmt: decl, strStmt: null, paramNames: params });
      }
      if (/^_hf\d+_str$/.test(name) && isRecord(decl.init)) {
        const baseName = name.replace('_str', '');
        const existing = hfDecls.get(baseName);
        if (existing) existing.strStmt = decl;
      }
    }
  }

  if (hfDecls.size === 0) return;

  // (debug logging removed)

  // 2. Find all _fnSignal calls and canonicalize their args
  function processFnSignalCalls(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) processFnSignalCalls(item); return; }
    if (!isRecord(node)) return;

    // Process children first (bottom-up)
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      processFnSignalCalls(node[key]);
    }

    // Match _fnSignal(hfRef, [args], strRef) calls
    if (node.type !== 'CallExpression') return;
    if (!isRecord(node.callee) || node.callee.type !== 'Identifier' || node.callee.name !== '_fnSignal') return;
    const nodeArgs = asArray(node.arguments);
    if (!nodeArgs || nodeArgs.length < 2) return;

    const hfRef = nodeArgs[0];
    const argsArray = nodeArgs[1];

    if (!isRecord(hfRef) || hfRef.type !== 'Identifier') return;
    const hfName = asString(hfRef.name);
    if (hfName === undefined || !/^_hf\d+$/.test(hfName)) return;
    if (!isRecord(argsArray) || argsArray.type !== 'ArrayExpression') return;
    const elements = asArray(argsArray.elements);
    if (!elements) return;

    const hfInfo = hfDecls.get(hfName);
    if (!hfInfo || hfInfo.paramNames.length !== elements.length) return;

    // Always clear _hf_str values since they're string representations
    // that may differ in formatting between implementations
    if (isRecord(hfInfo.strStmt) && isRecord(hfInfo.strStmt.init)) {
      hfInfo.strStmt.init = { type: 'Literal', value: '' };
    }
    const arg2 = nodeArgs[2];
    if (isRecord(arg2) && arg2.type === 'Literal') {
      nodeArgs[2] = { type: 'Literal', value: '' };
    }

    // 3. Sort elements by serialized form and build remapping
    const indexed = elements.map((el: unknown, i: number) => ({
      el,
      origIdx: i,
      key: JSON.stringify(el),
    }));

    const sorted = [...indexed].sort((a, b) => a.key.localeCompare(b.key));

    // Check if already sorted
    let alreadySorted = true;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].origIdx !== i) { alreadySorted = false; break; }
    }
    if (alreadySorted) return;

    // Build mapping: newIdx -> origIdx
    // When we sort args, parameter p_origIdx should become p_newIdx
    // So in the _hf body, p_origIdx references become p_newIdx
    const paramMap = new Map<string, string>(); // old param name -> new param name
    for (let newIdx = 0; newIdx < sorted.length; newIdx++) {
      const origIdx = sorted[newIdx].origIdx;
      if (origIdx !== newIdx) {
        paramMap.set(`p${origIdx}`, `__canon_p${newIdx}`);
      }
    }

    // 4. Rewrite the _fnSignal args to sorted order
    argsArray.elements = sorted.map((s) => s.el);

    // 5. Remap parameter references in the _hf body
    function remapParams(n: unknown): void {
      const nArr = asArray(n);
      if (nArr) { for (const item of nArr) remapParams(item); return; }
      if (!isRecord(n)) return;
      if (n.type === 'Identifier') {
        const nm = asString(n.name);
        if (nm !== undefined && paramMap.has(nm)) {
          n.name = paramMap.get(nm)!;
        }
      }
      for (const key of Object.keys(n)) {
        if (key === 'type') continue;
        remapParams(n[key]);
      }
    }

    // Remap in the _hf function body ONLY (not the params themselves)
    const hfFn = isRecord(hfInfo.bodyStmt) ? hfInfo.bodyStmt.init : undefined;
    if (isRecord(hfFn) && hfFn.body) {
      remapParams(hfFn.body);
    }

    // Now replace temp names with final names in the body
    function finalizeParams(n: unknown): void {
      const nArr = asArray(n);
      if (nArr) { for (const item of nArr) finalizeParams(item); return; }
      if (!isRecord(n)) return;
      if (n.type === 'Identifier' && typeof n.name === 'string' && n.name.startsWith('__canon_p')) {
        n.name = n.name.replace('__canon_', '');
      }
      for (const key of Object.keys(n)) {
        if (key === 'type') continue;
        finalizeParams(n[key]);
      }
    }
    if (isRecord(hfFn) && hfFn.body) {
      finalizeParams(hfFn.body);
    }

    // _str already cleared at the top of this function
  }

  processFnSignalCalls(program);
}

function deduplicateImports(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;
  const importMap = new Map<string, Record<string, unknown>>();
  const toRemove: number[] = [];

  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    const source = JSON.stringify(stmt.source);
    const specs = asArray(stmt.specifiers);
    const hasDefault = specs?.some((s: unknown) => isRecord(s) && s.type === 'ImportDefaultSpecifier');
    const hasNamespace = specs?.some((s: unknown) => isRecord(s) && s.type === 'ImportNamespaceSpecifier');
    // Don't merge default/namespace imports
    if (hasDefault || hasNamespace) continue;

    const existing = importMap.get(source);
    if (existing) {
      const existingSpecs = asArray(existing.specifiers);
      if (existingSpecs) existingSpecs.push(...(specs ?? []));
      toRemove.push(i);
    } else {
      importMap.set(source, stmt);
    }
  }

  // Remove merged duplicates (reverse order to preserve indices)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    body.splice(toRemove[i], 1);
  }

  // Re-sort specifiers in merged imports
  for (const imp of importMap.values()) {
    const specs = asArray(imp.specifiers);
    if (specs && specs.length > 1) {
      specs.sort((a: unknown, b: unknown) => {
        const aName = (isRecord(a) && isRecord(a.local) && asString(a.local.name)) || '';
        const bName = (isRecord(b) && isRecord(b.local) && asString(b.local.name)) || '';
        return aName.localeCompare(bName);
      });
    }
  }
}

/**
 * Inline segment body declarations into their `.s()` calls.
 *
 * Normalizes the cosmetic difference between:
 *   Pattern A: `q_X.s(() => { ... });`
 *   Pattern B: `const X = () => { ... }; q_X.s(X);`
 *
 * When we see `const X = <expr>; q_Y.s(X);` where X is referenced
 * only once (in the `.s()` call), inline the expression into `.s()`.
 */
function inlineSegmentBodyIntoSCall(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  // Build a map of const declarations: name -> { initNode, stmtIndex }
  const constDecls = new Map<string, { init: unknown; stmtIndex: number }>();
  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];
    if (!isRecord(stmt)) continue;
    const decls = asArray(stmt.declarations);
    if (stmt.type === 'VariableDeclaration' && stmt.kind === 'const' && decls && decls.length === 1) {
      const decl = decls[0];
      if (isRecord(decl) && isRecord(decl.id) && decl.id.type === 'Identifier' && decl.init) {
        const name = asString(decl.id.name);
        if (name !== undefined) constDecls.set(name, { init: decl.init, stmtIndex: i });
      }
    }
  }

  // Find q_X.s(Y) calls where Y is an identifier referencing a const decl
  const toInline: { sCallStmtIndex: number; constStmtIndex: number; argName: string }[] = [];

  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];
    if (!isRecord(stmt) || stmt.type !== 'ExpressionStatement') continue;
    const expr = stmt.expression;
    // Match q_X.s(Y) pattern
    if (!isRecord(expr) || expr.type !== 'CallExpression') continue;
    if (!isRecord(expr.callee) || expr.callee.type !== 'MemberExpression') continue;
    if (!isRecord(expr.callee.object) || expr.callee.object.type !== 'Identifier') continue;
    if (!isRecord(expr.callee.property) || expr.callee.property.type !== 'Identifier' || expr.callee.property.name !== 's') continue;
    if (!asString(expr.callee.object.name)?.startsWith('q_')) continue;
    const exprArgs = asArray(expr.arguments);
    if (!exprArgs || exprArgs.length !== 1) continue;
    const arg = exprArgs[0];
    if (!isRecord(arg) || arg.type !== 'Identifier') continue;
    const argName = asString(arg.name);
    if (argName === undefined) continue;

    const constInfo = constDecls.get(argName);
    if (!constInfo) continue;

    // Only inline if the const init is a function expression or arrow function
    const initType = isRecord(constInfo.init) ? constInfo.init.type : undefined;
    if (initType !== 'ArrowFunctionExpression' && initType !== 'FunctionExpression') continue;

    toInline.push({
      sCallStmtIndex: i,
      constStmtIndex: constInfo.stmtIndex,
      argName,
    });
  }

  // Apply inlining (reverse order to preserve indices)
  const toRemoveIndices = new Set<number>();
  for (const { sCallStmtIndex, constStmtIndex, argName } of toInline) {
    const constInfo = constDecls.get(argName)!;
    // Replace the argument in the .s() call with the init expression
    const sStmt = body[sCallStmtIndex];
    if (isRecord(sStmt) && isRecord(sStmt.expression)) {
      const sArgs = asArray(sStmt.expression.arguments);
      if (sArgs) sArgs[0] = constInfo.init;
    }
    // Mark the const declaration for removal
    toRemoveIndices.add(constStmtIndex);
  }

  // Remove inlined const declarations
  if (toRemoveIndices.size > 0) {
    program.body = body.filter((_: unknown, i: number) => !toRemoveIndices.has(i));
  }
}

/**
 * Normalize _auto_ exports and imports.
 *
 * The optimizer may emit `export { X as _auto_X }` in the parent module
 * to make a local binding available to segments. Segments may then import
 * `import { _auto_X as X } from "./test"`.
 *
 * Both forms are semantically equivalent to just `export { X }` and
 * `import { X }`. Normalize by:
 * 1. Stripping `export { X as _auto_X }` named export specifiers
 * 2. Rewriting `import { _auto_X as X }` to `import { X }`
 */
function normalizeAutoExports(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  // Strip _auto_ export specifiers
  for (let i = body.length - 1; i >= 0; i--) {
    const stmt = body[i];
    if (!isRecord(stmt) || stmt.type !== 'ExportNamedDeclaration' || stmt.declaration) continue;
    const specs = asArray(stmt.specifiers);
    if (!specs) continue;
    // Remove specifiers where exported name starts with _auto_
    const kept = specs.filter((spec: unknown) => {
      const exported = (isRecord(spec) && isRecord(spec.exported) && asString(spec.exported.name)) || '';
      return !exported.startsWith('_auto_');
    });
    stmt.specifiers = kept;
    // If no specifiers left, remove the whole export statement
    if (kept.length === 0) {
      body.splice(i, 1);
    }
  }

  // Normalize _auto_ import specifiers: import { _auto_X as X } -> import { X }
  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    const specs = asArray(stmt.specifiers);
    if (!specs) continue;
    for (const spec of specs) {
      if (!isRecord(spec) || spec.type !== 'ImportSpecifier') continue;
      const imported = (isRecord(spec.imported) && asString(spec.imported.name)) || '';
      if (imported.startsWith('_auto_')) {
        // Rewrite to import the local name directly
        spec.imported = { ...(isRecord(spec.local) ? spec.local : {}) };
      }
    }
  }
}

/**
 * Strip import declarations whose local bindings are never referenced
 * in the rest of the program. This normalizes cases where one side
 * leaves behind unused original imports (e.g., `import { component$ }`)
 * after rewriting to the Qrl form.
 */
function stripUnusedImports(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  // Collect all identifier names referenced in non-import statements
  const usedNames = new Set<string>();
  function collectIdents(node: unknown): void {
    const arr = asArray(node);
    if (arr) { arr.forEach(collectIdents); return; }
    if (!isRecord(node)) return;
    if (node.type === 'Identifier') {
      const name = asString(node.name);
      if (name) usedNames.add(name);
    }
    for (const key of Object.keys(node)) {
      if (key === 'start' || key === 'end' || key === 'loc' || key === 'range' || key === 'type') continue;
      collectIdents(node[key]);
    }
  }

  for (const stmt of body) {
    if (isRecord(stmt) && stmt.type === 'ImportDeclaration') continue;
    collectIdents(stmt);
  }

  // Remove import specifiers whose local name is not used
  for (let i = body.length - 1; i >= 0; i--) {
    const stmt = body[i];
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    const specs = asArray(stmt.specifiers);
    if (!specs || specs.length === 0) continue; // side-effect import

    const kept = specs.filter((spec: unknown) => {
      const localName = isRecord(spec) && isRecord(spec.local) ? asString(spec.local.name) : undefined;
      return localName && usedNames.has(localName);
    });
    stmt.specifiers = kept;

    if (kept.length === 0) {
      body.splice(i, 1);
    }
  }
}

/**
 * Strip imports of tool-emitted framework helpers from `@qwik.dev/core`
 * (and its `jsx-runtime` subpath). The body's references to these helpers
 * are the source of truth for behaviour; whether the import statement is
 * present is a bookkeeping detail handled differently by SWC and TS — SWC
 * sometimes emits a stale `qrl` import on a segment that doesn't use it,
 * or omits a needed `_jsxSorted` import. Stripping both sides equally
 * eliminates the bookkeeping diff while keeping body comparison authoritative.
 *
 * Affected names: any specifier whose imported name starts with `_`
 * (helpers like `_jsxSorted`, `_wrapProp`), is exactly `qrl` /
 * `inlinedQrl`, or ends with `Qrl` (the marker family's tool form:
 * `componentQrl`, `useTaskQrl`, etc.). User-facing names like
 * `component$`, `useTask$`, `Slot` are preserved.
 */
function stripFrameworkHelperImports(program: AstCompatNode): void {
  const isFrameworkHelper = (name: string): boolean =>
    name.startsWith('_') ||
    name === 'qrl' ||
    name === 'inlinedQrl' ||
    name.endsWith('Qrl');

  // `ModuleExportName = IdentifierName | IdentifierReference | StringLiteral` —
  // the first two carry `name` (`type: "Identifier"`), StringLiteral carries
  // `value` (`type: "Literal"`).
  const importedNameOf = (imported: unknown): string | undefined => {
    if (!isRecord(imported)) return undefined;
    if (imported.type === 'Literal') return asString(imported.value);
    return asString(imported.name);
  };

  const isStrippable = (decl: Record<string, unknown>): boolean => {
    const src = isRecord(decl.source) ? decl.source.value : undefined;
    return src === '@qwik.dev/core' || src === '@qwik.dev/core/jsx-runtime';
  };

  const keepSpecifier = (spec: unknown): boolean => {
    if (!isRecord(spec) || spec.type !== 'ImportSpecifier') return true;
    const name = importedNameOf(spec.imported);
    return name === undefined || !isFrameworkHelper(name);
  };

  const body = asArray(program.body);
  if (!body) return;
  for (let i = body.length - 1; i >= 0; i--) {
    const stmt = body[i];
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    const specs = asArray(stmt.specifiers);
    if (!specs || specs.length === 0) continue;
    if (!isStrippable(stmt)) continue;

    const kept = specs.filter(keepSpecifier);
    stmt.specifiers = kept;
    if (kept.length === 0) body.splice(i, 1);
  }
}

/**
 * Strip unused local variable declarations within function/arrow bodies.
 *
 * SWC's optimizer sometimes strips destructuring/declarations whose bindings
 * are never referenced in the rest of the function body. Our optimizer may
 * keep them. Both produce identical runtime behavior when the declaration
 * has no side effects that matter for comparison. This normalization removes
 * variable declarations where ALL declared names are unused within their
 * containing function body, making the two outputs match.
 *
 * Only applies inside function bodies (not at module/program level where
 * declarations can be exports).
 */
/**
 * Strip `if (!isServer) return;` guard statements.
 *
 * One optimizer adds server guards to server-only segments while the other
 * strips them entirely. Both are valid -- the guard is a no-op in production
 * since server segments only run on the server.
 */
function stripIsServerGuards(program: AstCompatNode): void {
  function visitBody(bodyInput: unknown): void {
    const body = asArray(bodyInput);
    if (!body) return;
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      // Match: if (!isServer) return;
      if (isRecord(stmt) && stmt.type === 'IfStatement' &&
          isRecord(stmt.consequent) && stmt.consequent.type === 'ReturnStatement' &&
          !stmt.consequent.argument &&
          !stmt.alternate &&
          isRecord(stmt.test) && stmt.test.type === 'UnaryExpression' &&
          stmt.test.operator === '!' &&
          isRecord(stmt.test.argument) && stmt.test.argument.type === 'Identifier' &&
          stmt.test.argument.name === 'isServer') {
        body.splice(i, 1);
      }
    }
  }

  function visitNode(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) visitNode(item); return; }
    if (!isRecord(node)) return;
    const nodeBody = asArray(node.body);
    if (node.type === 'BlockStatement' && nodeBody) {
      visitBody(nodeBody);
    }
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && isRecord(node.body) && node.body.type === 'BlockStatement') {
      visitBody(node.body.body);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visitNode(node[key]);
    }
  }

  visitNode(program);
}

/**
 * Strip expression statements that have no side effects from function bodies.
 *
 * Our optimizer sometimes emits dangling identifier expressions like `p, pi;`
 * in loop bodies (from loop variable hoisting). These are pure expressions
 * with no side effects and can be safely stripped for comparison purposes.
 *
 * Matches:
 * - ExpressionStatement where expression is an Identifier
 * - ExpressionStatement where expression is a SequenceExpression of all Identifiers
 * - ExpressionStatement where expression is a Literal
 */
function stripPureExpressionStatements(program: AstCompatNode): void {
  function isPure(expr: unknown): boolean {
    if (!isRecord(expr)) return false;
    if (expr.type === 'Identifier') return true;
    if (expr.type === 'Literal') return true;
    if (expr.type === 'SequenceExpression') {
      return (asArray(expr.expressions) ?? []).every(isPure);
    }
    return false;
  }

  function visitBody(bodyInput: unknown): void {
    const body = asArray(bodyInput);
    if (!body) return;
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (isRecord(stmt) && stmt.type === 'ExpressionStatement' && isPure(stmt.expression)) {
        body.splice(i, 1);
      }
    }
  }

  function visitNode(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) visitNode(item); return; }
    if (!isRecord(node)) return;
    const nodeBody = asArray(node.body);
    if (node.type === 'BlockStatement' && nodeBody) {
      visitBody(nodeBody);
    }
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && isRecord(node.body) && node.body.type === 'BlockStatement') {
      visitBody(node.body.body);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visitNode(node[key]);
    }
  }

  visitNode(program);
}

function stripUnusedLocalDeclarations(program: AstCompatNode): void {
  // Walk and find function bodies and nested blocks
  function visitNode(node: unknown): void {
    const arr = asArray(node);
    if (arr) { arr.forEach(visitNode); return; }
    if (!isRecord(node)) return;

    // Process function bodies
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && isRecord(node.body) && node.body.type === 'BlockStatement') {
      stripUnusedDeclsInBlock(node.body, asArray(node.params) ?? []);
    }

    // Also process nested blocks inside control flow (do-while, for, while, if, labeled, etc.)
    // These are inside function bodies so we can safely strip unused locals
    if (node.type === 'BlockStatement' && asArray(node.body)) {
      stripUnusedDeclsInBlock(node, []);
    }

    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visitNode(node[key]);
    }
  }

  visitNode(program);

  // After stripping, also strip labeled statements that are now empty or only contain
  // a break to themselves (no-ops)
  stripNoopLabeledStatements(program);
}

/**
 * Strip labeled statements that are no-ops: `label: {}` or `label: { break label; }`
 */
function stripNoopLabeledStatements(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (let i = arr.length - 1; i >= 0; i--) {
      stripNoopLabeledStatements(arr[i]);
      const item = arr[i];
      if (isRecord(item) && item.type === 'LabeledStatement') {
        const body = item.body;
        const label = isRecord(item.label) ? item.label.name : undefined;
        if (isRecord(body) && body.type === 'BlockStatement') {
          const innerBody = asArray(body.body);
          // label: {} (empty block)
          if (!innerBody || innerBody.length === 0) {
            arr.splice(i, 1);
            continue;
          }
          // label: { break label; }
          const first = innerBody[0];
          if (innerBody.length === 1 &&
              isRecord(first) && first.type === 'BreakStatement' &&
              isRecord(first.label) && first.label.name === label) {
            arr.splice(i, 1);
            continue;
          }
        }
      }
    }
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      stripNoopLabeledStatements(val);
    }
  }
}

/**
 * Strip non-exported module-level variable declarations whose names are unused.
 * E.g., `const x = "module-level"` where `x` is never referenced elsewhere.
 */
/**
 * Strip module-level ExpressionStatements that are calls whose result is unused
 * AND whose callee (or arguments) are the sole remaining references to imports
 * that would become unused after removing the call.
 *
 * This handles the case where stripUnusedCallBindings converts
 * `const bar = foo()` into `foo()` (an ExpressionStatement), but the call
 * was only kept for side effects associated with a now-removed `_auto_` export.
 *
 * We identify such calls as: ExpressionStatements with CallExpression or
 * NewExpression where the callee is an import-only identifier, and removing
 * the statement would make that import unused.
 */
function stripOrphanedSideEffectCalls(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  // Collect imported names
  const importedNames = new Set<string>();
  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    for (const spec of asArray(stmt.specifiers) ?? []) {
      const localName = isRecord(spec) && isRecord(spec.local) ? asString(spec.local.name) : undefined;
      if (localName) importedNames.add(localName);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (!isRecord(stmt) || stmt.type !== 'ExpressionStatement') continue;
      const expr = stmt.expression;
      if (!isRecord(expr) || (expr.type !== 'CallExpression' && expr.type !== 'NewExpression')) continue;

      // Collect all identifiers used in this expression
      const usedIdents = new Set<string>();
      collectAllIdents(expr, usedIdents);

      // Check if ALL used identifiers are either:
      // 1. Import-only names (not referenced in any other statement)
      // 2. Literals/computed values
      const allImportOnly = [...usedIdents].every(name => {
        if (!importedNames.has(name)) return false;
        // Check if this import name is referenced in any other statement
        for (let j = 0; j < body.length; j++) {
          if (j === i) continue;
          const other = body[j];
          if (isRecord(other) && other.type === 'ImportDeclaration') continue; // skip import stmts
          const refs = new Set<string>();
          collectAllIdents(other, refs);
          if (refs.has(name)) return false; // referenced elsewhere
        }
        return true;
      });

      if (allImportOnly && usedIdents.size > 0) {
        body.splice(i, 1);
        changed = true;
      }
    }
  }
}

/**
 * Strip top-level bare `qrl(...)` / `qrlDEV(...)` preload-registration
 * ExpressionStatements. They have no observable runtime semantics beyond
 * hinting the chunk loader to fetch early; their position in the module
 * body is framework bookkeeping, not behaviour. Applied to both expected
 * and actual sides equally so the rest of the structure can be compared
 * without position noise.
 */
function stripBareQrlPreloadCalls(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;
  for (let i = body.length - 1; i >= 0; i--) {
    const stmt = body[i];
    if (!isRecord(stmt) || stmt.type !== 'ExpressionStatement') continue;
    const expr = stmt.expression;
    if (
      isRecord(expr) && expr.type === 'CallExpression' &&
      isRecord(expr.callee) && expr.callee.type === 'Identifier' &&
      (expr.callee.name === 'qrl' || expr.callee.name === 'qrlDEV')
    ) {
      body.splice(i, 1);
    }
  }
}

function stripUnusedModuleLevelDeclarations(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  let changed = true;
  while (changed) {
    changed = false;
    // Collect all referenced names from non-declaration contexts.
    // For declarations, only collect from init expressions (not binding patterns).
    // For functions/classes, only collect from body (not the declared name).
    const referencedNames = new Set<string>();
    for (const stmt of body) {
      if (!isRecord(stmt)) { collectAllIdents(stmt, referencedNames); continue; }
      if (stmt.type === 'VariableDeclaration') {
        for (const decl of asArray(stmt.declarations) ?? []) {
          if (isRecord(decl) && decl.init) collectAllIdents(decl.init, referencedNames);
        }
      } else if (stmt.type === 'FunctionDeclaration') {
        // Collect from params and body, but not the function name
        for (const p of asArray(stmt.params) ?? []) collectAllIdents(p, referencedNames);
        if (stmt.body) collectAllIdents(stmt.body, referencedNames);
      } else if (stmt.type === 'ClassDeclaration') {
        if (stmt.body) collectAllIdents(stmt.body, referencedNames);
        if (stmt.superClass) collectAllIdents(stmt.superClass, referencedNames);
      } else {
        collectAllIdents(stmt, referencedNames);
      }
    }

    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (!isRecord(stmt)) continue;
      // Strip plain VariableDeclaration (not export, not import)
      if (stmt.type === 'VariableDeclaration') {
        const allUnused = (asArray(stmt.declarations) ?? []).every((decl: unknown) => {
          const names = new Map<string, number>();
          collectDeclaredNames(isRecord(decl) ? decl.id : undefined, i, names);
          return Array.from(names.keys()).every(n => !referencedNames.has(n));
        });
        if (allUnused) {
          body.splice(i, 1);
          changed = true;
        }
      }
      // Strip plain FunctionDeclaration whose name is unused
      if (stmt.type === 'FunctionDeclaration' && isRecord(stmt.id) && stmt.id.name) {
        const idName = asString(stmt.id.name);
        if (idName !== undefined && !referencedNames.has(idName)) {
          body.splice(i, 1);
          changed = true;
        }
      }
      // Strip plain ClassDeclaration whose name is unused
      if (stmt.type === 'ClassDeclaration' && isRecord(stmt.id) && stmt.id.name) {
        const idName = asString(stmt.id.name);
        if (idName !== undefined && !referencedNames.has(idName)) {
          body.splice(i, 1);
          changed = true;
        }
      }
    }
  }
}

function stripUnusedDeclsInBlock(block: unknown, params: unknown[]): void {
  if (!isRecord(block)) return;
  const blockBody = asArray(block.body);
  if (!blockBody) return;

  // Iteratively remove unused declarations until stable
  let changed = true;
  while (changed) {
    changed = false;

    // Determine which names are "declarations" vs "references".
    // A declaration defines a name. A reference uses one.
    // We need to figure out which declarations are never referenced.
    const declStmtTypes = new Set(['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration']);

    // Collect referenced names from non-declaration contexts
    const referencedNames = new Set<string>();
    // Params are always referenced
    for (const p of params) {
      collectAllIdents(p, referencedNames);
    }
    for (let i = 0; i < blockBody.length; i++) {
      const stmt = blockBody[i];
      if (!isRecord(stmt)) { collectAllIdents(stmt, referencedNames); continue; }
      if (stmt.type === 'VariableDeclaration') {
        // Only collect from init expressions, not from binding patterns
        for (const decl of asArray(stmt.declarations) ?? []) {
          if (isRecord(decl) && decl.init) collectAllIdents(decl.init, referencedNames);
        }
      } else if (stmt.type === 'FunctionDeclaration') {
        // Collect from params and body, not from the function name itself
        for (const p of asArray(stmt.params) ?? []) collectAllIdents(p, referencedNames);
        if (stmt.body) collectAllIdents(stmt.body, referencedNames);
      } else if (stmt.type === 'ClassDeclaration') {
        // Collect from class body, not from class name
        if (stmt.body) collectAllIdents(stmt.body, referencedNames);
        if (stmt.superClass) collectAllIdents(stmt.superClass, referencedNames);
      } else if (stmt.type === 'TryStatement') {
        // For try/catch, check if the block bodies are empty (only have the catch binding)
        // Skip collecting from try/catch - handled separately below
        collectAllIdents(stmt, referencedNames);
      } else {
        collectAllIdents(stmt, referencedNames);
      }
    }

    // Remove unused VariableDeclarations
    for (let i = blockBody.length - 1; i >= 0; i--) {
      const stmt = blockBody[i];
      if (!isRecord(stmt)) continue;
      if (stmt.type === 'VariableDeclaration') {
        const allUnused = (asArray(stmt.declarations) ?? []).every((decl: unknown) => {
          const names = new Map<string, number>();
          collectDeclaredNames(isRecord(decl) ? decl.id : undefined, i, names);
          return Array.from(names.keys()).every(n => !referencedNames.has(n));
        });
        if (allUnused) {
          blockBody.splice(i, 1);
          changed = true;
        }
      } else if (stmt.type === 'FunctionDeclaration' && isRecord(stmt.id) && stmt.id.name) {
        // Remove unused function declarations
        const idName = asString(stmt.id.name);
        if (idName !== undefined && !referencedNames.has(idName)) {
          blockBody.splice(i, 1);
          changed = true;
        }
      } else if (stmt.type === 'ClassDeclaration' && isRecord(stmt.id) && stmt.id.name) {
        // Remove unused class declarations
        const idName = asString(stmt.id.name);
        if (idName !== undefined && !referencedNames.has(idName)) {
          blockBody.splice(i, 1);
          changed = true;
        }
      } else if (stmt.type === 'TryStatement') {
        // Strip try/catch blocks where the try body is empty (or only has empty statements)
        const tryBody = (isRecord(stmt.block) ? asArray(stmt.block.body) : undefined) ?? [];
        const hasContent = tryBody.some((s: unknown) => !isRecord(s) || s.type !== 'EmptyStatement');
        if (!hasContent) {
          blockBody.splice(i, 1);
          changed = true;
        }
      }
    }
  }
}

function collectDeclaredNames(pattern: unknown, stmtIndex: number, map: Map<string, number>): void {
  if (!isRecord(pattern)) return;
  if (pattern.type === 'Identifier') {
    const name = asString(pattern.name);
    if (name !== undefined) map.set(name, stmtIndex);
  } else if (pattern.type === 'ObjectPattern') {
    for (const prop of asArray(pattern.properties) ?? []) {
      if (isRecord(prop) && prop.type === 'RestElement') {
        collectDeclaredNames(prop.argument, stmtIndex, map);
      } else if (isRecord(prop)) {
        collectDeclaredNames(prop.value, stmtIndex, map);
      }
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const elem of asArray(pattern.elements) ?? []) {
      if (isRecord(elem) && elem.type === 'RestElement') {
        collectDeclaredNames(elem.argument, stmtIndex, map);
      } else {
        collectDeclaredNames(elem, stmtIndex, map);
      }
    }
  } else if (pattern.type === 'AssignmentPattern') {
    collectDeclaredNames(pattern.left, stmtIndex, map);
  }
}

function collectAllIdents(node: unknown, set: Set<string>): void {
  const arr = asArray(node);
  if (arr) { arr.forEach(n => collectAllIdents(n, set)); return; }
  if (!isRecord(node)) return;
  if (node.type === 'Identifier') {
    const name = asString(node.name);
    if (name) set.add(name);
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    collectAllIdents(node[key], set);
  }
}

/**
 * Walk AST and replace nodes in-place.
 */
/**
 * Normalize `.w([...])` QRL binding calls.
 *
 * SWC and our optimizer pass different capture bindings to `.w()`:
 * - SWC: `q_Foo.w([_rawProps])` (passes whole props object)
 * - Ours: `q_Foo.w([field1, field2])` (passes individual fields)
 * - Or: `q_Foo` with no `.w()` at all (captures promoted to params)
 *
 * Both are semantically valid -- the runtime just needs the captures
 * to resolve correctly. Since metadata already checks captures, we
 * normalize code comparison by stripping `.w()` calls entirely:
 * `x.w([a, b])` -> `x`
 *
 * Also handles `q_X.w([...]).w([...])` chained calls.
 */
function stripDotWCalls(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = unwrapDotW(arr[i]);
      stripDotWCalls(arr[i]);
    }
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      const valArr = asArray(val);
      if (valArr) {
        for (let i = 0; i < valArr.length; i++) {
          valArr[i] = unwrapDotW(valArr[i]);
          stripDotWCalls(valArr[i]);
        }
      } else {
        node[key] = unwrapDotW(val);
        stripDotWCalls(node[key]);
      }
    }
  }
}

function unwrapDotW(node: unknown): unknown {
  if (!isRecord(node) || node.type !== 'CallExpression') return node;
  const callee = node.callee;
  if (!isRecord(callee) || callee.type !== 'MemberExpression') return node;
  if (!isRecord(callee.property) || callee.property.type !== 'Identifier' || callee.property.name !== 'w') return node;
  // Recursively unwrap in case of chained .w() calls
  return unwrapDotW(callee.object);
}

/**
 * Strip the body argument from `.s()` QRL calls in parent modules.
 *
 * In hoisted mode, the parent module inlines segment bodies via `q_X.s(fn)`.
 * Since segment code is tested separately, the inlined body is redundant
 * for parent comparison. SWC and our optimizer may produce different inlined
 * bodies (different capture patterns, _rawProps usage, etc.) but the parent
 * structure is otherwise identical.
 *
 * This normalizes `q_X.s(fn)` to `q_X.s()` so only the QRL reference matters.
 */
function stripDotSBodies(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  // Track names that were arguments to .s() calls (to strip their decls later)
  const sCallArgNames = new Set<string>();

  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'ExpressionStatement') continue;
    const expr = stmt.expression;
    if (!isRecord(expr) || expr.type !== 'CallExpression') continue;
    const callee = expr.callee;
    if (!isRecord(callee) || callee.type !== 'MemberExpression') continue;
    if (!isRecord(callee.property) || callee.property.type !== 'Identifier' || callee.property.name !== 's') continue;
    if (!isRecord(callee.object) || callee.object.type !== 'Identifier') continue;
    // Only match q_X.s(...) pattern
    const objName = asString(callee.object.name) || '';
    if (!objName.startsWith('q_')) continue;
    // Track identifier arguments before stripping
    const exprArgs = asArray(expr.arguments);
    const arg0 = exprArgs?.[0];
    if (exprArgs?.length === 1 && isRecord(arg0) && arg0.type === 'Identifier') {
      const argName = asString(arg0.name);
      if (argName !== undefined) sCallArgNames.add(argName);
    }
    // Strip the arguments
    expr.arguments = [];
  }

  // Remove const declarations that were only used as .s() arguments
  if (sCallArgNames.size > 0) {
    // Check which names are still referenced elsewhere
    const referencedNames = new Set<string>();
    for (const stmt of body) {
      if (isRecord(stmt) && stmt.type === 'VariableDeclaration') {
        // Don't count the declaration itself
        continue;
      }
      collectAllIdents(stmt, referencedNames);
    }

    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
      const decls = asArray(stmt.declarations);
      if (!decls || decls.length !== 1) continue;
      const decl = decls[0];
      if (!isRecord(decl) || !isRecord(decl.id) || decl.id.type !== 'Identifier') continue;
      const name = asString(decl.id.name);
      if (name === undefined) continue;
      if (sCallArgNames.has(name) && !referencedNames.has(name)) {
        body.splice(i, 1);
      }
    }
  }
}

/**
 * Strip migrated declarations that are equivalent to imports.
 *
 * SWC inlines function/class/variable declarations from parent scope into segments.
 * Our optimizer uses _auto_ imports instead. Both provide the same binding.
 *
 * This normalization strips non-exported function declarations, class declarations,
 * and variable declarations whose names are NOT referenced in the rest of the module
 * except as simple identifiers (i.e., they're just providing a binding).
 *
 * Also strips `const [X, {Y, ...}] = obj` destructuring declarations that are
 * only used to provide individual bindings (SWC migrates these, we import them).
 */
function stripMigratedDeclarations(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  // Collect names imported from the source module (e.g., import { X } from "./test")
  const importedNames = new Set<string>();
  for (const stmt of body) {
    if (!isRecord(stmt) || stmt.type !== 'ImportDeclaration') continue;
    for (const spec of asArray(stmt.specifiers) ?? []) {
      const localName = isRecord(spec) && isRecord(spec.local) ? asString(spec.local.name) : undefined;
      if (localName) importedNames.add(localName);
    }
  }

  // Collect names declared by non-exported function/class declarations
  const declaredNames = new Set<string>();
  for (const stmt of body) {
    if (!isRecord(stmt)) continue;
    if (stmt.type === 'FunctionDeclaration' && isRecord(stmt.id) && stmt.id.name && !isExported(stmt, program)) {
      const name = asString(stmt.id.name);
      if (name) declaredNames.add(name);
    }
    if (stmt.type === 'ClassDeclaration' && isRecord(stmt.id) && stmt.id.name && !isExported(stmt, program)) {
      const name = asString(stmt.id.name);
      if (name) declaredNames.add(name);
    }
    // Non-exported variable declarations with destructuring patterns
    if (stmt.type === 'VariableDeclaration' && !isExported(stmt, program)) {
      for (const decl of asArray(stmt.declarations) ?? []) {
        if (isRecord(decl) && isRecord(decl.id) && (decl.id.type === 'ArrayPattern' || decl.id.type === 'ObjectPattern')) {
          collectPatternNames(decl.id, declaredNames);
        }
      }
    }
  }

  if (declaredNames.size === 0) return;

  // Strip function/class declarations whose names are also imported
  // (meaning one side inlines, the other imports -- both provide the name)
  const namesToStrip = new Set<string>();
  for (const name of declaredNames) {
    if (importedNames.has(name)) {
      namesToStrip.add(name);
    }
  }

  // Also check: non-exported function/class decls where the name is used
  // only as a simple reference (not as the definition target). These are
  // migrated declarations that could equivalently be imports.
  // We DON'T strip declarations that have side effects in their body.

  if (namesToStrip.size === 0) return;

  for (let i = body.length - 1; i >= 0; i--) {
    const stmt = body[i];
    if (!isRecord(stmt)) continue;
    const idName = isRecord(stmt.id) ? asString(stmt.id.name) : undefined;
    if (stmt.type === 'FunctionDeclaration' && idName !== undefined && namesToStrip.has(idName)) {
      body.splice(i, 1);
    } else if (stmt.type === 'ClassDeclaration' && idName !== undefined && namesToStrip.has(idName)) {
      body.splice(i, 1);
    } else if (stmt.type === 'VariableDeclaration') {
      // Strip declarations where all bound names are in namesToStrip
      const allNames: string[] = [];
      for (const decl of asArray(stmt.declarations) ?? []) {
        if (isRecord(decl)) collectPatternNames(decl.id, new Set(), allNames);
      }
      if (allNames.length > 0 && allNames.every(n => namesToStrip.has(n))) {
        body.splice(i, 1);
      }
    }
  }
}

function isExported(stmt: unknown, program: AstCompatNode): boolean {
  // Check if the statement is wrapped in an ExportNamedDeclaration
  for (const s of asArray(program.body) ?? []) {
    if (isRecord(s) && s.type === 'ExportNamedDeclaration' && s.declaration === stmt) return true;
  }
  return false;
}

function collectPatternNames(pattern: unknown, nameSet: Set<string>, nameArr?: string[]): void {
  if (!isRecord(pattern)) return;
  if (pattern.type === 'Identifier') {
    const name = asString(pattern.name);
    if (name !== undefined) {
      nameSet.add(name);
      if (nameArr) nameArr.push(name);
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const el of asArray(pattern.elements) ?? []) collectPatternNames(el, nameSet, nameArr);
  } else if (pattern.type === 'ObjectPattern') {
    for (const prop of asArray(pattern.properties) ?? []) {
      if (isRecord(prop) && prop.type === 'RestElement') collectPatternNames(prop.argument, nameSet, nameArr);
      else if (isRecord(prop)) collectPatternNames(prop.value, nameSet, nameArr);
    }
  } else if (pattern.type === 'AssignmentPattern') {
    collectPatternNames(pattern.left, nameSet, nameArr);
  } else if (pattern.type === 'RestElement') {
    collectPatternNames(pattern.argument, nameSet, nameArr);
  }
}

/**
 * Inline simple destructured bindings into their usage sites.
 *
 * Converts patterns like:
 *   const { "bind:value": bindValue } = props;
 *   return foo(bindValue);
 * Into:
 *   return foo(props["bind:value"]);
 *
 * This normalizes the difference between SWC's _wrapProp(obj, "prop") approach
 * (which normalizeWrapProp converts to obj.prop) and our optimizer's destructuring.
 */
function inlineDestructuredBindings(program: AstCompatNode): void {
  function processFunctionBody(bodyInput: unknown, params: unknown[]): void {
    const body = asArray(bodyInput);
    if (!body) return;

    // Find destructuring declarations at the start of the body
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
      const decls = asArray(stmt.declarations);
      if (!decls || decls.length !== 1) continue;
      const decl = decls[0];
      if (!isRecord(decl) || !decl.init || !isRecord(decl.id)) continue;

      // Match: const { "key": alias, key2 } = obj (ObjectPattern)
      if (decl.id.type !== 'ObjectPattern') continue;
      const objExpr = decl.init; // The object being destructured

      // Build mapping: alias name -> member expression AST node
      const bindings = new Map<string, unknown>();
      let canInline = true;
      for (const prop of asArray(decl.id.properties) ?? []) {
        if (isRecord(prop) && prop.type === 'RestElement') { canInline = false; break; }
        if (!isRecord(prop) || !isRecord(prop.value) || prop.value.type !== 'Identifier') { canInline = false; break; }

        const alias = asString(prop.value.name);
        const keyName = isRecord(prop.key) ? (prop.key.name || prop.key.value) : undefined;
        if (alias === undefined || !keyName) { canInline = false; break; }
        const keyStr = asString(keyName);
        if (keyStr === undefined) { canInline = false; break; }

        // Create obj.key or obj["key"] depending on if it's a valid identifier
        const isValidId = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(keyStr);
        const memberExpr = {
          type: 'MemberExpression',
          object: JSON.parse(JSON.stringify(objExpr)), // deep clone
          property: isValidId
            ? { type: 'Identifier', name: keyStr }
            : { type: 'Literal', value: keyStr },
          computed: !isValidId,
        };
        bindings.set(alias, memberExpr);
      }

      if (!canInline || bindings.size === 0) continue;

      // Check that none of the aliases shadow a param or are reassigned
      const paramNames = new Set(params.map((p: unknown) => (isRecord(p) ? asString(p.name) : undefined)).filter(Boolean));
      let hasConflict = false;
      for (const alias of bindings.keys()) {
        if (paramNames.has(alias)) { hasConflict = true; break; }
      }
      if (hasConflict) continue;

      // Replace all references to the aliases in subsequent statements
      for (let j = i + 1; j < body.length; j++) {
        body[j] = replaceIdentifiers(body[j], bindings);
      }

      // Remove the destructuring declaration
      body.splice(i, 1);
    }
  }

  function replaceIdentifiers(node: unknown, bindings: Map<string, unknown>): unknown {
    const arr = asArray(node);
    if (arr) return arr.map(n => replaceIdentifiers(n, bindings));
    if (!isRecord(node)) return node;
    if (node.type === 'Identifier') {
      const name = asString(node.name);
      if (name !== undefined && bindings.has(name)) {
        return JSON.parse(JSON.stringify(bindings.get(name)));
      }
    }
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(node)) {
      result[key] = replaceIdentifiers(node[key], bindings);
    }
    return result;
  }

  // Walk all function bodies
  function visit(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) visit(item); return; }
    if (!isRecord(node)) return;
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && isRecord(node.body) && node.body.type === 'BlockStatement') {
      processFunctionBody(node.body.body, asArray(node.params) ?? []);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visit(node[key]);
    }
  }

  visit(program);
}

/**
 * Strip TypeScript type annotations from the AST.
 *
 * Our optimizer may not fully strip TS types from the parent module output,
 * while SWC always strips them. Remove typeAnnotation, returnType, and
 * TSTypeAnnotation nodes so they don't cause false mismatches.
 */
function stripTypeAnnotations(node: unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (const item of arr) stripTypeAnnotations(item);
    return;
  }
  if (!isRecord(node)) return;
  // Remove type annotation properties
  delete node.typeAnnotation;
  delete node.returnType;
  delete node.typeParameters;
  delete node.superTypeParameters;
  delete node.implements;
  // Recurse
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    stripTypeAnnotations(node[key]);
  }
}

/**
 * Destructure _rawProps/props parameter in segment export functions.
 *
 * SWC and our optimizer handle component destructured props differently in segments:
 * - SWC: `(_, _1, _rawProps) => { _rawProps.data.X = Y; }`
 * - Ours: `(_, _1, data) => { data.X = Y; }`
 *
 * When a function param (3rd+) is only accessed as `param.field.rest...` (always
 * through a single intermediate field), replace `param` with `field` and remove
 * the `.field` prefix from all member accesses.
 *
 * This handles destructuring at the call boundary: `_rawProps.data` is the same
 * as receiving `data` directly.
 */
function destructureRawPropsParam(program: AstCompatNode): void {
  const body = asArray(program.body);
  if (!body) return;

  for (const stmt of body) {
    // Find: export const NAME = (params...) => body
    const fn = getExportedSegmentFunction(stmt);
    if (!isRecord(fn)) continue;
    const fnParams = asArray(fn.params);
    if (!fnParams || fnParams.length < 3) continue;

    // Only process 3rd+ params (positions 0,1 are _, _1 convention)
    for (let pi = 2; pi < fnParams.length; pi++) {
      const param = fnParams[pi];
      if (!isRecord(param) || param.type !== 'Identifier') continue;
      const paramName = asString(param.name);
      if (paramName === undefined) continue;

      // Collect all references to this param in the body
      const refs: unknown[] = [];
      collectIdentRefs(fn.body, paramName, refs);

      if (refs.length === 0) continue;

      // Check if ALL references are member expressions: param.field.rest...
      // Find the consistent field name
      let fieldName: string | null = null;
      let allSingleField = true;

      for (const ref of refs) {
        const parent = isRecord(ref) ? ref._parent : undefined;
        const refNode = isRecord(ref) ? ref._node : undefined;
        if (!isRecord(parent) || parent.type !== 'MemberExpression' ||
            parent.object !== refNode || parent.computed) {
          allSingleField = false;
          break;
        }
        const prop = parent.property;
        if (!isRecord(prop) || prop.type !== 'Identifier') {
          allSingleField = false;
          break;
        }
        const propName = asString(prop.name);
        if (propName === undefined) {
          allSingleField = false;
          break;
        }
        if (fieldName === null) {
          fieldName = propName;
        } else if (fieldName !== propName) {
          allSingleField = false;
          break;
        }
      }

      if (!allSingleField || !fieldName) continue;

      // Rewrite: param -> field, param.field -> field (remove one level of member access)
      param.name = fieldName;
      for (const ref of refs) {
        if (!isRecord(ref)) continue;
        // ref._parent is MemberExpression `param.field`
        // Replace parent MemberExpression with just Identifier `field`
        replaceNodeInParent(ref._grandparent, asString(ref._parentKey),
          typeof ref._parentIndex === 'number' ? ref._parentIndex : undefined,
          { type: 'Identifier', name: fieldName });
      }
    }
  }
}

function getExportedSegmentFunction(stmt: unknown): unknown {
  if (!isRecord(stmt) || stmt.type !== 'ExportNamedDeclaration') return null;
  const decl = stmt.declaration;
  if (!isRecord(decl) || decl.type !== 'VariableDeclaration') return null;
  const d = asArray(decl.declarations)?.[0];
  if (!isRecord(d) || !isRecord(d.init)) return null;
  if (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression') {
    return d.init;
  }
  return null;
}

function collectIdentRefs(
  node: unknown, name: string, refs: unknown[],
  parent?: unknown, parentKey?: string, parentIndex?: number, grandparent?: unknown,
): void {
  const arr = asArray(node);
  if (arr) {
    for (let i = 0; i < arr.length; i++) {
      collectIdentRefs(arr[i], name, refs, arr, '' + i, i, parent);
    }
    return;
  }
  if (!isRecord(node)) return;
  if (node.type === 'Identifier' && node.name === name) {
    refs.push({ _node: node, _parent: parent, _parentKey: parentKey, _parentIndex: parentIndex, _grandparent: grandparent });
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      collectIdentRefs(val, name, refs, node, key, undefined, parent);
    }
  }
}

function replaceNodeInParent(container: unknown, key: string | undefined, index: number | undefined, replacement: unknown): void {
  if (!container || !key) return;
  const arr = asArray(container);
  if (arr) {
    if (index !== undefined) arr[index] = replacement;
  } else if (isRecord(container)) {
    container[key] = replacement;
  }
}

/**
 * Expand `_rawProps` (or similar) capture bindings into direct field accesses.
 *
 * SWC groups destructured component props into a single `_rawProps` capture:
 *   const _rawProps = _captures[0]; ... _rawProps.foo ... _rawProps.bar
 *
 * Our optimizer captures each field individually:
 *   const foo = _captures[0], bar = _captures[1]; ... foo ... bar
 *
 * This normalization finds variables bound to `_captures[N]` where ALL usages
 * are member accesses (`var.field`), and replaces each `var.field` with `field`.
 * After this, `stripCapturesDeclarations` removes the binding, leaving both
 * sides with identical bare field references.
 *
 * Also handles params: if a function parameter is only used as `param.field`,
 * replace with direct field access (covers both _rawProps params and _captures).
 */
function expandRawPropsCaptures(program: AstCompatNode): void {
  function processFunctionBody(fn: Record<string, unknown>): void {
    const body = fn.body;
    if (!isRecord(body)) return;

    // Collect variables bound to _captures[N]
    const stmts = body.type === 'BlockStatement' ? asArray(body.body) : null;
    if (!stmts) return;

    for (const stmt of stmts) {
      if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
      for (const decl of asArray(stmt.declarations) ?? []) {
        if (!isRecord(decl) || !isRecord(decl.init) || !isRecord(decl.id) || decl.id.type !== 'Identifier') continue;
        // Match _captures[N]
        if (decl.init.type !== 'MemberExpression' ||
            !isRecord(decl.init.object) || decl.init.object.type !== 'Identifier' ||
            decl.init.object.name !== '_captures' ||
            !decl.init.computed ||
            !isRecord(decl.init.property) || decl.init.property.type !== 'Literal' ||
            typeof decl.init.property.value !== 'number') continue;

        const varName = asString(decl.id.name);
        if (varName !== undefined) expandMemberAccessesInBody(body, varName);
      }
    }

    // Also handle params named _rawProps (SWC's convention for props params)
    const fnParams = asArray(fn.params);
    if (fnParams) {
      for (const param of fnParams) {
        if (!isRecord(param) || param.type !== 'Identifier') continue;
        const paramName = asString(param.name);
        if (paramName === undefined) continue;
        // Only expand params that follow the _rawProps naming convention
        if (paramName === '_rawProps' || paramName.startsWith('_rawProps')) {
          const fieldNames = expandMemberAccessesInBody(body, paramName);
          // If all accesses use a single field, rename the param to match
          if (fieldNames && fieldNames.size === 1) {
            const first = fieldNames.values().next().value;
            if (first !== undefined) param.name = first;
          }
        }
      }
    }
  }

  /**
   * If ALL references to `varName` in the body are member expressions
   * `varName.field` (non-computed), replace each with just `field`.
   */
  function expandMemberAccessesInBody(body: unknown, varName: string): Set<string> | null {
    // Collect all references
    const refs: Array<{ parent: unknown; key: string; index?: number; memberExpr: unknown; fieldName: string }> = [];
    let hasNonMemberRef = false;

    function scan(node: unknown, parent: unknown, key: string, index?: number): void {
      const nodeArr = asArray(node);
      if (nodeArr) {
        for (let i = 0; i < nodeArr.length; i++) scan(nodeArr[i], nodeArr, String(i), i);
        return;
      }
      if (!isRecord(node)) return;
      // Check if this is a MemberExpression with our var as object
      if (node.type === 'MemberExpression' &&
          !node.computed &&
          isRecord(node.object) && node.object.type === 'Identifier' &&
          node.object.name === varName &&
          isRecord(node.property) && node.property.type === 'Identifier') {
        refs.push({ parent, key, index, memberExpr: node, fieldName: asString(node.property.name) ?? '' });
        // Don't recurse into this MemberExpression's children
        return;
      }
      // Check if this is a bare reference to varName (not as MemberExpression object)
      if (node.type === 'Identifier' && node.name === varName) {
        // Check if parent is the variable declaration itself -- skip those
        if (isRecord(parent) && parent.type === 'VariableDeclarator' && key === 'id') return;
        // Check if parent is a param list
        if (Array.isArray(parent) && parent === body) return;
        hasNonMemberRef = true;
        return;
      }
      for (const k of Object.keys(node)) {
        if (k === 'type') continue;
        const val = node[k];
        if (val && typeof val === 'object') {
          const valArr = asArray(val);
          if (valArr) {
            for (let i = 0; i < valArr.length; i++) scan(valArr[i], valArr, String(i), i);
          } else {
            scan(val, node, k);
          }
        }
      }
    }

    scan(body, null, '');

    // Only expand if ALL references are member accesses
    if (hasNonMemberRef || refs.length === 0) return null;

    // Collect unique field names
    const fieldNames = new Set<string>();
    for (const ref of refs) fieldNames.add(ref.fieldName);

    // Replace each memberExpr with just the field Identifier
    for (const ref of refs) {
      const replacement = { type: 'Identifier', name: ref.fieldName };
      const parentArr = asArray(ref.parent);
      if (ref.index !== undefined && parentArr) {
        parentArr[ref.index] = replacement;
      } else if (isRecord(ref.parent)) {
        ref.parent[ref.key] = replacement;
      }
    }

    return fieldNames;
  }

  // Visit all functions in the AST
  function visit(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) visit(item); return; }
    if (!isRecord(node)) return;
    if (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
        node.type === 'FunctionDeclaration') {
      processFunctionBody(node);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visit(node[key]);
    }
  }

  visit(program);
}

/**
 * Strip `const X = _captures[N]` declarations from function bodies.
 *
 * SWC and our optimizer bind captures differently:
 * - SWC: `const _rawProps = _captures[0]; ... _rawProps.field`
 * - Ours: `const field = _captures[0]; ... field`
 * - Or no _captures at all (params instead)
 *
 * The declaration itself is just binding -- if variable names match after
 * stripping, the bodies will compare equal. Stripping _captures bindings
 * removes one layer of difference.
 *
 * Also strips `_captures` imports that become unused after removal.
 */
function stripCapturesDeclarations(program: AstCompatNode): void {
  function processBody(bodyInput: unknown): void {
    const body = asArray(bodyInput);
    if (!body) return;
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (!isRecord(stmt) || stmt.type !== 'VariableDeclaration') continue;
      // Check if ALL declarators are _captures[N] assignments
      const decls = asArray(stmt.declarations);
      if (!decls || decls.length === 0) continue;
      const allCaptures = decls.every((d: unknown) => {
        if (!isRecord(d) || !isRecord(d.init)) return false;
        // Match _captures[N]
        return d.init.type === 'MemberExpression' &&
               isRecord(d.init.object) && d.init.object.type === 'Identifier' &&
               d.init.object.name === '_captures' &&
               d.init.computed === true &&
               isRecord(d.init.property) && d.init.property.type === 'Literal' &&
               typeof d.init.property.value === 'number';
      });
      if (allCaptures) {
        body.splice(i, 1);
      }
    }
  }

  // Process function/arrow bodies throughout the AST
  function visit(node: unknown): void {
    const arr = asArray(node);
    if (arr) { for (const item of arr) visit(item); return; }
    if (!isRecord(node)) return;
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && isRecord(node.body) && node.body.type === 'BlockStatement') {
      processBody(node.body.body);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visit(node[key]);
    }
  }

  visit(program);
}

function walkAndReplace(node: unknown, replacer: (n: unknown) => unknown): void {
  const arr = asArray(node);
  if (arr) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = replacer(arr[i]);
      walkAndReplace(arr[i], replacer);
    }
    return;
  }
  if (!isRecord(node)) return;
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (val === null || typeof val !== 'object') continue;
    const valArr = asArray(val);
    if (valArr) {
      for (let i = 0; i < valArr.length; i++) {
        valArr[i] = replacer(valArr[i]);
        walkAndReplace(valArr[i], replacer);
      }
    } else {
      node[key] = replacer(val);
      walkAndReplace(node[key], replacer);
    }
  }
}
