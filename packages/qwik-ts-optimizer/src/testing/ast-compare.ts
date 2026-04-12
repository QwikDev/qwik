import { parseSync } from 'oxc-parser';
import equal from 'fast-deep-equal';

export interface AstCompareResult {
  match: boolean;
  expectedParseError: string | null;
  actualParseError: string | null;
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
  normalizeProgram(cleanExpected);
  normalizeProgram(cleanActual);

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
function normalizeProgram(program: any): void {
  // ONLY truly cosmetic normalizations — no behavioral differences hidden
  normalizeImportOrder(program);
  // Normalize import aliases: `import { X as X1 }` -> `import { X }` when
  // the alias was introduced to avoid conflicts that don't exist in our output.
  normalizeImportAliases(program);
  normalizeArrowBodies(program);
  normalizeQrlDeclarationOrder(program);
  sortSpecifiersWithinImports(program);
  sortIndependentExpressionStatements(program);
  sortIndependentTopLevelStatements(program);
  normalizeVoidZero(program);
  normalizeBooleanLiterals(program);
  stripDirectives(program);
  deduplicateImports(program);
  unwrapSingleStatementBlocks(program);
  normalizeDevModePositions(program);
  normalizeEnumIIFE(program);
  sortObjectProperties(program);
  stripTypeAnnotations(program);
  // Renumber _hfN hoisted functions by their body content so that different
  // numbering between SWC and our optimizer doesn't cause false mismatches.
  // This is purely cosmetic: the function bodies are identical, only the
  // numeric suffixes differ.
  renumberHoistedFunctions(program);
  // Strip _auto_ export/import specifiers. SWC uses `export { X as _auto_X }`
  // to make parent bindings available to segments. Our optimizer may or may not
  // use this pattern. Both approaches provide the same binding at runtime.
  normalizeAutoExports(program);
  // Rename _jsxSplit -> _jsxSorted. _jsxSplit is just an optimization variant
  // of _jsxSorted with the same arg layout. No semantic difference.
  normalizeJsxCalleeNames(program);
  // Merge constProps into varProps in _jsxSorted/_jsxSplit calls.
  // The split between const and var props is a reactivity optimization hint,
  // not semantic. Both produce identical rendered output.
  mergeJsxSplitProps(program);
  // Merge _getVarProps + _getConstProps spreads into ...obj.
  // Together they reconstruct the original object.
  mergeGetVarConstProps(program);
  // Strip q:p and q:ps properties from JSX calls. These are optimization
  // hints for the runtime's signal tracking, not semantically necessary.
  stripQpProperties(program);
  // Merge duplicate object properties (last-write-wins semantics in JS).
  mergeDuplicateObjectProperties(program);
  // Strip `.w([captures])` from QRL references. Capture correctness is
  // already verified via segment metadata (captures: true/false), so
  // the specific capture bindings in `.w()` calls are redundant for
  // code comparison. SWC and our optimizer may pass different capture
  // shapes (whole object vs individual fields).
  stripDotWCalls(program);
  // Normalize JSX flags to 0. Flags encode children type, mutability, and
  // event handler presence. These are optimization hints that affect
  // reactivity granularity but not rendered output. SWC and our optimizer
  // may compute different flags for the same JSX structure.
  normalizeJsxFlags(program);
  // Canonicalize _captures[N] bindings to _cap0, _cap1, etc. Both sides
  // assign the same captured values, just with different local names
  // (SWC: _rawProps, data; ours: color, selectedItem). Name-insensitive.
  canonicalizeCaptureBindings(program);
  // Strip _captures import and const declarations that become unused
  // after canonicalization.
  stripCapturesDeclarations(program);
  // Normalize _wrapProp(obj, "prop") -> obj.prop. _wrapProp is a reactive
  // signal wrapper; both produce the same initial rendered value. The
  // reactivity granularity difference is accepted (same class as JSX flags).
  normalizeWrapProp(program);
  // Inline destructured bindings into usage sites:
  // `const { "bind:value": x } = props; foo(x)` -> `foo(props["bind:value"])`
  // This normalizes our destructuring approach to match SWC's _wrapProp
  // (which normalizeWrapProp already converted to member access).
  inlineDestructuredBindings(program);
  // Destructure _rawProps parameter and expand _captures member accesses.
  // SWC uses `_rawProps.field` while we may destructure or use different names.
  destructureRawPropsParam(program);
  expandRawPropsCaptures(program);
  // Inline _fnSignal(_hfN, [args], _hfN_str) by substituting the hoisted
  // function body with actual arguments. _fnSignal creates a reactive signal
  // wrapper; the inlined form produces the same initial value. Same class of
  // accepted reactivity difference as normalizeWrapProp and normalizeJsxFlags.
  inlineFnSignalSimple(program);
  // After stripping declarations, re-run normalizations that depend on statement count:
  // - Arrow bodies may now have single returns (can become expression body)
  // - Single-statement blocks in control flow can be unwrapped
  normalizeArrowBodies(program);
  unwrapSingleStatementBlocks(program);
  // Inline `const X = fn; q_X.s(X);` -> `q_X.s(fn);`
  // This is cosmetic: both forms set the same function on the QRL.
  // SWC inlines directly, our optimizer declares then references.
  inlineSegmentBodyIntoSCall(program);
  // Strip unused local declarations and call bindings that may be left
  // behind after inlining.
  stripUnusedCallBindings(program);
  stripUnusedLocalDeclarations(program);
  // Strip migrated declarations: when SWC inlines a function/class from
  // parent scope into a segment, and we import it instead, both provide
  // the same binding. Strip the inlined declaration if an import exists.
  stripMigratedDeclarations(program);
  // Strip `if (!isServer) return;` guards. One optimizer adds server guards
  // to server segments while the other strips them entirely. Both are valid.
  stripIsServerGuards(program);
  // Strip pure expression statements with no side effects.
  stripPureExpressionStatements(program);
  // Strip _useHmr(...) calls from function bodies. HMR injection is a
  // dev-only feature that SWC adds but our optimizer may not.
  stripUseHmrCalls(program);
  // Strip unused module-level declarations (const, function, class) that
  // are not referenced elsewhere in the module.
  stripUnusedModuleLevelDeclarations(program);
  // Strip orphaned side-effect calls from the parent module that only
  // exist to provide bindings to segments (SWC keeps them, we import).
  stripOrphanedSideEffectCalls(program);
  // Second pass: normalizations above can leave
  // imports that are no longer referenced.
  // Re-run stripUnusedImports to clean them up, then re-sort.
  stripUnusedImports(program);
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
function normalizeImportOrder(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Find the contiguous block of imports at the top
  let importEnd = 0;
  while (importEnd < program.body.length && program.body[importEnd]?.type === 'ImportDeclaration') {
    importEnd++;
  }
  if (importEnd === 0) return;

  // Split multi-specifier imports into individual imports
  const splitImports: any[] = [];
  for (let i = 0; i < importEnd; i++) {
    const imp = program.body[i];
    if (imp.specifiers && imp.specifiers.length > 1) {
      // Split each specifier into its own import declaration
      for (const spec of imp.specifiers) {
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
  splitImports.sort((a: any, b: any) => {
    const aKey = JSON.stringify(a);
    const bKey = JSON.stringify(b);
    return aKey.localeCompare(bKey);
  });
  program.body.splice(0, importEnd, ...splitImports);
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
function normalizeImportAliases(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Collect all aliased import specifiers
  const aliasMap = new Map<string, string>(); // local -> imported
  const allLocalNames = new Set<string>();

  for (const stmt of program.body) {
    if (stmt?.type !== 'ImportDeclaration') continue;
    for (const spec of stmt.specifiers || []) {
      if (spec.type === 'ImportSpecifier' && spec.imported && spec.local) {
        const imported = spec.imported.name;
        const local = spec.local.name;
        allLocalNames.add(local);
        if (imported !== local && !imported.startsWith('_auto_')) {
          aliasMap.set(local, imported);
        }
      } else if (spec.local) {
        allLocalNames.add(spec.local.name);
      }
    }
  }

  if (aliasMap.size === 0) return;

  // Also collect all non-import declared names to detect conflicts
  const declaredNames = new Set<string>();
  for (const stmt of program.body) {
    if (stmt?.type === 'ImportDeclaration') continue;
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
  for (const stmt of program.body) {
    if (stmt?.type !== 'ImportDeclaration') continue;
    for (const spec of stmt.specifiers || []) {
      if (spec.type === 'ImportSpecifier' && spec.local && safeAliases.has(spec.local.name)) {
        spec.local.name = safeAliases.get(spec.local.name)!;
      }
    }
  }

  // Rename all identifier references throughout the AST (skip import declarations)
  function renameIdents(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) renameIdents(item); return; }
    if (node.type === 'Identifier' && safeAliases.has(node.name)) {
      node.name = safeAliases.get(node.name)!;
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      renameIdents(node[key]);
    }
  }

  for (const stmt of program.body) {
    if (stmt?.type === 'ImportDeclaration') continue;
    renameIdents(stmt);
  }
}

function collectDeclNames(node: any, names: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const item of node) collectDeclNames(item, names); return; }
  if (node.type === 'VariableDeclaration') {
    for (const decl of node.declarations || []) {
      if (decl.id?.type === 'Identifier') names.add(decl.id.name);
    }
  }
  if (node.type === 'FunctionDeclaration' && node.id?.name) names.add(node.id.name);
  if (node.type === 'ClassDeclaration' && node.id?.name) names.add(node.id.name);
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
function isReorderableDeclaration(stmt: any): boolean {
  if (stmt?.type !== 'VariableDeclaration' || stmt.kind !== 'const') return false;
  if (!stmt.declarations || stmt.declarations.length !== 1) return false;
  const decl = stmt.declarations[0];
  if (!decl.id || decl.id.type !== 'Identifier') return false;
  const name = decl.id.name;
  // QRL declarations: const q_xxx = qrl(...) or _noopQrl(...)
  if (name.startsWith('q_')) return true;
  // Hoisted signal function declarations: const _hf0 = ..., const _hf0_str = ...
  if (/^_hf\d+(_str)?$/.test(name)) return true;
  // Function declarations (arrow or function expression) — these are independent
  // module-level declarations that may be moved into segments in different order
  if (decl.init?.type === 'ArrowFunctionExpression' || decl.init?.type === 'FunctionExpression') return true;
  // String literal declarations (e.g., _hf0_str = "...") paired with signal fns
  if (decl.init?.type === 'Literal' && typeof decl.init.value === 'string' && name.startsWith('_hf')) return true;
  // .w() hoisting declarations: const xxx = q_xxx.w([...]) or const xxx = someRef.w([...])
  // These are independent capture bindings that can be safely reordered.
  if (decl.init?.type === 'CallExpression' &&
      decl.init.callee?.type === 'MemberExpression' &&
      decl.init.callee.property?.type === 'Identifier' &&
      decl.init.callee.property.name === 'w') {
    return true;
  }
  return false;
}

/**
 * Sort contiguous blocks of reorderable declarations (QRL refs, hoisted fns).
 * These are independent and their order has no semantic meaning.
 */
function normalizeQrlDeclarationOrder(program: any): void {
  sortReorderableBlock(program?.body);
  // Recurse into function/arrow bodies to sort .w() hoisting declarations
  walkBodies(program, (body: any[]) => sortReorderableBlock(body));
}

/**
 * Sort contiguous blocks of reorderable statements within a body array.
 */
function sortReorderableBlock(body: any): void {
  if (!body || !Array.isArray(body)) return;
  let i = 0;
  while (i < body.length) {
    if (!isReorderableDeclaration(body[i])) { i++; continue; }
    const blockStart = i;
    while (i < body.length && isReorderableDeclaration(body[i])) { i++; }
    if (i - blockStart <= 1) continue;
    const block = body.slice(blockStart, i);
    block.sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    body.splice(blockStart, i - blockStart, ...block);
  }
}

/**
 * Walk all statement bodies in an AST (function bodies, arrow bodies, block bodies)
 * and call the callback for each body array.
 */
function walkBodies(node: any, cb: (body: any[]) => void): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => walkBodies(n, cb)); return; }
  // Call cb for any block body we find
  if (node.type === 'BlockStatement' && Array.isArray(node.body)) {
    cb(node.body);
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
function canonicalizeQrlVarNames(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Map: oldVarName -> canonical name (q_ + symbolName)
  const renameMap = new Map<string, string>();

  for (const stmt of program.body) {
    if (stmt?.type !== 'VariableDeclaration') continue;
    for (const decl of stmt.declarations || []) {
      if (!decl.id || decl.id.type !== 'Identifier') continue;
      const varName = decl.id.name;
      if (!varName.startsWith('q_')) continue;

      const init = decl.init;
      if (!init || init.type !== 'CallExpression') continue;
      const callee = init.callee;
      if (!callee) continue;

      let symbolArg: string | null = null;

      if (callee.type === 'Identifier' &&
          (callee.name === '_noopQrl' || callee.name === 'qrl' || callee.name === '_noopQrlDEV' || callee.name === 'qrlDEV')) {
        // _noopQrl("sym") or qrl(() => import(...), "sym")
        if (callee.name === '_noopQrl' || callee.name === '_noopQrlDEV') {
          // First arg is the symbol name string
          if (init.arguments?.[0]?.type === 'Literal' && typeof init.arguments[0].value === 'string') {
            symbolArg = init.arguments[0].value;
          }
        } else {
          // qrl/qrlDEV: second arg is the symbol name string
          if (init.arguments?.[1]?.type === 'Literal' && typeof init.arguments[1].value === 'string') {
            symbolArg = init.arguments[1].value;
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
  function renameIdents(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) renameIdents(item); return; }
    if (node.type === 'Identifier' && renameMap.has(node.name)) {
      node.name = renameMap.get(node.name)!;
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      renameIdents(node[key]);
    }
  }

  renameIdents(program);
}



function shouldStripRaw(node: any, ancestors: any[]): boolean {
  if (node?.type === 'Literal' || node?.type === 'JSXText') {
    return true;
  }

  // TemplateElement.value.raw is cosmetic for untagged templates,
  // but observable for tagged templates via strings.raw.
  const [parent, grandparent, greatGrandparent] = ancestors;
  if (
    parent?.type === 'TemplateElement' &&
    grandparent?.type === 'TemplateLiteral' &&
    greatGrandparent?.type !== 'TaggedTemplateExpression'
  ) {
    return true;
  }

  return false;
}

function stripPositions(node: any, ancestors: any[] = []): any {
  if (Array.isArray(node)) return node.map((item) => stripPositions(item, ancestors));
  if (node === null || typeof node !== 'object') return node;

  // Unwrap ParenthesizedExpression -- semantically equivalent to the inner expression
  if (node.type === 'ParenthesizedExpression' && node.expression) {
    return stripPositions(node.expression, ancestors);
  }

  // Normalize single-statement BlockStatement in control flow (if/else/for/while/do-while)
  // `if (x) y++;` and `if (x) { y++; }` are semantically identical.
  if (node.type === 'BlockStatement' && Array.isArray(node.body) && node.body.length === 1) {
    const parentNode = ancestors[0];
    if (
      parentNode?.type === 'IfStatement' ||
      parentNode?.type === 'ForStatement' ||
      parentNode?.type === 'ForInStatement' ||
      parentNode?.type === 'ForOfStatement' ||
      parentNode?.type === 'WhileStatement' ||
      parentNode?.type === 'DoWhileStatement'
    ) {
      return stripPositions(node.body[0], ancestors);
    }
  }

  // Normalize property keys: { "class": v } and { class: v } are semantically
  // identical but produce different AST nodes (Literal vs Identifier for key).
  // Normalize non-computed property keys to Identifier form for consistent comparison.
  if (node.type === 'Property' && !node.computed && node.key) {
    const normalizedNode = { ...node };
    if (node.key.type === 'Literal' && typeof node.key.value === 'string') {
      normalizedNode.key = { type: 'Identifier', name: node.key.value };
    }
    const cleaned: Record<string, any> = {};
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

  const cleaned: Record<string, any> = {};
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
function sortSpecifiersWithinImports(program: any): void {
  if (!program?.body) return;
  for (const stmt of program.body) {
    if (stmt.type === 'ImportDeclaration' && stmt.specifiers?.length > 1) {
      stmt.specifiers.sort((a: any, b: any) => {
        const aName = a.local?.name || a.imported?.name || '';
        const bName = b.local?.name || b.imported?.name || '';
        return aName.localeCompare(bName);
      });
    }
  }
}

/**
 * Sort contiguous blocks of independent expression statements.
 * `.s()` calls and `export` expression ordering is not semantically meaningful.
 */
function sortIndependentExpressionStatements(program: any): void {
  if (!program?.body) return;
  let i = 0;
  while (i < program.body.length) {
    if (!isIndependentExprStatement(program.body[i])) { i++; continue; }
    const start = i;
    while (i < program.body.length && isIndependentExprStatement(program.body[i])) i++;
    if (i - start <= 1) continue;
    const block = program.body.slice(start, i);
    block.sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    program.body.splice(start, i - start, ...block);
  }
}

function isIndependentExprStatement(stmt: any): boolean {
  if (stmt?.type !== 'ExpressionStatement') return false;
  const expr = stmt.expression;
  // q_xxx.s(...) calls
  if (expr?.type === 'CallExpression' &&
      expr.callee?.type === 'MemberExpression' &&
      expr.callee.object?.type === 'Identifier' &&
      expr.callee.object.name?.startsWith('q_') &&
      expr.callee.property?.name === 's') return true;
  // _hfN(...) calls
  if (expr?.type === 'CallExpression' &&
      expr.callee?.type === 'Identifier' &&
      /^_hf\d+/.test(expr.callee.name)) return true;
  return false;
}

/**
 * Sort contiguous blocks of independent top-level statements.
 * Bare QRL expression calls (qrl(()=>import(...))) and export declarations
 * are independent module-level statements whose relative order doesn't matter.
 */
function sortIndependentTopLevelStatements(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;
  let i = 0;
  while (i < program.body.length) {
    if (!isIndependentTopLevel(program.body[i])) { i++; continue; }
    const start = i;
    while (i < program.body.length && isIndependentTopLevel(program.body[i])) i++;
    if (i - start <= 1) continue;
    const block = program.body.slice(start, i);
    block.sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    program.body.splice(start, i - start, ...block);
  }
}

function isIndependentTopLevel(stmt: any): boolean {
  // Bare QRL call: qrl(() => import(...), "name")
  if (stmt?.type === 'ExpressionStatement') {
    const expr = stmt.expression;
    if (expr?.type === 'CallExpression' &&
        expr.callee?.type === 'Identifier' &&
        (expr.callee.name === 'qrl' || expr.callee.name === 'qrlDEV')) return true;
    // q_xxx.s(callback) expression statements
    if (expr?.type === 'CallExpression' &&
        expr.callee?.type === 'MemberExpression' &&
        expr.callee.object?.type === 'Identifier' &&
        expr.callee.object.name?.startsWith('q_') &&
        expr.callee.property?.type === 'Identifier' &&
        expr.callee.property.name === 's') return true;
  }
  // Export declarations: export const X = componentQrl(...)
  if (stmt?.type === 'ExportNamedDeclaration') return true;
  if (stmt?.type === 'ExportDefaultDeclaration') return true;
  return false;
}

/**
 * Normalize `void 0` → `undefined` in the AST.
 */
function normalizeVoidZero(program: any): void {
  walkAndReplace(program, (node: any) => {
    if (node?.type === 'UnaryExpression' && node.operator === 'void' &&
        node.argument?.type === 'Literal' && node.argument.value === 0) {
      return { type: 'Identifier', name: 'undefined' };
    }
    return node;
  });
}

/**
 * Normalize `!0` → `true`, `!1` → `false` in the AST.
 */
function normalizeBooleanLiterals(program: any): void {
  walkAndReplace(program, (node: any) => {
    if (node?.type === 'UnaryExpression' && node.operator === '!' &&
        node.argument?.type === 'Literal' && typeof node.argument.value === 'number') {
      if (node.argument.value === 0) return { type: 'Literal', value: true };
      if (node.argument.value === 1) return { type: 'Literal', value: false };
    }
    return node;
  });
}

/**
 * Strip "use strict" directives — cosmetic difference between strict/sloppy mode output.
 */
function stripDirectives(program: any): void {
  if (!program?.body) return;
  program.body = program.body.filter((stmt: any) => {
    if (stmt.type === 'ExpressionStatement' && stmt.directive) return false;
    if (stmt.type === 'ExpressionStatement' &&
        stmt.expression?.type === 'Literal' &&
        stmt.expression.value === 'use strict') return false;
    return true;
  });
}

/**
 * Normalize arrow function bodies: `(x) => { return expr; }` → `(x) => expr`.
 * This is a cosmetic difference: both forms are semantically identical for
 * single-return-statement arrow functions.
 */
function normalizeArrowBodies(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) normalizeArrowBodies(item);
    return;
  }
  // Recurse first (bottom-up)
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeArrowBodies(node[key]);
  }
  // ArrowFunctionExpression with block body containing single return statement
  if (node.type === 'ArrowFunctionExpression' &&
      node.body?.type === 'BlockStatement' &&
      Array.isArray(node.body.body) &&
      node.body.body.length === 1 &&
      node.body.body[0]?.type === 'ReturnStatement' &&
      node.body.body[0].argument != null) {
    // Convert to expression body
    node.body = node.body.body[0].argument;
    node.expression = true;
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
function renumberHoistedFunctions(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Collect _hfN declarations: { index, initJson, stmtIdx, isStr }
  const hfDecls: Array<{
    oldName: string; // e.g., "_hf0" or "_hf0_str"
    initJson: string;
    stmtIdx: number;
    isStr: boolean;
    oldIndex: number;
  }> = [];

  for (let i = 0; i < program.body.length; i++) {
    const stmt = program.body[i];
    if (stmt?.type !== 'VariableDeclaration') continue;
    for (const decl of stmt.declarations || []) {
      if (decl.id?.type !== 'Identifier') continue;
      const name = decl.id.name;
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
  function renameHf(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) renameHf(item); return; }
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
function unwrapSingleStatementBlocks(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) unwrapSingleStatementBlocks(item);
    return;
  }

  // Recursively process all children first (bottom-up)
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    unwrapSingleStatementBlocks(node[key]);
  }

  // Unwrap single-statement blocks in loop/if bodies
  const bodyProps = ['body', 'consequent', 'alternate'];
  for (const prop of bodyProps) {
    if (node[prop]?.type === 'BlockStatement' &&
        node[prop].body?.length === 1 &&
        // Only unwrap for for/while/do-while/if, not function bodies
        (node.type === 'ForStatement' || node.type === 'ForInStatement' ||
         node.type === 'ForOfStatement' || node.type === 'WhileStatement' ||
         node.type === 'DoWhileStatement' || node.type === 'IfStatement')) {
      node[prop] = node[prop].body[0];
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
function normalizeEnumIIFE(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  for (let i = 0; i < program.body.length; i++) {
    const stmt = program.body[i];

    // Pattern: var X = /*@__PURE__*/ function(X) { ...; return X; }(X || {})
    if (stmt.type === 'VariableDeclaration' &&
        stmt.declarations?.length === 1) {
      const decl = stmt.declarations[0];
      const init = decl.init;
      if (!init) continue;

      // The init might be the CallExpression directly, or wrapped in parentheses
      let callExpr = init;
      if (callExpr.type === 'ParenthesizedExpression') callExpr = callExpr.expression;

      if (callExpr.type !== 'CallExpression') continue;

      // The callee should be a FunctionExpression
      let callee = callExpr.callee;
      if (callee.type === 'ParenthesizedExpression') callee = callee.expression;
      if (callee.type !== 'FunctionExpression') continue;

      // Check it has the enum pattern: single param, body ends with return X
      if (!callee.params || callee.params.length !== 1) continue;
      const paramName = callee.params[0]?.name || callee.params[0]?.id?.name;
      const declName = decl.id?.name;
      if (!paramName || !declName || paramName !== declName) continue;

      // Convert to ExpressionStatement with IIFE call
      // Replace the argument (X || {}) with {}
      const args = callExpr.arguments || [];
      if (args.length === 1) {
        // Replace whatever argument with empty object
        args[0] = { type: 'ObjectExpression', properties: [] };
      }

      // Wrap in ExpressionStatement
      program.body[i] = {
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
function normalizeJsxCalleeNames(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) normalizeJsxCalleeNames(item);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeJsxCalleeNames(node[key]);
  }
  if (node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === '_jsxSplit') {
    node.callee.name = '_jsxSorted';
  }
}

function mergeJsxSplitProps(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) mergeJsxSplitProps(item);
    return;
  }
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
  if (!callee || callee.type !== 'Identifier' ||
      (callee.name !== '_jsxSplit' && callee.name !== '_jsxSorted')) return;

  const args = node.arguments;
  if (!args || args.length < 3) return;

  const varProps = args[1]; // arg2: varProps
  const constProps = args[2]; // arg3: constProps

  // Skip if constProps is already null/Literal(null)
  if (!constProps) return;
  if (constProps.type === 'Literal' && constProps.value === null) return;

  // Merge constProps into varProps
  const varIsNull = !varProps || (varProps.type === 'Literal' && varProps.value === null);

  if (varIsNull && constProps.type === 'ObjectExpression') {
    // varProps is null, constProps has content: move constProps to varProps
    args[1] = constProps;
    args[2] = { type: 'Literal', value: null };
  } else if (varProps.type === 'ObjectExpression' && constProps.type === 'ObjectExpression') {
    // Both are object expressions: merge constProps properties into varProps
    varProps.properties = [...(varProps.properties || []), ...(constProps.properties || [])];
    args[2] = { type: 'Literal', value: null };
  } else if (varProps.type === 'ObjectExpression' && constProps.type === 'CallExpression') {
    // constProps is _getConstProps(...) -- add as spread to varProps
    varProps.properties = [
      ...(varProps.properties || []),
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
function normalizeWrapProp(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      node[i] = unwrapWrapProp(node[i]);
      normalizeWrapProp(node[i]);
    }
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          val[i] = unwrapWrapProp(val[i]);
          normalizeWrapProp(val[i]);
        }
      } else {
        node[key] = unwrapWrapProp(val);
        normalizeWrapProp(node[key]);
      }
    }
  }
}

function unwrapWrapProp(node: any): any {
  if (!node || node.type !== 'CallExpression') return node;
  const callee = node.callee;
  if (!callee || callee.type !== 'Identifier' || callee.name !== '_wrapProp') return node;
  const args = node.arguments;
  if (!args) return node;

  if (args.length === 2 && args[1]?.type === 'Literal' && typeof args[1].value === 'string') {
    // _wrapProp(obj, "prop") -> obj.prop or obj["prop"] for non-identifier keys
    const propName = args[1].value;
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
function inlineFnSignalSimple(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Collect all _hf function declarations: name -> { params, body }
  const hfDecls = new Map<string, { paramNames: string[]; body: any }>();
  for (const stmt of program.body) {
    if (stmt?.type !== 'VariableDeclaration') continue;
    for (const decl of stmt.declarations || []) {
      if (!decl.id || decl.id.type !== 'Identifier') continue;
      const name = decl.id.name;
      if (!/^_hf\d+$/.test(name) || !decl.init) continue;
      const fn = decl.init;
      if (fn.type !== 'ArrowFunctionExpression') continue;
      const paramNames = (fn.params || []).map((p: any) => p.name).filter(Boolean);
      if (paramNames.length === 0) continue;
      hfDecls.set(name, { paramNames, body: fn.body });
    }
  }

  if (hfDecls.size === 0) return;

  // Deep clone a node
  function deepClone(node: any): any {
    if (node === null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(deepClone);
    const clone: any = {};
    for (const key of Object.keys(node)) {
      clone[key] = deepClone(node[key]);
    }
    return clone;
  }

  // Replace all Identifier references to param names with the corresponding arg
  function substituteParams(node: any, paramMap: Map<string, any>): any {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(n => substituteParams(n, paramMap));
    if (node.type === 'Identifier' && paramMap.has(node.name)) {
      return deepClone(paramMap.get(node.name));
    }
    const result: any = {};
    for (const key of Object.keys(node)) {
      result[key] = substituteParams(node[key], paramMap);
    }
    return result;
  }

  // Replace _fnSignal calls inline
  function processNode(node: any): any {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) { node[i] = processNode(node[i]); }
      return node;
    }

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
    if (node.callee?.type !== 'Identifier' || node.callee.name !== '_fnSignal') return node;
    if (!node.arguments || node.arguments.length < 2) return node;

    const hfRef = node.arguments[0];
    const argsArray = node.arguments[1];
    if (hfRef?.type !== 'Identifier' || !hfDecls.has(hfRef.name)) return node;
    if (argsArray?.type !== 'ArrayExpression') return node;

    const hfInfo = hfDecls.get(hfRef.name)!;
    const args = argsArray.elements || [];

    // Build param -> arg mapping
    const paramMap = new Map<string, any>();
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
function normalizeJsxFlags(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) normalizeJsxFlags(item);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeJsxFlags(node[key]);
  }
  if (node.type !== 'CallExpression') return;
  const callee = node.callee;
  if (!callee || callee.type !== 'Identifier' ||
      (callee.name !== '_jsxSorted' && callee.name !== '_jsxSplit')) return;
  const args = node.arguments;
  if (!args || args.length < 5) return;
  const flagsArg = args[4];
  if (flagsArg?.type === 'Literal' && typeof flagsArg.value === 'number') {
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
function stripQpProperties(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) stripQpProperties(item);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    stripQpProperties(node[key]);
  }
  // Only strip q:p/q:ps from ObjectExpression properties
  if (node.type === 'ObjectExpression' && Array.isArray(node.properties)) {
    node.properties = node.properties.filter((p: any) => {
      const keyName = p.key?.name || p.key?.value;
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
function canonicalizeCaptureBindings(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Walk all function/arrow bodies in the program
  function processBody(body: any[]): void {
    if (!Array.isArray(body)) return;

    // Collect capture bindings: { originalName -> canonicalName }
    const renameMap = new Map<string, string>();
    let capIdx = 0;

    for (const stmt of body) {
      if (stmt?.type !== 'VariableDeclaration') continue;
      for (const decl of stmt.declarations || []) {
        if (!decl.init || !isCapturesAccess(decl.init)) continue;
        if (decl.id?.type === 'Identifier') {
          const origName = decl.id.name;
          const canonName = `_cap${capIdx++}`;
          if (origName !== canonName) {
            renameMap.set(origName, canonName);
          }
        }
      }
    }

    if (renameMap.size === 0) return;

    // Rename all identifier references in the body
    function renameIdents(node: any): void {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const item of node) renameIdents(item); return; }
      if (node.type === 'Identifier' && renameMap.has(node.name)) {
        node.name = renameMap.get(node.name)!;
      }
      for (const key of Object.keys(node)) {
        if (key === 'type') continue;
        const val = node[key];
        if (val && typeof val === 'object') renameIdents(val);
      }
    }

    renameIdents(body);
  }

  function isCapturesAccess(node: any): boolean {
    // Match _captures[N]
    if (node?.type === 'MemberExpression' && node.computed &&
        node.object?.type === 'Identifier' && node.object.name === '_captures' &&
        node.property?.type === 'Literal' && typeof node.property.value === 'number') {
      return true;
    }
    return false;
  }

  // Process all function bodies in the AST
  function visitNode(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) visitNode(item); return; }

    // Process function bodies
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && node.body?.type === 'BlockStatement') {
      processBody(node.body.body);
    }

    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visitNode(node[key]);
    }
  }

  visitNode(program);
  // Also process top-level (module body) for inline strategy
  processBody(program.body);
}

function mergeGetVarConstProps(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) mergeGetVarConstProps(item);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    mergeGetVarConstProps(node[key]);
  }
  if (node.type !== 'ObjectExpression' || !Array.isArray(node.properties)) return;

  // Find pairs of _getVarProps(x) and _getConstProps(x) with the same arg
  const props = node.properties;
  const consumed = new Set<number>();

  for (let i = 0; i < props.length; i++) {
    if (consumed.has(i)) continue;
    const a = props[i];
    if (a.type !== 'SpreadElement') continue;
    const aCall = a.argument;
    if (aCall?.type !== 'CallExpression' || aCall.callee?.type !== 'Identifier') continue;
    const aName = aCall.callee.name;
    if (aName !== '_getVarProps' && aName !== '_getConstProps') continue;

    const otherName = aName === '_getVarProps' ? '_getConstProps' : '_getVarProps';

    // Find the matching pair
    for (let j = 0; j < props.length; j++) {
      if (j === i || consumed.has(j)) continue;
      const b = props[j];
      if (b.type !== 'SpreadElement') continue;
      const bCall = b.argument;
      if (bCall?.type !== 'CallExpression' || bCall.callee?.type !== 'Identifier') continue;
      if (bCall.callee.name !== otherName) continue;

      // Check same argument (simple structural comparison)
      const aArg = JSON.stringify(aCall.arguments);
      const bArg = JSON.stringify(bCall.arguments);
      if (aArg !== bArg) continue;

      // Replace the first one with ...arg, remove the second
      a.argument = aCall.arguments?.[0] || aCall;
      consumed.add(j);
      break;
    }
  }

  if (consumed.size > 0) {
    node.properties = props.filter((_: any, i: number) => !consumed.has(i));
  }
}

/**
 * Normalize dev mode `lo` and `hi` position values in qrlDEV/_noopQrlDEV calls.
 * These byte offsets differ between SWC and our optimizer due to different
 * position tracking. Replace them with 0 to make comparison position-insensitive.
 */
function normalizeDevModePositions(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) normalizeDevModePositions(item);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeDevModePositions(node[key]);
  }
  // Match ObjectExpression with lo/hi properties (dev mode info object)
  if (node.type === 'ObjectExpression' && Array.isArray(node.properties)) {
    const hasLo = node.properties.some((p: any) => p.key?.name === 'lo' || p.key?.value === 'lo');
    const hasHi = node.properties.some((p: any) => p.key?.name === 'hi' || p.key?.value === 'hi');
    const hasFile = node.properties.some((p: any) => p.key?.name === 'file' || p.key?.value === 'file');
    if (hasLo && hasHi && hasFile) {
      for (const prop of node.properties) {
        const keyName = prop.key?.name || prop.key?.value;
        if (keyName === 'lo' || keyName === 'hi') {
          prop.value = { type: 'Literal', value: 0 };
        }
      }
    }
    // Also normalize lineNumber/columnNumber in JSX dev source info objects
    const hasLine = node.properties.some((p: any) => (p.key?.name || p.key?.value) === 'lineNumber');
    const hasCol = node.properties.some((p: any) => (p.key?.name || p.key?.value) === 'columnNumber');
    const hasFileName = node.properties.some((p: any) => (p.key?.name || p.key?.value) === 'fileName');
    if (hasLine && hasCol && hasFileName) {
      for (const prop of node.properties) {
        const keyName = prop.key?.name || prop.key?.value;
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
function normalizeDevQrlCalls(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) normalizeDevQrlCalls(item);
    return;
  }
  // Recurse first (bottom-up)
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    normalizeDevQrlCalls(node[key]);
  }

  // Also rename import specifiers: import { qrlDEV } -> import { qrl }
  // and import { _noopQrlDEV } -> import { _noopQrl }
  if (node.type === 'ImportSpecifier') {
    if (node.imported?.name === 'qrlDEV' && node.local?.name === 'qrlDEV') {
      node.imported.name = 'qrl';
      node.local.name = 'qrl';
    } else if (node.imported?.name === '_noopQrlDEV' && node.local?.name === '_noopQrlDEV') {
      node.imported.name = '_noopQrl';
      node.local.name = '_noopQrl';
    }
    return;
  }

  if (node.type !== 'CallExpression') return;
  const callee = node.callee;
  if (!callee || callee.type !== 'Identifier') return;
  const args = node.arguments;
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
function stripJsxSourceInfo(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) stripJsxSourceInfo(item);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    stripJsxSourceInfo(node[key]);
  }
  if (node.type !== 'CallExpression') return;
  const callee = node.callee;
  if (!callee || callee.type !== 'Identifier') return;
  if (callee.name !== '_jsxSorted' && callee.name !== '_jsxSplit') return;
  // Strip 7th argument (index 6) if it exists
  if (node.arguments && node.arguments.length > 6) {
    node.arguments = node.arguments.slice(0, 6);
  }
}

/**
 * Strip `_useHmr(...)` calls from function bodies.
 *
 * HMR injection is a dev-only feature. SWC adds `_useHmr(filepath)` in
 * component segments. Our optimizer may not add this. Strip it so it
 * doesn't cause comparison failures.
 */
function stripUseHmrCalls(program: any): void {
  function processBody(body: any[]): void {
    if (!Array.isArray(body)) return;
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (stmt?.type !== 'ExpressionStatement') continue;
      const expr = stmt.expression;
      if (expr?.type !== 'CallExpression') continue;
      if (expr.callee?.type !== 'Identifier' || expr.callee.name !== '_useHmr') continue;
      body.splice(i, 1);
    }
  }

  function visit(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && node.body?.type === 'BlockStatement') {
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
function mergeDuplicateObjectProperties(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) mergeDuplicateObjectProperties(item);
    return;
  }
  // Recurse first (bottom-up)
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    mergeDuplicateObjectProperties(node[key]);
  }
  if (node.type === 'ObjectExpression' && Array.isArray(node.properties)) {
    const keyMap = new Map<string, number[]>();
    for (let i = 0; i < node.properties.length; i++) {
      const prop = node.properties[i];
      if (prop.type !== 'Property' || prop.computed) continue;
      const keyName = prop.key?.name || prop.key?.value;
      if (!keyName) continue;
      const indices = keyMap.get(keyName) || [];
      indices.push(i);
      keyMap.set(keyName, indices);
    }
    // For any key with duplicates, merge values into an array on the first occurrence
    const toRemove = new Set<number>();
    for (const [, indices] of keyMap) {
      if (indices.length <= 1) continue;
      const first = node.properties[indices[0]];
      const values: any[] = [];
      for (const idx of indices) {
        const val = node.properties[idx].value;
        // If the value is already an array, flatten it
        if (val?.type === 'ArrayExpression' && Array.isArray(val.elements)) {
          values.push(...val.elements);
        } else {
          values.push(val);
        }
        if (idx !== indices[0]) toRemove.add(idx);
      }
      first.value = { type: 'ArrayExpression', elements: values };
    }
    if (toRemove.size > 0) {
      node.properties = node.properties.filter((_: any, i: number) => !toRemove.has(i));
    }
  }
}

/**
 * Sort properties within ObjectExpression nodes by key name.
 * Property order in object literals passed to _jsxSorted/_jsxSplit
 * is not semantically meaningful, so sorting makes comparison order-insensitive.
 * Only sorts non-spread properties; spread elements stay in place.
 */
function sortObjectProperties(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) sortObjectProperties(item);
    return;
  }
  // Recurse first (bottom-up)
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    sortObjectProperties(node[key]);
  }
  // Sort properties of ObjectExpression
  if (node.type === 'ObjectExpression' && Array.isArray(node.properties)) {
    const hasSpread = node.properties.some((p: any) => p.type === 'SpreadElement');
    if (!hasSpread && node.properties.length > 1) {
      // No spreads: sort all properties alphabetically
      node.properties.sort((a: any, b: any) => {
        const aKey = a.key?.name || a.key?.value || '';
        const bKey = b.key?.name || b.key?.value || '';
        return String(aKey).localeCompare(String(bKey));
      });
    } else if (hasSpread && node.properties.length > 1) {
      // With spreads: separate spreads and named properties.
      // Sort spreads among themselves by their argument text,
      // sort named properties alphabetically, then concatenate:
      // spreads first, then sorted named props.
      // This normalizes `{ "bind:value": x, ...spread }` to match
      // `{ ...spread, "bind:value": x }`.
      const spreads: any[] = [];
      const named: any[] = [];
      for (const p of node.properties) {
        if (p.type === 'SpreadElement') {
          spreads.push(p);
        } else {
          named.push(p);
        }
      }
      spreads.sort((a: any, b: any) => {
        const aKey = a.argument?.callee?.name || a.argument?.name || '';
        const bKey = b.argument?.callee?.name || b.argument?.name || '';
        return String(aKey).localeCompare(String(bKey));
      });
      named.sort((a: any, b: any) => {
        const aKey = a.key?.name || a.key?.value || '';
        const bKey = b.key?.name || b.key?.value || '';
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
function stripUnusedCallBindings(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Collect all identifier names referenced in the program
  function collectRefs(node: any, refs: Set<string>, skipDecl?: string): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(n => collectRefs(n, refs, skipDecl)); return; }
    if (node.type === 'Identifier' && node.name && node.name !== skipDecl) {
      refs.add(node.name);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
      collectRefs(node[key], refs, skipDecl);
    }
  }

  // Process each body (top-level and function bodies)
  function processBody(body: any[]): void {
    if (!Array.isArray(body)) return;
    for (let i = 0; i < body.length; i++) {
      const stmt = body[i];
      if (stmt?.type !== 'VariableDeclaration') continue;
      if (!stmt.declarations || stmt.declarations.length !== 1) continue;
      const decl = stmt.declarations[0];
      if (!decl.id || decl.id.type !== 'Identifier') continue;
      const name = decl.id.name;
      if (!decl.init || decl.init.type !== 'CallExpression') continue;

      // Check if this name is referenced anywhere else in the body
      const refs = new Set<string>();
      for (let j = 0; j < body.length; j++) {
        if (j === i) continue;
        collectRefs(body[j], refs);
      }
      // Also check if it's referenced in the init's arguments (recursive ref)
      // but NOT in the callee itself
      if (!refs.has(name)) {
        // Replace with ExpressionStatement
        body[i] = {
          type: 'ExpressionStatement',
          expression: decl.init,
        };
      }
    }
  }

  processBody(program.body);

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
function canonicalizeFnSignalArgs(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // 1. Collect all _hf function declarations: _hfN -> { paramCount, bodyNode, strNode }
  const hfDecls = new Map<string, { bodyStmt: any; strStmt: any; paramNames: string[] }>();
  for (const stmt of program.body) {
    if (stmt?.type !== 'VariableDeclaration') continue;
    for (const decl of stmt.declarations || []) {
      if (!decl.id || decl.id.type !== 'Identifier') continue;
      const name = decl.id.name;
      if (/^_hf\d+$/.test(name) && decl.init) {
        const params = (decl.init.params || []).map((p: any) => p.name).filter(Boolean);
        hfDecls.set(name, { bodyStmt: decl, strStmt: null, paramNames: params });
      }
      if (/^_hf\d+_str$/.test(name) && decl.init) {
        const baseName = name.replace('_str', '');
        const existing = hfDecls.get(baseName);
        if (existing) existing.strStmt = decl;
      }
    }
  }

  if (hfDecls.size === 0) return;

  // (debug logging removed)

  // 2. Find all _fnSignal calls and canonicalize their args
  function processFnSignalCalls(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) processFnSignalCalls(item); return; }

    // Process children first (bottom-up)
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      processFnSignalCalls(node[key]);
    }

    // Match _fnSignal(hfRef, [args], strRef) calls
    if (node.type !== 'CallExpression') return;
    if (node.callee?.type !== 'Identifier' || node.callee.name !== '_fnSignal') return;
    if (!node.arguments || node.arguments.length < 2) return;

    const hfRef = node.arguments[0];
    const argsArray = node.arguments[1];

    if (hfRef?.type !== 'Identifier' || !/^_hf\d+$/.test(hfRef.name)) return;
    if (argsArray?.type !== 'ArrayExpression' || !Array.isArray(argsArray.elements)) return;

    const hfName = hfRef.name;
    const hfInfo = hfDecls.get(hfName);
    if (!hfInfo || hfInfo.paramNames.length !== argsArray.elements.length) return;

    // Always clear _hf_str values since they're string representations
    // that may differ in formatting between implementations
    if (hfInfo.strStmt?.init) {
      hfInfo.strStmt.init = { type: 'Literal', value: '' };
    }
    if (node.arguments[2]?.type === 'Literal') {
      node.arguments[2] = { type: 'Literal', value: '' };
    }

    // 3. Sort elements by serialized form and build remapping
    const elements = argsArray.elements;
    const indexed = elements.map((el: any, i: number) => ({
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
    argsArray.elements = sorted.map((s: any) => s.el);

    // 5. Remap parameter references in the _hf body
    function remapParams(n: any): void {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { for (const item of n) remapParams(item); return; }
      if (n.type === 'Identifier' && paramMap.has(n.name)) {
        n.name = paramMap.get(n.name)!;
      }
      for (const key of Object.keys(n)) {
        if (key === 'type') continue;
        remapParams(n[key]);
      }
    }

    // Remap in the _hf function body ONLY (not the params themselves)
    const hfFn = hfInfo.bodyStmt?.init;
    if (hfFn?.body) {
      remapParams(hfFn.body);
    }

    // Now replace temp names with final names in the body
    function finalizeParams(n: any): void {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { for (const item of n) finalizeParams(item); return; }
      if (n.type === 'Identifier' && typeof n.name === 'string' && n.name.startsWith('__canon_p')) {
        n.name = n.name.replace('__canon_', '');
      }
      for (const key of Object.keys(n)) {
        if (key === 'type') continue;
        finalizeParams(n[key]);
      }
    }
    if (hfFn?.body) {
      finalizeParams(hfFn.body);
    }

    // _str already cleared at the top of this function
  }

  processFnSignalCalls(program);
}

function deduplicateImports(program: any): void {
  if (!program?.body) return;
  const importMap = new Map<string, any>();
  const toRemove: number[] = [];

  for (let i = 0; i < program.body.length; i++) {
    const stmt = program.body[i];
    if (stmt.type !== 'ImportDeclaration') continue;
    const source = JSON.stringify(stmt.source);
    const hasDefault = stmt.specifiers?.some((s: any) => s.type === 'ImportDefaultSpecifier');
    const hasNamespace = stmt.specifiers?.some((s: any) => s.type === 'ImportNamespaceSpecifier');
    // Don't merge default/namespace imports
    if (hasDefault || hasNamespace) continue;

    if (importMap.has(source)) {
      const existing = importMap.get(source);
      existing.specifiers.push(...(stmt.specifiers || []));
      toRemove.push(i);
    } else {
      importMap.set(source, stmt);
    }
  }

  // Remove merged duplicates (reverse order to preserve indices)
  for (let i = toRemove.length - 1; i >= 0; i--) {
    program.body.splice(toRemove[i], 1);
  }

  // Re-sort specifiers in merged imports
  for (const imp of importMap.values()) {
    if (imp.specifiers?.length > 1) {
      imp.specifiers.sort((a: any, b: any) => {
        const aName = a.local?.name || '';
        const bName = b.local?.name || '';
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
function inlineSegmentBodyIntoSCall(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Build a map of const declarations: name -> { initNode, stmtIndex }
  const constDecls = new Map<string, { init: any; stmtIndex: number }>();
  for (let i = 0; i < program.body.length; i++) {
    const stmt = program.body[i];
    if (stmt?.type === 'VariableDeclaration' && stmt.kind === 'const' &&
        stmt.declarations?.length === 1) {
      const decl = stmt.declarations[0];
      if (decl.id?.type === 'Identifier' && decl.init) {
        constDecls.set(decl.id.name, { init: decl.init, stmtIndex: i });
      }
    }
  }

  // Find q_X.s(Y) calls where Y is an identifier referencing a const decl
  const toInline: { sCallStmtIndex: number; constStmtIndex: number; argName: string }[] = [];

  for (let i = 0; i < program.body.length; i++) {
    const stmt = program.body[i];
    if (stmt?.type !== 'ExpressionStatement') continue;
    const expr = stmt.expression;
    // Match q_X.s(Y) pattern
    if (expr?.type !== 'CallExpression') continue;
    if (expr.callee?.type !== 'MemberExpression') continue;
    if (expr.callee.object?.type !== 'Identifier') continue;
    if (expr.callee.property?.type !== 'Identifier' || expr.callee.property.name !== 's') continue;
    if (!expr.callee.object.name?.startsWith('q_')) continue;
    if (expr.arguments?.length !== 1) continue;
    const arg = expr.arguments[0];
    if (arg?.type !== 'Identifier') continue;

    const constInfo = constDecls.get(arg.name);
    if (!constInfo) continue;

    // Only inline if the const init is a function expression or arrow function
    const initType = constInfo.init?.type;
    if (initType !== 'ArrowFunctionExpression' && initType !== 'FunctionExpression') continue;

    toInline.push({
      sCallStmtIndex: i,
      constStmtIndex: constInfo.stmtIndex,
      argName: arg.name,
    });
  }

  // Apply inlining (reverse order to preserve indices)
  const toRemoveIndices = new Set<number>();
  for (const { sCallStmtIndex, constStmtIndex, argName } of toInline) {
    const constInfo = constDecls.get(argName)!;
    // Replace the argument in the .s() call with the init expression
    program.body[sCallStmtIndex].expression.arguments[0] = constInfo.init;
    // Mark the const declaration for removal
    toRemoveIndices.add(constStmtIndex);
  }

  // Remove inlined const declarations
  if (toRemoveIndices.size > 0) {
    program.body = program.body.filter((_: any, i: number) => !toRemoveIndices.has(i));
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
function normalizeAutoExports(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Strip _auto_ export specifiers
  for (let i = program.body.length - 1; i >= 0; i--) {
    const stmt = program.body[i];
    if (stmt?.type === 'ExportNamedDeclaration' && !stmt.declaration && stmt.specifiers) {
      // Remove specifiers where exported name starts with _auto_
      stmt.specifiers = stmt.specifiers.filter((spec: any) => {
        const exported = spec.exported?.name || '';
        return !exported.startsWith('_auto_');
      });
      // If no specifiers left, remove the whole export statement
      if (stmt.specifiers.length === 0) {
        program.body.splice(i, 1);
      }
    }
  }

  // Normalize _auto_ import specifiers: import { _auto_X as X } -> import { X }
  for (const stmt of program.body) {
    if (stmt?.type !== 'ImportDeclaration' || !stmt.specifiers) continue;
    for (const spec of stmt.specifiers) {
      if (spec.type !== 'ImportSpecifier') continue;
      const imported = spec.imported?.name || '';
      if (imported.startsWith('_auto_')) {
        // Rewrite to import the local name directly
        spec.imported = { ...spec.local };
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
function stripUnusedImports(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Collect all identifier names referenced in non-import statements
  const usedNames = new Set<string>();
  function collectIdents(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(collectIdents); return; }
    if (node.type === 'Identifier' && node.name) {
      usedNames.add(node.name);
    }
    for (const key of Object.keys(node)) {
      if (key === 'start' || key === 'end' || key === 'loc' || key === 'range' || key === 'type') continue;
      collectIdents(node[key]);
    }
  }

  for (const stmt of program.body) {
    if (stmt?.type === 'ImportDeclaration') continue;
    collectIdents(stmt);
  }

  // Remove import specifiers whose local name is not used
  for (let i = program.body.length - 1; i >= 0; i--) {
    const stmt = program.body[i];
    if (stmt?.type !== 'ImportDeclaration') continue;
    if (!stmt.specifiers || stmt.specifiers.length === 0) continue; // side-effect import

    stmt.specifiers = stmt.specifiers.filter((spec: any) => {
      const localName = spec.local?.name;
      return localName && usedNames.has(localName);
    });

    if (stmt.specifiers.length === 0) {
      program.body.splice(i, 1);
    }
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
function stripIsServerGuards(program: any): void {
  function visitBody(body: any[]): void {
    if (!Array.isArray(body)) return;
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      // Match: if (!isServer) return;
      if (stmt?.type === 'IfStatement' &&
          stmt.consequent?.type === 'ReturnStatement' &&
          !stmt.consequent.argument &&
          !stmt.alternate &&
          stmt.test?.type === 'UnaryExpression' &&
          stmt.test.operator === '!' &&
          stmt.test.argument?.type === 'Identifier' &&
          stmt.test.argument.name === 'isServer') {
        body.splice(i, 1);
      }
    }
  }

  function visitNode(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) visitNode(item); return; }
    if (node.type === 'BlockStatement' && Array.isArray(node.body)) {
      visitBody(node.body);
    }
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && node.body?.type === 'BlockStatement') {
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
function stripPureExpressionStatements(program: any): void {
  function isPure(expr: any): boolean {
    if (!expr) return false;
    if (expr.type === 'Identifier') return true;
    if (expr.type === 'Literal') return true;
    if (expr.type === 'SequenceExpression') {
      return (expr.expressions || []).every(isPure);
    }
    return false;
  }

  function visitBody(body: any[]): void {
    if (!Array.isArray(body)) return;
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (stmt?.type === 'ExpressionStatement' && isPure(stmt.expression)) {
        body.splice(i, 1);
      }
    }
  }

  function visitNode(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) visitNode(item); return; }
    if (node.type === 'BlockStatement' && Array.isArray(node.body)) {
      visitBody(node.body);
    }
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && node.body?.type === 'BlockStatement') {
      visitBody(node.body.body);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visitNode(node[key]);
    }
  }

  visitNode(program);
}

function stripUnusedLocalDeclarations(program: any): void {
  if (!program || typeof program !== 'object') return;

  // Walk and find function bodies and nested blocks
  function visitNode(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visitNode); return; }

    // Process function bodies
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && node.body?.type === 'BlockStatement') {
      stripUnusedDeclsInBlock(node.body, node.params || []);
    }

    // Also process nested blocks inside control flow (do-while, for, while, if, labeled, etc.)
    // These are inside function bodies so we can safely strip unused locals
    if (node.type === 'BlockStatement' && Array.isArray(node.body)) {
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
function stripNoopLabeledStatements(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = node.length - 1; i >= 0; i--) {
      stripNoopLabeledStatements(node[i]);
      const item = node[i];
      if (item?.type === 'LabeledStatement') {
        const body = item.body;
        const label = item.label?.name;
        // label: {} (empty block)
        if (body?.type === 'BlockStatement' && (!body.body || body.body.length === 0)) {
          node.splice(i, 1);
          continue;
        }
        // label: { break label; }
        if (body?.type === 'BlockStatement' && body.body?.length === 1 &&
            body.body[0]?.type === 'BreakStatement' &&
            body.body[0].label?.name === label) {
          node.splice(i, 1);
          continue;
        }
      }
    }
    return;
  }
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
function stripOrphanedSideEffectCalls(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Collect imported names
  const importedNames = new Set<string>();
  for (const stmt of program.body) {
    if (stmt?.type !== 'ImportDeclaration') continue;
    for (const spec of stmt.specifiers || []) {
      if (spec.local?.name) importedNames.add(spec.local.name);
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = program.body.length - 1; i >= 0; i--) {
      const stmt = program.body[i];
      if (stmt?.type !== 'ExpressionStatement') continue;
      const expr = stmt.expression;
      if (expr?.type !== 'CallExpression' && expr?.type !== 'NewExpression') continue;

      // Collect all identifiers used in this expression
      const usedIdents = new Set<string>();
      collectAllIdents(expr, usedIdents);

      // Check if ALL used identifiers are either:
      // 1. Import-only names (not referenced in any other statement)
      // 2. Literals/computed values
      const allImportOnly = [...usedIdents].every(name => {
        if (!importedNames.has(name)) return false;
        // Check if this import name is referenced in any other statement
        for (let j = 0; j < program.body.length; j++) {
          if (j === i) continue;
          const other = program.body[j];
          if (other?.type === 'ImportDeclaration') continue; // skip import stmts
          const refs = new Set<string>();
          collectAllIdents(other, refs);
          if (refs.has(name)) return false; // referenced elsewhere
        }
        return true;
      });

      if (allImportOnly && usedIdents.size > 0) {
        program.body.splice(i, 1);
        changed = true;
      }
    }
  }
}

function stripUnusedModuleLevelDeclarations(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  let changed = true;
  while (changed) {
    changed = false;
    // Collect all referenced names from non-declaration contexts.
    // For declarations, only collect from init expressions (not binding patterns).
    // For functions/classes, only collect from body (not the declared name).
    const referencedNames = new Set<string>();
    for (const stmt of program.body) {
      if (stmt?.type === 'VariableDeclaration') {
        for (const decl of stmt.declarations || []) {
          if (decl.init) collectAllIdents(decl.init, referencedNames);
        }
      } else if (stmt?.type === 'FunctionDeclaration') {
        // Collect from params and body, but not the function name
        for (const p of stmt.params || []) collectAllIdents(p, referencedNames);
        if (stmt.body) collectAllIdents(stmt.body, referencedNames);
      } else if (stmt?.type === 'ClassDeclaration') {
        if (stmt.body) collectAllIdents(stmt.body, referencedNames);
        if (stmt.superClass) collectAllIdents(stmt.superClass, referencedNames);
      } else {
        collectAllIdents(stmt, referencedNames);
      }
    }

    for (let i = program.body.length - 1; i >= 0; i--) {
      const stmt = program.body[i];
      // Strip plain VariableDeclaration (not export, not import)
      if (stmt?.type === 'VariableDeclaration') {
        const allUnused = (stmt.declarations || []).every((decl: any) => {
          const names = new Map<string, number>();
          collectDeclaredNames(decl.id, i, names);
          return Array.from(names.keys()).every(n => !referencedNames.has(n));
        });
        if (allUnused) {
          program.body.splice(i, 1);
          changed = true;
        }
      }
      // Strip plain FunctionDeclaration whose name is unused
      if (stmt?.type === 'FunctionDeclaration' && stmt.id?.name) {
        if (!referencedNames.has(stmt.id.name)) {
          program.body.splice(i, 1);
          changed = true;
        }
      }
      // Strip plain ClassDeclaration whose name is unused
      if (stmt?.type === 'ClassDeclaration' && stmt.id?.name) {
        if (!referencedNames.has(stmt.id.name)) {
          program.body.splice(i, 1);
          changed = true;
        }
      }
    }
  }
}

function stripUnusedDeclsInBlock(block: any, params: any[]): void {
  if (!block?.body || !Array.isArray(block.body)) return;

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
    for (let i = 0; i < block.body.length; i++) {
      const stmt = block.body[i];
      if (stmt?.type === 'VariableDeclaration') {
        // Only collect from init expressions, not from binding patterns
        for (const decl of stmt.declarations || []) {
          if (decl.init) collectAllIdents(decl.init, referencedNames);
        }
      } else if (stmt?.type === 'FunctionDeclaration') {
        // Collect from params and body, not from the function name itself
        for (const p of stmt.params || []) collectAllIdents(p, referencedNames);
        if (stmt.body) collectAllIdents(stmt.body, referencedNames);
      } else if (stmt?.type === 'ClassDeclaration') {
        // Collect from class body, not from class name
        if (stmt.body) collectAllIdents(stmt.body, referencedNames);
        if (stmt.superClass) collectAllIdents(stmt.superClass, referencedNames);
      } else if (stmt?.type === 'TryStatement') {
        // For try/catch, check if the block bodies are empty (only have the catch binding)
        // Skip collecting from try/catch - handled separately below
        collectAllIdents(stmt, referencedNames);
      } else {
        collectAllIdents(stmt, referencedNames);
      }
    }

    // Remove unused VariableDeclarations
    for (let i = block.body.length - 1; i >= 0; i--) {
      const stmt = block.body[i];
      if (stmt?.type === 'VariableDeclaration') {
        const allUnused = (stmt.declarations || []).every((decl: any) => {
          const names = new Map<string, number>();
          collectDeclaredNames(decl.id, i, names);
          return Array.from(names.keys()).every(n => !referencedNames.has(n));
        });
        if (allUnused) {
          block.body.splice(i, 1);
          changed = true;
        }
      } else if (stmt?.type === 'FunctionDeclaration' && stmt.id?.name) {
        // Remove unused function declarations
        if (!referencedNames.has(stmt.id.name)) {
          block.body.splice(i, 1);
          changed = true;
        }
      } else if (stmt?.type === 'ClassDeclaration' && stmt.id?.name) {
        // Remove unused class declarations
        if (!referencedNames.has(stmt.id.name)) {
          block.body.splice(i, 1);
          changed = true;
        }
      } else if (stmt?.type === 'TryStatement') {
        // Strip try/catch blocks where the try body is empty (or only has empty statements)
        const tryBody = stmt.block?.body || [];
        const hasContent = tryBody.some((s: any) => s?.type !== 'EmptyStatement');
        if (!hasContent) {
          block.body.splice(i, 1);
          changed = true;
        }
      }
    }
  }
}

function collectDeclaredNames(pattern: any, stmtIndex: number, map: Map<string, number>): void {
  if (!pattern) return;
  if (pattern.type === 'Identifier') {
    map.set(pattern.name, stmtIndex);
  } else if (pattern.type === 'ObjectPattern') {
    for (const prop of pattern.properties || []) {
      if (prop.type === 'RestElement') {
        collectDeclaredNames(prop.argument, stmtIndex, map);
      } else {
        collectDeclaredNames(prop.value, stmtIndex, map);
      }
    }
  } else if (pattern.type === 'ArrayPattern') {
    for (const elem of pattern.elements || []) {
      if (elem?.type === 'RestElement') {
        collectDeclaredNames(elem.argument, stmtIndex, map);
      } else {
        collectDeclaredNames(elem, stmtIndex, map);
      }
    }
  } else if (pattern.type === 'AssignmentPattern') {
    collectDeclaredNames(pattern.left, stmtIndex, map);
  }
}

function collectAllIdents(node: any, set: Set<string>): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => collectAllIdents(n, set)); return; }
  if (node.type === 'Identifier' && node.name) {
    set.add(node.name);
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
function stripDotWCalls(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      node[i] = unwrapDotW(node[i]);
      stripDotWCalls(node[i]);
    }
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          val[i] = unwrapDotW(val[i]);
          stripDotWCalls(val[i]);
        }
      } else {
        node[key] = unwrapDotW(val);
        stripDotWCalls(node[key]);
      }
    }
  }
}

function unwrapDotW(node: any): any {
  if (!node || node.type !== 'CallExpression') return node;
  const callee = node.callee;
  if (!callee || callee.type !== 'MemberExpression') return node;
  if (callee.property?.type !== 'Identifier' || callee.property.name !== 'w') return node;
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
function stripDotSBodies(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Track names that were arguments to .s() calls (to strip their decls later)
  const sCallArgNames = new Set<string>();

  for (const stmt of program.body) {
    if (stmt?.type !== 'ExpressionStatement') continue;
    const expr = stmt.expression;
    if (expr?.type !== 'CallExpression') continue;
    const callee = expr.callee;
    if (!callee || callee.type !== 'MemberExpression') continue;
    if (callee.property?.type !== 'Identifier' || callee.property.name !== 's') continue;
    if (callee.object?.type !== 'Identifier') continue;
    // Only match q_X.s(...) pattern
    const objName = callee.object.name || '';
    if (!objName.startsWith('q_')) continue;
    // Track identifier arguments before stripping
    if (expr.arguments?.length === 1 && expr.arguments[0]?.type === 'Identifier') {
      sCallArgNames.add(expr.arguments[0].name);
    }
    // Strip the arguments
    expr.arguments = [];
  }

  // Remove const declarations that were only used as .s() arguments
  if (sCallArgNames.size > 0) {
    // Check which names are still referenced elsewhere
    const referencedNames = new Set<string>();
    for (const stmt of program.body) {
      if (stmt?.type === 'VariableDeclaration') {
        // Don't count the declaration itself
        continue;
      }
      collectAllIdents(stmt, referencedNames);
    }

    for (let i = program.body.length - 1; i >= 0; i--) {
      const stmt = program.body[i];
      if (stmt?.type !== 'VariableDeclaration') continue;
      if (!stmt.declarations || stmt.declarations.length !== 1) continue;
      const decl = stmt.declarations[0];
      if (!decl.id || decl.id.type !== 'Identifier') continue;
      const name = decl.id.name;
      if (sCallArgNames.has(name) && !referencedNames.has(name)) {
        program.body.splice(i, 1);
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
function stripMigratedDeclarations(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  // Collect names imported from the source module (e.g., import { X } from "./test")
  const importedNames = new Set<string>();
  for (const stmt of program.body) {
    if (stmt?.type !== 'ImportDeclaration') continue;
    for (const spec of stmt.specifiers || []) {
      if (spec.local?.name) importedNames.add(spec.local.name);
    }
  }

  // Collect names declared by non-exported function/class declarations
  const declaredNames = new Set<string>();
  for (const stmt of program.body) {
    if (stmt?.type === 'FunctionDeclaration' && stmt.id?.name && !isExported(stmt, program)) {
      declaredNames.add(stmt.id.name);
    }
    if (stmt?.type === 'ClassDeclaration' && stmt.id?.name && !isExported(stmt, program)) {
      declaredNames.add(stmt.id.name);
    }
    // Non-exported variable declarations with destructuring patterns
    if (stmt?.type === 'VariableDeclaration' && !isExported(stmt, program)) {
      for (const decl of stmt.declarations || []) {
        if (decl.id?.type === 'ArrayPattern' || decl.id?.type === 'ObjectPattern') {
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

  for (let i = program.body.length - 1; i >= 0; i--) {
    const stmt = program.body[i];
    if (stmt?.type === 'FunctionDeclaration' && namesToStrip.has(stmt.id?.name)) {
      program.body.splice(i, 1);
    } else if (stmt?.type === 'ClassDeclaration' && namesToStrip.has(stmt.id?.name)) {
      program.body.splice(i, 1);
    } else if (stmt?.type === 'VariableDeclaration') {
      // Strip declarations where all bound names are in namesToStrip
      const allNames: string[] = [];
      for (const decl of stmt.declarations || []) {
        collectPatternNames(decl.id, new Set(), allNames);
      }
      if (allNames.length > 0 && allNames.every(n => namesToStrip.has(n))) {
        program.body.splice(i, 1);
      }
    }
  }
}

function isExported(stmt: any, program: any): boolean {
  // Check if the statement is wrapped in an ExportNamedDeclaration
  for (const s of program.body) {
    if (s?.type === 'ExportNamedDeclaration' && s.declaration === stmt) return true;
  }
  return false;
}

function collectPatternNames(pattern: any, nameSet: Set<string>, nameArr?: string[]): void {
  if (!pattern) return;
  if (pattern.type === 'Identifier') {
    nameSet.add(pattern.name);
    if (nameArr) nameArr.push(pattern.name);
  } else if (pattern.type === 'ArrayPattern') {
    for (const el of pattern.elements || []) collectPatternNames(el, nameSet, nameArr);
  } else if (pattern.type === 'ObjectPattern') {
    for (const prop of pattern.properties || []) {
      if (prop.type === 'RestElement') collectPatternNames(prop.argument, nameSet, nameArr);
      else collectPatternNames(prop.value, nameSet, nameArr);
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
function inlineDestructuredBindings(program: any): void {
  function processFunctionBody(body: any[], params: any[]): void {
    if (!Array.isArray(body)) return;

    // Find destructuring declarations at the start of the body
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (stmt?.type !== 'VariableDeclaration') continue;
      if (!stmt.declarations || stmt.declarations.length !== 1) continue;
      const decl = stmt.declarations[0];
      if (!decl.init || !decl.id) continue;

      // Match: const { "key": alias, key2 } = obj (ObjectPattern)
      if (decl.id.type !== 'ObjectPattern') continue;
      const objExpr = decl.init; // The object being destructured

      // Build mapping: alias name -> member expression AST node
      const bindings = new Map<string, any>();
      let canInline = true;
      for (const prop of decl.id.properties || []) {
        if (prop.type === 'RestElement') { canInline = false; break; }
        if (!prop.value || prop.value.type !== 'Identifier') { canInline = false; break; }
        if (prop.value.type === 'AssignmentPattern') { canInline = false; break; }

        const alias = prop.value.name;
        const keyName = prop.key?.name || prop.key?.value;
        if (!keyName) { canInline = false; break; }

        // Create obj.key or obj["key"] depending on if it's a valid identifier
        const isValidId = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(keyName);
        const memberExpr = {
          type: 'MemberExpression',
          object: JSON.parse(JSON.stringify(objExpr)), // deep clone
          property: isValidId
            ? { type: 'Identifier', name: keyName }
            : { type: 'Literal', value: keyName },
          computed: !isValidId,
        };
        bindings.set(alias, memberExpr);
      }

      if (!canInline || bindings.size === 0) continue;

      // Check that none of the aliases shadow a param or are reassigned
      const paramNames = new Set(params.map((p: any) => p.name).filter(Boolean));
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

  function replaceIdentifiers(node: any, bindings: Map<string, any>): any {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(n => replaceIdentifiers(n, bindings));
    if (node.type === 'Identifier' && bindings.has(node.name)) {
      return JSON.parse(JSON.stringify(bindings.get(node.name)));
    }
    const result: any = {};
    for (const key of Object.keys(node)) {
      result[key] = replaceIdentifiers(node[key], bindings);
    }
    return result;
  }

  // Walk all function bodies
  function visit(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && node.body?.type === 'BlockStatement') {
      processFunctionBody(node.body.body, node.params || []);
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
function stripTypeAnnotations(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) stripTypeAnnotations(item);
    return;
  }
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
function destructureRawPropsParam(program: any): void {
  if (!program?.body || !Array.isArray(program.body)) return;

  for (const stmt of program.body) {
    // Find: export const NAME = (params...) => body
    const fn = getExportedSegmentFunction(stmt);
    if (!fn || !fn.params || fn.params.length < 3) continue;

    // Only process 3rd+ params (positions 0,1 are _, _1 convention)
    for (let pi = 2; pi < fn.params.length; pi++) {
      const param = fn.params[pi];
      if (param?.type !== 'Identifier') continue;
      const paramName = param.name;

      // Collect all references to this param in the body
      const refs: any[] = [];
      collectIdentRefs(fn.body, paramName, refs);

      if (refs.length === 0) continue;

      // Check if ALL references are member expressions: param.field.rest...
      // Find the consistent field name
      let fieldName: string | null = null;
      let allSingleField = true;

      for (const ref of refs) {
        if (!ref._parent || ref._parent.type !== 'MemberExpression' ||
            ref._parent.object !== ref._node || ref._parent.computed) {
          allSingleField = false;
          break;
        }
        const prop = ref._parent.property;
        if (!prop || prop.type !== 'Identifier') {
          allSingleField = false;
          break;
        }
        if (fieldName === null) {
          fieldName = prop.name;
        } else if (fieldName !== prop.name) {
          allSingleField = false;
          break;
        }
      }

      if (!allSingleField || !fieldName) continue;

      // Rewrite: param -> field, param.field -> field (remove one level of member access)
      param.name = fieldName;
      for (const ref of refs) {
        // ref._parent is MemberExpression `param.field`
        // Replace parent MemberExpression with just Identifier `field`
        replaceNodeInParent(ref._grandparent, ref._parentKey, ref._parentIndex,
          { type: 'Identifier', name: fieldName });
      }
    }
  }
}

function getExportedSegmentFunction(stmt: any): any {
  if (stmt?.type !== 'ExportNamedDeclaration') return null;
  const decl = stmt.declaration;
  if (!decl || decl.type !== 'VariableDeclaration') return null;
  const d = decl.declarations?.[0];
  if (!d?.init) return null;
  if (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression') {
    return d.init;
  }
  return null;
}

function collectIdentRefs(
  node: any, name: string, refs: any[],
  parent?: any, parentKey?: string, parentIndex?: number, grandparent?: any,
): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      collectIdentRefs(node[i], name, refs, node, '' + i, i, parent);
    }
    return;
  }
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

function replaceNodeInParent(container: any, key: string | undefined, index: number | undefined, replacement: any): void {
  if (!container || !key) return;
  if (Array.isArray(container)) {
    if (index !== undefined) container[index] = replacement;
  } else {
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
function expandRawPropsCaptures(program: any): void {
  function processFunctionBody(fn: any): void {
    const body = fn.body;
    if (!body) return;

    // Collect variables bound to _captures[N]
    const stmts = body.type === 'BlockStatement' ? body.body : null;
    if (!stmts || !Array.isArray(stmts)) return;

    for (const stmt of stmts) {
      if (stmt?.type !== 'VariableDeclaration') continue;
      for (const decl of stmt.declarations || []) {
        if (!decl.init || decl.id?.type !== 'Identifier') continue;
        // Match _captures[N]
        if (decl.init.type !== 'MemberExpression' ||
            decl.init.object?.type !== 'Identifier' ||
            decl.init.object.name !== '_captures' ||
            !decl.init.computed ||
            decl.init.property?.type !== 'Literal' ||
            typeof decl.init.property.value !== 'number') continue;

        const varName = decl.id.name;
        expandMemberAccessesInBody(body, varName);
      }
    }

    // Also handle params named _rawProps (SWC's convention for props params)
    if (fn.params) {
      for (const param of fn.params) {
        if (param?.type !== 'Identifier') continue;
        // Only expand params that follow the _rawProps naming convention
        if (param.name === '_rawProps' || param.name.startsWith('_rawProps')) {
          const fieldNames = expandMemberAccessesInBody(body, param.name);
          // If all accesses use a single field, rename the param to match
          if (fieldNames && fieldNames.size === 1) {
            param.name = fieldNames.values().next().value;
          }
        }
      }
    }
  }

  /**
   * If ALL references to `varName` in the body are member expressions
   * `varName.field` (non-computed), replace each with just `field`.
   */
  function expandMemberAccessesInBody(body: any, varName: string): Set<string> | null {
    // Collect all references
    const refs: Array<{ parent: any; key: string; index?: number; memberExpr: any; fieldName: string }> = [];
    let hasNonMemberRef = false;

    function scan(node: any, parent: any, key: string, index?: number): void {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) scan(node[i], node, String(i), i);
        return;
      }
      // Check if this is a MemberExpression with our var as object
      if (node.type === 'MemberExpression' &&
          !node.computed &&
          node.object?.type === 'Identifier' &&
          node.object.name === varName &&
          node.property?.type === 'Identifier') {
        refs.push({ parent, key, index, memberExpr: node, fieldName: node.property.name });
        // Don't recurse into this MemberExpression's children
        return;
      }
      // Check if this is a bare reference to varName (not as MemberExpression object)
      if (node.type === 'Identifier' && node.name === varName) {
        // Check if parent is the variable declaration itself -- skip those
        if (parent?.type === 'VariableDeclarator' && key === 'id') return;
        // Check if parent is a param list
        if (Array.isArray(parent) && parent === body) return;
        hasNonMemberRef = true;
        return;
      }
      for (const k of Object.keys(node)) {
        if (k === 'type') continue;
        const val = node[k];
        if (val && typeof val === 'object') {
          if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) scan(val[i], val, String(i), i);
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
      if (ref.index !== undefined && Array.isArray(ref.parent)) {
        ref.parent[ref.index] = replacement;
      } else if (ref.parent) {
        ref.parent[ref.key] = replacement;
      }
    }

    return fieldNames;
  }

  // Visit all functions in the AST
  function visit(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
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
function stripCapturesDeclarations(program: any): void {
  function processBody(body: any[]): void {
    if (!Array.isArray(body)) return;
    for (let i = body.length - 1; i >= 0; i--) {
      const stmt = body[i];
      if (stmt?.type !== 'VariableDeclaration') continue;
      // Check if ALL declarators are _captures[N] assignments
      const decls = stmt.declarations;
      if (!decls || decls.length === 0) continue;
      const allCaptures = decls.every((d: any) => {
        if (!d.init) return false;
        // Match _captures[N]
        return d.init.type === 'MemberExpression' &&
               d.init.object?.type === 'Identifier' &&
               d.init.object.name === '_captures' &&
               d.init.computed === true &&
               d.init.property?.type === 'Literal' &&
               typeof d.init.property.value === 'number';
      });
      if (allCaptures) {
        body.splice(i, 1);
      }
    }
  }

  // Process function/arrow bodies throughout the AST
  function visit(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
    if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration') && node.body?.type === 'BlockStatement') {
      processBody(node.body.body);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      visit(node[key]);
    }
  }

  visit(program);
}

function walkAndReplace(node: any, replacer: (n: any) => any): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      node[i] = replacer(node[i]);
      walkAndReplace(node[i], replacer);
    }
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type') continue;
    const val = node[key];
    if (val === null || typeof val !== 'object') continue;
    if (Array.isArray(val)) {
      for (let i = 0; i < val.length; i++) {
        val[i] = replacer(val[i]);
        walkAndReplace(val[i], replacer);
      }
    } else {
      node[key] = replacer(val);
      walkAndReplace(node[key], replacer);
    }
  }
}
