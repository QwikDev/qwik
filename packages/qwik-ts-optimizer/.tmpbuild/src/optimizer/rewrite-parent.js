/**
 * Parent module rewriting engine for the Qwik optimizer.
 *
 * Surgically edits source text via magic-string, replacing $() calls with QRL
 * references, managing imports, and assembling the final parent module.
 *
 * Output structure:
 *   [optimizer-added imports]
 *   [original non-marker imports]
 *   //
 *   [QRL const declarations]
 *   //
 *   [rewritten module body]
 *   [_auto_ exports if any]
 */
import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import { transformSync as oxcTransformSync } from 'oxc-transform';
import { rewriteImportSource } from './rewrite-imports.js';
import { buildQrlDeclaration, buildSyncTransform, needsPureAnnotation, getQrlImportSource, } from './rewrite-calls.js';
import { buildQrlDevDeclaration, buildDevFilePath } from './dev-mode.js';
import { buildNoopQrlDeclaration, buildNoopQrlDevDeclaration, buildStrippedNoopQrl, buildStrippedNoopQrlDev, buildSCall, buildHoistConstDecl, buildHoistSCall, } from './inline-strategy.js';
import { isStrippedSegment } from './strip-ctx.js';
import { injectCapturesUnpacking, rewriteFunctionSignature, removeDeadConstLiterals } from './segment-codegen.js';
import { transformEventPropName } from './event-handler-transform.js';
import { transformAllJsx } from './jsx-transform.js';
import { SignalHoister } from './signal-analysis.js';
import { stripExportDeclarations } from './strip-exports.js';
import { replaceConstants } from './const-replacement.js';
/**
 * Parse array literal items from source text like "[left, true, right]".
 */
function parseArrayItems(arrayText) {
    // Strip surrounding brackets
    let inner = arrayText.trim();
    if (inner.startsWith('['))
        inner = inner.slice(1);
    if (inner.endsWith(']'))
        inner = inner.slice(0, -1);
    inner = inner.trim();
    if (!inner)
        return [];
    return inner.split(',').map(s => s.trim()).filter(s => s.length > 0);
}
function isMarkerSpecifier(importedName, extractedCalleeNames) {
    return extractedCalleeNames.has(importedName);
}
/** Custom inlined functions have their Qrl variant defined locally -- no import needed. */
function isCustomInlined(ext, originalImports) {
    for (const [, info] of originalImports) {
        if (info.importedName === ext.calleeName)
            return false;
    }
    return true;
}
/** Extraction's callee name (e.g. "server$") matches regCtxName "server" + "$". */
function matchesRegCtxName(ext, regCtxName) {
    if (!regCtxName || regCtxName.length === 0)
        return false;
    for (const name of regCtxName) {
        if (ext.calleeName === name + '$')
            return true;
    }
    return false;
}
/** Collect all binding names from a pattern node (Identifier, ObjectPattern, ArrayPattern). */
function collectBindingNames(pattern) {
    if (!pattern)
        return [];
    if (pattern.type === 'Identifier')
        return [pattern.name];
    if (pattern.type === 'ObjectPattern') {
        const names = [];
        for (const prop of pattern.properties || []) {
            if (prop.type === 'RestElement') {
                names.push(...collectBindingNames(prop.argument));
            }
            else {
                names.push(...collectBindingNames(prop.value));
            }
        }
        return names;
    }
    if (pattern.type === 'ArrayPattern') {
        const names = [];
        for (const elem of pattern.elements || []) {
            if (elem)
                names.push(...collectBindingNames(elem));
        }
        return names;
    }
    if (pattern.type === 'AssignmentPattern') {
        return collectBindingNames(pattern.left);
    }
    return [];
}
/**
 * Parse a parent extraction body and find const declarations with literal values
 * for the given capture names. Returns a map of name -> literal source text.
 */
export function resolveConstLiterals(parentBody, captureNames) {
    const result = new Map();
    if (captureNames.length === 0)
        return result;
    const wrapperPrefix = 'const __rl__ = ';
    const wrappedSource = wrapperPrefix + parentBody;
    const parseResult = parseSync('__rl__.tsx', wrappedSource, { experimentalRawTransfer: true });
    if (!parseResult.program || parseResult.errors?.length)
        return result;
    const offset = wrapperPrefix.length;
    const captureSet = new Set(captureNames);
    // Walk the parsed body to find const declarations
    function walkNode(node) {
        if (!node || typeof node !== 'object')
            return;
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
        for (const key of Object.keys(node)) {
            if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                continue;
            const val = node[key];
            if (val && typeof val === 'object') {
                if (Array.isArray(val)) {
                    for (const item of val) {
                        if (item && typeof item.type === 'string')
                            walkNode(item);
                    }
                }
                else if (typeof val.type === 'string') {
                    walkNode(val);
                }
            }
        }
    }
    walkNode(parseResult.program);
    return result;
}
/**
 * Replace captured identifier references in a body text with their inlined
 * literal values. Uses AST-based replacement to avoid replacing property names.
 */
export function inlineConstCaptures(body, constValues) {
    const wrapperPrefix = 'const __ic__ = ';
    const wrappedSource = wrapperPrefix + body;
    const parseResult = parseSync('__ic__.tsx', wrappedSource, { experimentalRawTransfer: true });
    if (!parseResult.program || parseResult.errors?.length)
        return body;
    const offset = wrapperPrefix.length;
    const replacements = [];
    function walkNode(node, parentKey, parentNode) {
        if (!node || typeof node !== 'object')
            return;
        if (node.type === 'Identifier' && constValues.has(node.name)) {
            // Skip declaration ids (const X = ...), property keys, and non-computed member props
            const isDeclId = parentKey === 'id' && parentNode?.type === 'VariableDeclarator';
            const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
            const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed;
            if (!isDeclId && !isPropertyKey && !isMemberProp) {
                replacements.push({
                    start: node.start - offset,
                    end: node.end - offset,
                    value: constValues.get(node.name),
                });
            }
        }
        for (const key of Object.keys(node)) {
            if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                continue;
            const val = node[key];
            if (val && typeof val === 'object') {
                if (Array.isArray(val)) {
                    for (const item of val) {
                        if (item && typeof item.type === 'string')
                            walkNode(item, key, node);
                    }
                }
                else if (typeof val.type === 'string') {
                    walkNode(val, key, node);
                }
            }
        }
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
export function propagateConstLiteralsInBody(body) {
    const MAX_ITERATIONS = 5;
    let result = body;
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        const wrapperPrefix = 'const __pb__ = ';
        const wrappedSource = wrapperPrefix + result;
        const parseResult = parseSync('__pb__.tsx', wrappedSource, { experimentalRawTransfer: true });
        if (!parseResult.program || parseResult.errors?.length)
            break;
        const offset = wrapperPrefix.length;
        // Literal inits: always inline. Non-literal inits: only if single-use.
        const constDecls = new Map();
        function findConstDecls(node) {
            if (!node || typeof node !== 'object')
                return;
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
            for (const key of Object.keys(node)) {
                if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                    continue;
                const val = node[key];
                if (val && typeof val === 'object') {
                    if (Array.isArray(val)) {
                        for (const item of val) {
                            if (item && typeof item.type === 'string')
                                findConstDecls(item);
                        }
                    }
                    else if (typeof val.type === 'string') {
                        findConstDecls(val);
                    }
                }
            }
        }
        findConstDecls(parseResult.program);
        if (constDecls.size === 0)
            break;
        // Phase 2: Count references to each const (excluding the declaration's own id)
        const refCounts = new Map();
        for (const name of constDecls.keys())
            refCounts.set(name, 0);
        function countRefs(node, parentKey, parentNode) {
            if (!node || typeof node !== 'object')
                return;
            if (node.type === 'Identifier' && constDecls.has(node.name)) {
                if (parentKey === 'id' && parentNode?.type === 'VariableDeclarator') {
                    // declaration id — skip
                }
                else {
                    const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
                    const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed;
                    if (!isPropertyKey && !isMemberProp) {
                        refCounts.set(node.name, (refCounts.get(node.name) ?? 0) + 1);
                    }
                }
            }
            for (const key of Object.keys(node)) {
                if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                    continue;
                const val = node[key];
                if (val && typeof val === 'object') {
                    if (Array.isArray(val)) {
                        for (const item of val) {
                            if (item && typeof item.type === 'string')
                                countRefs(item, key, node);
                        }
                    }
                    else if (typeof val.type === 'string') {
                        countRefs(val, key, node);
                    }
                }
            }
        }
        countRefs(parseResult.program);
        // Phase 3: Inline literal consts and remove their declarations.
        const toInline = new Map();
        const toRemove = new Set();
        for (const [name, info] of constDecls) {
            if (!info.isLiteral)
                continue;
            const refs = refCounts.get(name) ?? 0;
            if (refs > 0) {
                toInline.set(name, info.value);
            }
            toRemove.add(name);
        }
        if (toInline.size === 0 && toRemove.size === 0)
            break;
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
function isSimpleSideEffectFree(node) {
    if (!node || typeof node !== 'object')
        return false;
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
function propagateSingleUseNonLiterals(body) {
    const MAX_ITERATIONS = 3;
    let result = body;
    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        const wrapperPrefix = 'const __su__ = ';
        const wrappedSource = wrapperPrefix + result;
        const parseResult = parseSync('__su__.tsx', wrappedSource, { experimentalRawTransfer: true });
        if (!parseResult.program || parseResult.errors?.length)
            break;
        const offset = wrapperPrefix.length;
        // Collect all mutable (let/var) variable names -- these must not be referenced
        // by inlining candidates since their values can change between declaration and use.
        const mutableVars = new Set();
        function collectMutableVars(node) {
            if (!node || typeof node !== 'object')
                return;
            if (node.type === 'VariableDeclaration' && (node.kind === 'let' || node.kind === 'var')) {
                for (const decl of node.declarations ?? []) {
                    if (decl.id?.type === 'Identifier')
                        mutableVars.add(decl.id.name);
                }
            }
            for (const key of Object.keys(node)) {
                if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                    continue;
                const val = node[key];
                if (val && typeof val === 'object') {
                    if (Array.isArray(val)) {
                        for (const item of val) {
                            if (item && typeof item.type === 'string')
                                collectMutableVars(item);
                        }
                    }
                    else if (typeof val.type === 'string') {
                        collectMutableVars(val);
                    }
                }
            }
        }
        collectMutableVars(parseResult.program);
        // Collect identifiers referenced in an init expression
        function collectInitIdentifiers(node) {
            const ids = new Set();
            function walk(n) {
                if (!n || typeof n !== 'object')
                    return;
                if (n.type === 'Identifier') {
                    ids.add(n.name);
                    return;
                }
                for (const key of Object.keys(n)) {
                    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                        continue;
                    const val = n[key];
                    if (val && typeof val === 'object') {
                        if (Array.isArray(val)) {
                            for (const item of val) {
                                if (item && typeof item.type === 'string')
                                    walk(item);
                            }
                        }
                        else if (typeof val.type === 'string') {
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
        const candidates = new Map();
        function findCandidates(node) {
            if (!node || typeof node !== 'object')
                return;
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
                if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                    continue;
                const val = node[key];
                if (val && typeof val === 'object') {
                    if (Array.isArray(val)) {
                        for (const item of val) {
                            if (item && typeof item.type === 'string')
                                findCandidates(item);
                        }
                    }
                    else if (typeof val.type === 'string') {
                        findCandidates(val);
                    }
                }
            }
        }
        findCandidates(parseResult.program);
        if (candidates.size === 0)
            break;
        // Count references
        const refCounts = new Map();
        for (const name of candidates.keys())
            refCounts.set(name, 0);
        function countRefs(node, parentKey, parentNode) {
            if (!node || typeof node !== 'object')
                return;
            if (node.type === 'Identifier' && candidates.has(node.name)) {
                if (parentKey === 'id' && parentNode?.type === 'VariableDeclarator') {
                    // skip declaration id
                }
                else {
                    const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
                    const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed;
                    if (!isPropertyKey && !isMemberProp) {
                        refCounts.set(node.name, (refCounts.get(node.name) ?? 0) + 1);
                    }
                }
            }
            for (const key of Object.keys(node)) {
                if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                    continue;
                const val = node[key];
                if (val && typeof val === 'object') {
                    if (Array.isArray(val)) {
                        for (const item of val) {
                            if (item && typeof item.type === 'string')
                                countRefs(item, key, node);
                        }
                    }
                    else if (typeof val.type === 'string') {
                        countRefs(val, key, node);
                    }
                }
            }
        }
        countRefs(parseResult.program);
        const toInline = new Map();
        const toRemove = new Set();
        for (const [name, info] of candidates) {
            const refs = refCounts.get(name) ?? 0;
            if (refs === 1) {
                toInline.set(name, info.value);
                toRemove.add(name);
            }
            else if (refs === 0) {
                toRemove.add(name);
            }
        }
        if (toInline.size === 0 && toRemove.size === 0)
            break;
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
function removeConstDeclarations(body, varNames) {
    const wrapperPrefix = 'const __rd__ = ';
    const wrappedSource = wrapperPrefix + body;
    const parseResult = parseSync('__rd__.tsx', wrappedSource, { experimentalRawTransfer: true });
    if (!parseResult.program || parseResult.errors?.length)
        return body;
    const offset = wrapperPrefix.length;
    const removals = [];
    function findDecls(node) {
        if (!node || typeof node !== 'object')
            return;
        if (node.type === 'VariableDeclaration' && node.kind === 'const' &&
            node.declarations?.length === 1) {
            const decl = node.declarations[0];
            if (decl.id?.type === 'Identifier' && varNames.has(decl.id.name)) {
                let start = node.start - offset;
                let end = node.end - offset;
                // Consume trailing semicolon and whitespace/newline
                while (end < body.length && (body[end] === ';' || body[end] === ' ' || body[end] === '\t'))
                    end++;
                if (end < body.length && body[end] === '\n')
                    end++;
                // Consume leading whitespace
                while (start > 0 && (body[start - 1] === ' ' || body[start - 1] === '\t'))
                    start--;
                removals.push({ start, end });
            }
        }
        for (const key of Object.keys(node)) {
            if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                continue;
            const val = node[key];
            if (val && typeof val === 'object') {
                if (Array.isArray(val)) {
                    for (const item of val) {
                        if (item && typeof item.type === 'string')
                            findDecls(item);
                    }
                }
                else if (typeof val.type === 'string') {
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
/**
 * Inject a line right after the opening brace or arrow of a function body.
 * For block bodies (`=> { ...}`), inserts after `{`.
 * For expression bodies (`=> expr`), converts to block body with return.
 */
function injectLineAfterBodyOpen(bodyText, line) {
    // Find the arrow `=>`
    let depth = 0;
    let inString = null;
    let arrowIdx = -1;
    for (let i = 0; i < bodyText.length - 1; i++) {
        const ch = bodyText[i];
        if (inString) {
            if (ch === inString && bodyText[i - 1] !== '\\')
                inString = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
            inString = ch;
            continue;
        }
        if (ch === '(' || ch === '[' || ch === '<') {
            depth++;
            continue;
        }
        if (ch === ')' || ch === ']' || ch === '>') {
            depth--;
            continue;
        }
        if (depth === 0 && ch === '=' && bodyText[i + 1] === '>') {
            arrowIdx = i;
            break;
        }
    }
    if (arrowIdx === -1) {
        // Try function expression
        const braceIdx = bodyText.indexOf('{');
        if (braceIdx >= 0) {
            return bodyText.slice(0, braceIdx + 1) + '\n' + line + bodyText.slice(braceIdx + 1);
        }
        return bodyText;
    }
    let afterArrow = arrowIdx + 2;
    while (afterArrow < bodyText.length && /\s/.test(bodyText[afterArrow]))
        afterArrow++;
    if (bodyText[afterArrow] === '{') {
        return bodyText.slice(0, afterArrow + 1) + '\n' + line + bodyText.slice(afterArrow + 1);
    }
    // Expression body: convert to block
    const expr = bodyText.slice(afterArrow);
    const prefix = bodyText.slice(0, arrowIdx + 2);
    return prefix + ' {\n' + line + '\nreturn ' + expr + ';\n}';
}
export function applyRawPropsTransformDetailed(body) {
    const result = applyRawPropsTransform(body);
    if (result === body) {
        return { body, transformed: false, destructuredFieldLocals: [] };
    }
    // Extract the field names by re-parsing the original body
    const fieldLocals = [...extractDestructuredFieldMap(body).keys()];
    return { body: result, transformed: true, destructuredFieldLocals: fieldLocals };
}
/**
 * Extract a map from local binding name to property key name from a destructured first parameter.
 * Given `({foo, "bind:value": bindValue}) => ...`, returns Map { "foo" -> "foo", "bindValue" -> "bind:value" }.
 */
export function extractDestructuredFieldMap(body) {
    const wrapperPrefix = 'const __rp__ = ';
    const wrappedSource = wrapperPrefix + body;
    const parseResult = parseSync('__rpx__.tsx', wrappedSource, { experimentalRawTransfer: true });
    if (!parseResult.program || parseResult.errors?.length)
        return new Map();
    const decl = parseResult.program.body?.[0];
    if (!decl || decl.type !== 'VariableDeclaration')
        return new Map();
    const init = decl.declarations?.[0]?.init;
    if (!init)
        return new Map();
    let params;
    if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
        params = init.params;
    }
    if (!params || params.length === 0)
        return new Map();
    const firstParam = params[0];
    if (firstParam.type !== 'ObjectPattern')
        return new Map();
    const fieldMap = new Map();
    for (const prop of firstParam.properties ?? []) {
        if (prop.type === 'RestElement')
            continue;
        if (prop.type === 'Property' || prop.type === 'ObjectProperty') {
            const keyName = prop.key?.type === 'Identifier' ? prop.key.name
                : (prop.key?.type === 'StringLiteral' || prop.key?.type === 'Literal') ? (prop.key.value ?? null)
                    : null;
            const valName = prop.value?.type === 'Identifier' ? prop.value.name :
                prop.value?.type === 'AssignmentPattern' && prop.value.left?.type === 'Identifier'
                    ? prop.value.left.name : null;
            if (keyName && valName)
                fieldMap.set(valName, String(keyName));
        }
    }
    return fieldMap;
}
/**
 * After _rawProps transform, consolidate .w([...]) arrays:
 * Replace any _rawProps.xxx entries with a single _rawProps, deduped.
 *
 * e.g., `.w([arg0, _rawProps.foo, _rawProps.bar])` -> `.w([arg0, _rawProps])`
 *
 * Returns the consolidated body text.
 */
export function consolidateRawPropsInWCalls(body) {
    // Find all .w([...]) patterns and consolidate _rawProps.xxx to _rawProps
    return body.replace(/\.w\(\[\s*([\s\S]*?)\s*\]\)/g, (fullMatch, captureContent) => {
        // Split by comma, trim whitespace
        const items = captureContent.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
        if (items.length === 0)
            return fullMatch;
        // Check if any items are _rawProps.xxx
        let hasRawPropsField = false;
        const consolidated = [];
        let hasRawProps = false;
        for (const item of items) {
            if (item.startsWith('_rawProps.') || item.startsWith('_rawProps[')) {
                hasRawPropsField = true;
                if (!hasRawProps) {
                    consolidated.push('_rawProps');
                    hasRawProps = true;
                }
            }
            else if (item === '_rawProps') {
                if (!hasRawProps) {
                    consolidated.push('_rawProps');
                    hasRawProps = true;
                }
            }
            else {
                consolidated.push(item);
            }
        }
        if (!hasRawPropsField)
            return fullMatch;
        // Rebuild .w([...]) with consolidated items
        if (consolidated.length === 1) {
            return `.w([\n        ${consolidated[0]}\n    ])`;
        }
        return `.w([\n        ${consolidated.join(',\n        ')}\n    ])`;
    });
}
export function applyRawPropsTransform(body) {
    // Parse the body to get the AST and find destructured params
    const wrapperPrefix = 'const __rp__ = ';
    const wrappedSource = wrapperPrefix + body;
    const parseResult = parseSync('__rp__.tsx', wrappedSource, { experimentalRawTransfer: true });
    if (!parseResult.program || parseResult.errors?.length) {
        return body;
    }
    // Find the arrow/function expression in the init of the const declaration
    const decl = parseResult.program.body?.[0];
    if (!decl || decl.type !== 'VariableDeclaration')
        return body;
    const init = decl.declarations?.[0]?.init;
    if (!init)
        return body;
    // Get params from arrow function or function expression
    let params;
    if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
        params = init.params;
    }
    if (!params || params.length === 0)
        return body;
    const firstParam = params[0];
    // Calculate positions relative to the body string (subtract wrapperPrefix length)
    const offset = wrapperPrefix.length;
    // Handle body-level destructure from a named parameter:
    // (props) => { const { 'bind:value': bindValue } = props; ... }
    // Transform to: (props) => { ... props["bind:value"] ... }
    // Keep the original param name (not _rawProps) so that signal analysis produces
    // _wrapProp(props, "bind:value") matching SWC's output exactly.
    if (firstParam.type === 'Identifier') {
        const paramName = firstParam.name;
        // Look for variable declarations that destructure from this param in the function body
        const funcBody = init.body;
        if (!funcBody || funcBody.type !== 'BlockStatement')
            return body;
        // Find `const { ... } = paramName;` in the body
        let destructureDecl = null;
        let destructureDeclIdx = -1;
        for (let i = 0; i < (funcBody.body?.length ?? 0); i++) {
            const stmt = funcBody.body[i];
            if (stmt.type === 'VariableDeclaration') {
                for (const d of stmt.declarations ?? []) {
                    if (d.id?.type === 'ObjectPattern' && d.init?.type === 'Identifier' && d.init.name === paramName) {
                        destructureDecl = d;
                        destructureDeclIdx = i;
                        break;
                    }
                }
            }
            if (destructureDecl)
                break;
        }
        if (!destructureDecl)
            return body;
        // Extract fields from the destructure pattern
        const bodyFields = [];
        let bodyRestElementName = null;
        for (const prop of destructureDecl.id.properties ?? []) {
            if (prop.type === 'RestElement') {
                const restId = prop.argument?.type === 'Identifier' ? prop.argument.name : null;
                if (restId)
                    bodyRestElementName = restId;
                continue;
            }
            if (prop.type === 'Property' || prop.type === 'ObjectProperty') {
                const keyName = prop.key?.type === 'Identifier' ? prop.key.name
                    : (prop.key?.type === 'StringLiteral' || prop.key?.type === 'Literal') ? (prop.key.value ?? null)
                        : null;
                const valName = prop.value?.type === 'Identifier' ? prop.value.name :
                    prop.value?.type === 'AssignmentPattern' && prop.value.left?.type === 'Identifier'
                        ? prop.value.left.name : null;
                if (keyName && valName) {
                    bodyFields.push({ key: String(keyName), local: valName });
                }
            }
        }
        if (bodyFields.length === 0 && !bodyRestElementName)
            return body;
        // Step 1: Keep the param as-is (no rename). Remove the destructure statement.
        let result = body;
        // Remove the `const { ... } = props;` statement (including leading whitespace and trailing newline)
        const stmtNode = funcBody.body[destructureDeclIdx];
        const stmtStart = stmtNode.start - offset;
        const stmtEnd = stmtNode.end - offset;
        // Walk backwards from statement start to find the beginning of the line (including leading whitespace)
        let lineStart = stmtStart;
        while (lineStart > 0 && (result[lineStart - 1] === ' ' || result[lineStart - 1] === '\t')) {
            lineStart--;
        }
        // Remove the statement and any trailing newline
        let afterStmt = result.slice(stmtEnd);
        if (afterStmt.startsWith('\n'))
            afterStmt = afterStmt.slice(1);
        else if (afterStmt.startsWith('\r\n'))
            afterStmt = afterStmt.slice(2);
        result = result.slice(0, lineStart) + afterStmt;
        // If there's a rest element, inject _restProps assignment
        if (bodyRestElementName) {
            if (bodyFields.length > 0) {
                const excludedKeys = bodyFields.map(f => `"${f.key}"`).join(',\n    ');
                const restLine = `const ${bodyRestElementName} = _restProps(${paramName}, [\n    ${excludedKeys}\n]);`;
                result = injectLineAfterBodyOpen(result, restLine);
            }
            else {
                const restLine = `const ${bodyRestElementName} = _restProps(${paramName});`;
                result = injectLineAfterBodyOpen(result, restLine);
            }
        }
        // Step 2: Replace references to destructured locals with paramName.key
        const fieldLocalToKey = new Map();
        for (const f of bodyFields) {
            fieldLocalToKey.set(f.local, f.key);
        }
        const reparseSource = wrapperPrefix + result;
        const reparseResult = parseSync('__rp_body__.tsx', reparseSource, { experimentalRawTransfer: true });
        if (!reparseResult.program || reparseResult.errors?.length)
            return result;
        const replacements = [];
        function walkForBodyIdents(node, parentKey, parentNode) {
            if (!node || typeof node !== 'object')
                return;
            if (node.type === 'Identifier' && fieldLocalToKey.has(node.name)) {
                const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
                const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed;
                const isParam = parentKey === 'params';
                const isDeclaratorId = parentKey === 'id' && parentNode?.type === 'VariableDeclarator';
                const isShorthandValue = parentKey === 'value' &&
                    (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty') &&
                    parentNode?.shorthand === true;
                if (isShorthandValue) {
                    replacements.push({ start: node.start - offset, end: node.end - offset, key: fieldLocalToKey.get(node.name), isShorthand: true });
                }
                else if (!isPropertyKey && !isMemberProp && !isParam && !isDeclaratorId) {
                    replacements.push({ start: node.start - offset, end: node.end - offset, key: fieldLocalToKey.get(node.name) });
                }
            }
            for (const key of Object.keys(node)) {
                if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                    continue;
                const val = node[key];
                if (val && typeof val === 'object') {
                    if (Array.isArray(val)) {
                        for (const item of val) {
                            if (item && typeof item.type === 'string')
                                walkForBodyIdents(item, key, node);
                        }
                    }
                    else if (typeof val.type === 'string') {
                        walkForBodyIdents(val, key, node);
                    }
                }
            }
        }
        walkForBodyIdents(reparseResult.program);
        replacements.sort((a, b) => b.start - a.start);
        for (const r of replacements) {
            const accessor = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(r.key)
                ? `${paramName}.${r.key}`
                : `${paramName}["${r.key}"]`;
            if (r.isShorthand) {
                result = result.slice(0, r.start) + r.key + ': ' + accessor + result.slice(r.end);
            }
            else {
                result = result.slice(0, r.start) + accessor + result.slice(r.end);
            }
        }
        return result;
    }
    if (firstParam.type !== 'ObjectPattern')
        return body;
    // Collect destructured field names and their local aliases, and detect rest element
    const fields = [];
    let restElementName = null;
    for (const prop of firstParam.properties ?? []) {
        if (prop.type === 'RestElement') {
            // Rest element ({...rest}) -- collect the rest variable name
            const restId = prop.argument?.type === 'Identifier' ? prop.argument.name : null;
            if (restId) {
                restElementName = restId;
            }
            continue;
        }
        if (prop.type === 'Property' || prop.type === 'ObjectProperty') {
            const keyName = prop.key?.type === 'Identifier' ? prop.key.name
                : (prop.key?.type === 'StringLiteral' || prop.key?.type === 'Literal') ? (prop.key.value ?? null)
                    : null;
            let valName = null;
            let defaultValue;
            if (prop.value?.type === 'Identifier') {
                valName = prop.value.name;
            }
            else if (prop.value?.type === 'AssignmentPattern' && prop.value.left?.type === 'Identifier') {
                valName = prop.value.left.name;
                // Extract default value source text for ?? replacement
                if (prop.value.right) {
                    const defStart = prop.value.right.start - offset;
                    const defEnd = prop.value.right.end - offset;
                    if (defStart >= 0 && defEnd <= body.length) {
                        defaultValue = body.slice(defStart, defEnd);
                    }
                }
            }
            if (keyName && valName) {
                fields.push({ key: String(keyName), local: valName, defaultValue });
            }
        }
    }
    // Pure rest props ({...rest}) with no named fields
    if (restElementName && fields.length === 0) {
        const paramStartPos = firstParam.start - offset;
        const paramEndPos = firstParam.end - offset;
        let result = body.slice(0, paramStartPos) + '_rawProps' + body.slice(paramEndPos);
        // Prepend _restProps assignment after the arrow/function body opening
        const restLine = `const ${restElementName} = _restProps(_rawProps);`;
        result = injectLineAfterBodyOpen(result, restLine);
        return result;
    }
    // Mixed rest props ({message, id, ...rest}) -- handle both fields AND rest element
    if (restElementName && fields.length > 0) {
        const paramStartPos = firstParam.start - offset;
        const paramEndPos = firstParam.end - offset;
        let result = body.slice(0, paramStartPos) + '_rawProps' + body.slice(paramEndPos);
        // Prepend _restProps assignment with excluded keys
        const excludedKeys = fields.map(f => `"${f.key}"`).join(',\n    ');
        const restLine = `const ${restElementName} = _restProps(_rawProps, [\n    ${excludedKeys}\n]);`;
        result = injectLineAfterBodyOpen(result, restLine);
        // Replace field references with _rawProps.fieldName (same logic as non-rest case)
        const fieldLocalToKey = new Map();
        for (const f of fields) {
            fieldLocalToKey.set(f.local, f.key);
        }
        const reparseSource = wrapperPrefix + result;
        const reparseResult2 = parseSync('__rp3__.tsx', reparseSource, { experimentalRawTransfer: true });
        if (!reparseResult2.program || reparseResult2.errors?.length)
            return result;
        const replacements = [];
        function walkForIdents(node, parentKey, parentNode) {
            if (!node || typeof node !== 'object')
                return;
            if (node.type === 'Identifier' && fieldLocalToKey.has(node.name)) {
                const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
                const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed;
                const isParam = parentKey === 'params';
                const isDeclaratorId = parentKey === 'id' && parentNode?.type === 'VariableDeclarator';
                const isShorthandValue = parentKey === 'value' &&
                    (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty') &&
                    parentNode?.shorthand === true;
                if (isShorthandValue) {
                    replacements.push({ start: node.start - offset, end: node.end - offset, key: fieldLocalToKey.get(node.name), isShorthand: true });
                }
                else if (!isPropertyKey && !isMemberProp && !isParam && !isDeclaratorId) {
                    replacements.push({ start: node.start - offset, end: node.end - offset, key: fieldLocalToKey.get(node.name) });
                }
            }
            for (const key of Object.keys(node)) {
                if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                    continue;
                const val = node[key];
                if (val && typeof val === 'object') {
                    if (Array.isArray(val)) {
                        for (const item of val) {
                            if (item && typeof item.type === 'string')
                                walkForIdents(item, key, node);
                        }
                    }
                    else if (typeof val.type === 'string') {
                        walkForIdents(val, key, node);
                    }
                }
            }
        }
        walkForIdents(reparseResult2.program);
        replacements.sort((a, b) => b.start - a.start);
        for (const r of replacements) {
            const accessor = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(r.key)
                ? '_rawProps.' + r.key
                : `_rawProps["${r.key}"]`;
            if (r.isShorthand) {
                result = result.slice(0, r.start) + r.key + ': ' + accessor + result.slice(r.end);
            }
            else {
                result = result.slice(0, r.start) + accessor + result.slice(r.end);
            }
        }
        return result;
    }
    if (fields.length === 0)
        return body;
    const paramStart = firstParam.start - offset;
    const paramEnd = firstParam.end - offset;
    // Step 1: Replace the destructuring pattern with _rawProps
    let result = body.slice(0, paramStart) + '_rawProps' + body.slice(paramEnd);
    // Step 2: Replace all bare identifier references to destructured fields
    // with _rawProps.fieldName. We need to be careful to only replace bare
    // identifiers, not property names in object literals or member expressions.
    //
    // Strategy: re-parse after param replacement, walk the AST to find
    // Identifier nodes that match field local names, and replace them
    // with _rawProps.keyName (using the original key, not the alias).
    const fieldLocalToKey = new Map();
    const fieldLocalToDefault = new Map();
    for (const f of fields) {
        fieldLocalToKey.set(f.local, f.key);
        if (f.defaultValue !== undefined) {
            fieldLocalToDefault.set(f.local, f.defaultValue);
        }
    }
    // Re-parse to find identifier positions in the updated body
    const reparseSource = wrapperPrefix + result;
    const reparseResult = parseSync('__rp2__.tsx', reparseSource, { experimentalRawTransfer: true });
    if (!reparseResult.program || reparseResult.errors?.length)
        return result;
    // Collect all identifier positions that need replacement (descending order for safe replacement)
    const replacements = [];
    function walkForIdentifiers(node, parentKey, parentNode) {
        if (!node || typeof node !== 'object')
            return;
        if (node.type === 'Identifier' && fieldLocalToKey.has(node.name)) {
            // Skip if this identifier is a property key in an object literal (shorthand or not)
            // Skip if this is the parameter itself (in the _rawProps position)
            // Skip if this is a property name in a member expression (x.field -- skip 'field')
            const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
            const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed;
            const isParam = parentKey === 'params';
            const isDeclaratorId = parentKey === 'id' && parentNode?.type === 'VariableDeclarator';
            // For shorthand properties ({ some }), the value IS the same identifier as the key.
            // We need to handle this specially: replace the whole property with `key: _rawProps.key`.
            const isShorthandValue = parentKey === 'value' &&
                (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty') &&
                parentNode?.shorthand === true;
            if (isShorthandValue) {
                // Replace the shorthand property identifier, but mark it so we prepend "key: "
                replacements.push({
                    start: node.start - offset,
                    end: node.end - offset,
                    key: fieldLocalToKey.get(node.name),
                    local: node.name,
                    isShorthand: true,
                });
            }
            else if (!isPropertyKey && !isMemberProp && !isParam && !isDeclaratorId) {
                replacements.push({
                    start: node.start - offset,
                    end: node.end - offset,
                    key: fieldLocalToKey.get(node.name),
                    local: node.name,
                });
            }
        }
        for (const key of Object.keys(node)) {
            if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                continue;
            const val = node[key];
            if (val && typeof val === 'object') {
                if (Array.isArray(val)) {
                    for (const item of val) {
                        if (item && typeof item.type === 'string') {
                            walkForIdentifiers(item, key, node);
                        }
                    }
                }
                else if (typeof val.type === 'string') {
                    walkForIdentifiers(val, key, node);
                }
            }
        }
    }
    walkForIdentifiers(reparseResult.program);
    // Sort descending by start position and apply replacements
    replacements.sort((a, b) => b.start - a.start);
    for (const r of replacements) {
        // Use bracket notation for keys that aren't valid JS identifiers (e.g., "bind:value")
        let accessor = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(r.key)
            ? '_rawProps.' + r.key
            : `_rawProps["${r.key}"]`;
        // If the destructured field had a default value, use ?? to preserve it
        // e.g., ({description = ''}) -> (_rawProps.description ?? '')
        // Parenthesize to avoid precedence issues with surrounding operators
        const defaultVal = fieldLocalToDefault.get(r.local);
        if (defaultVal !== undefined) {
            accessor = `(${accessor} ?? ${defaultVal})`;
        }
        if (r.isShorthand) {
            // Shorthand property: { some } -> { some: _rawProps.some }
            result = result.slice(0, r.start) + r.key + ': ' + accessor + result.slice(r.end);
        }
        else {
            result = result.slice(0, r.start) + accessor + result.slice(r.end);
        }
    }
    return result;
}
/**
 * Replace original field name references with _rawProps.field in a body string.
 * For child segments whose captures were consolidated into a single _rawProps capture.
 */
function replacePropsFieldReferencesInBody(body, fieldMap) {
    const wrapperPrefix = 'const __rpfb__ = ';
    const wrappedSource = wrapperPrefix + body;
    let parseResult;
    try {
        parseResult = parseSync('__rpfb__.tsx', wrappedSource, { experimentalRawTransfer: true });
    }
    catch {
        return body;
    }
    if (!parseResult.program || parseResult.errors?.length)
        return body;
    const offset = wrapperPrefix.length;
    const replacements = [];
    function walkNode(node, parentKey, parentNode) {
        if (!node || typeof node !== 'object')
            return;
        if (node.type === 'Identifier' && fieldMap.has(node.name)) {
            const isPropertyKey = parentKey === 'key' && (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
            const isMemberProp = parentKey === 'property' && (parentNode?.type === 'MemberExpression' || parentNode?.type === 'StaticMemberExpression') && !parentNode?.computed;
            const isParam = parentKey === 'params';
            // Skip the declaration in _captures unpacking: `const color = _captures[0]` -> skip `color`
            const isDeclId = parentKey === 'id' && parentNode?.type === 'VariableDeclarator';
            const isShorthandValue = parentKey === 'value' &&
                (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty') &&
                parentNode?.shorthand === true;
            const key = fieldMap.get(node.name);
            const accessor = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
                ? '_rawProps.' + key
                : `_rawProps["${key}"]`;
            if (isShorthandValue) {
                replacements.push({ start: node.start - offset, end: node.end - offset, accessor, isShorthand: true });
            }
            else if (!isPropertyKey && !isMemberProp && !isParam && !isDeclId) {
                replacements.push({ start: node.start - offset, end: node.end - offset, accessor });
            }
        }
        for (const k of Object.keys(node)) {
            if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range')
                continue;
            const val = node[k];
            if (val && typeof val === 'object') {
                if (Array.isArray(val)) {
                    for (const item of val) {
                        if (item && typeof item.type === 'string')
                            walkNode(item, k, node);
                    }
                }
                else if (typeof val.type === 'string') {
                    walkNode(val, k, node);
                }
            }
        }
    }
    walkNode(parseResult.program);
    if (replacements.length === 0)
        return body;
    replacements.sort((a, b) => b.start - a.start);
    let result = body;
    for (const r of replacements) {
        if (r.isShorthand) {
            const key = fieldMap.get(result.slice(r.start, r.end));
            result = result.slice(0, r.start) + key + ': ' + r.accessor + result.slice(r.end);
        }
        else {
            result = result.slice(0, r.start) + r.accessor + result.slice(r.end);
        }
    }
    return result;
}
function transformSCallBody(ext, allExtractions, qrlVarNames, jsxBodyOptions, regCtxName, sharedSignalHoister) {
    let body = ext.bodyText;
    const additionalImports = new Map();
    const hoistedDeclarations = [];
    // 1. Find nested extractions (children of this extraction)
    const nested = allExtractions.filter(e => e.parent === ext.symbolName);
    // 2. Rewrite nested call sites in descending position order
    //    to avoid position shifting issues
    if (nested.length > 0) {
        const bodyOffset = ext.argStart;
        const sortedNested = [...nested].sort((a, b) => b.callStart - a.callStart);
        for (const child of sortedNested) {
            const childVarName = qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`;
            const relCallStart = child.callStart - bodyOffset;
            const relCallEnd = child.callEnd - bodyOffset;
            if (relCallStart >= 0 && relCallEnd <= body.length) {
                if (child.isBare) {
                    // Bare $() -> just the QRL variable name
                    body = body.slice(0, relCallStart) + childVarName + body.slice(relCallEnd);
                }
                else if ((child.ctxKind === 'eventHandler' || child.ctxKind === 'jSXProp') && !child.qrlCallee) {
                    // Direct JSX event/QRL-prop attribute: onClick$={() => ...) -> q-e:click={q_varName}
                    // Also handles jSXProp (render$, custom$, etc.) which behave identically
                    // The callStart..callEnd range covers the full attribute text: onClick$={() => ...}
                    // NOTE: Named markers inside JSX attrs (onClick$={server$(...)}) have qrlCallee set
                    // and their callStart..callEnd only covers the call expression, so they use the
                    // named marker path below instead.
                    // For component elements (uppercase tag), keep original event name (onClick$)
                    // For HTML elements, transform to q-e:click
                    let propName;
                    if (child.isComponentEvent) {
                        // Component element: keep onClick$={q_ref}
                        propName = child.ctxName;
                    }
                    else {
                        const transformedPropName = transformEventPropName(child.ctxName, new Set());
                        propName = transformedPropName ?? child.ctxName;
                    }
                    // For regCtxName-matched extractions, wrap the QRL var in serverQrl()
                    const isRegCtx = matchesRegCtxName(child, regCtxName);
                    let qrlRef = isRegCtx ? `serverQrl(${childVarName})` : childVarName;
                    if (isRegCtx) {
                        // Preserve the original import source package for serverQrl
                        // (e.g., server$ from @qwik.dev/router should emit serverQrl from @qwik.dev/router)
                        const serverQrlSource = child.importSource || '@qwik.dev/core';
                        additionalImports.set('serverQrl', serverQrlSource);
                    }
                    // Cross-scope loop captures: generate standalone .w() hoisting
                    // instead of inline .w() on the QRL ref
                    const hasLoopCrossCaptures = !isRegCtx &&
                        child.captures &&
                        child.captureNames.length > 0 &&
                        child.paramNames.length >= 2 &&
                        child.paramNames[0] === '_' && child.paramNames[1] === '_1';
                    if (hasLoopCrossCaptures) {
                        // Generate: const SymbolName = q_SymbolName.w([\n    captureVar\n]);
                        // This goes before the loop body, hoisted into the map callback
                        const hoistedName = child.symbolName;
                        const wCaptures = child.captureNames.join(',\n            ');
                        const hoistDecl = `const ${hoistedName} = ${childVarName}.w([\n            ${wCaptures}\n        ]);`;
                        hoistedDeclarations.push(hoistDecl);
                        // Use the hoisted variable name (not q_ prefixed) in the JSX
                        qrlRef = hoistedName;
                    }
                    else if (!isRegCtx && child.captureNames.length > 0) {
                        // Non-loop captures: inline .w() on the QRL ref
                        qrlRef += '.w([\n        ' + child.captureNames.join(',\n        ') + '\n    ])';
                    }
                    const replacement = `${propName}={${qrlRef}}`;
                    body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);
                }
                else {
                    // Named marker: callee$(args) -> calleeQrl(qrlVar)
                    let replacement = child.qrlCallee + '(' + childVarName;
                    // Add .w([captures]) if the child has captures
                    if (child.captureNames.length > 0) {
                        replacement += '.w([\n        ' + child.captureNames.join(',\n        ') + '\n    ])';
                    }
                    replacement += ')';
                    body = body.slice(0, relCallStart) + replacement + body.slice(relCallEnd);
                    // Track that we need the Qrl-suffixed callee import
                    if (child.qrlCallee) {
                        additionalImports.set(child.qrlCallee, getQrlImportSource(child.qrlCallee, child.importSource));
                    }
                }
            }
        }
    }
    // 3. Inline pre-resolved const literals into the body text.
    //    These were resolved early in transform.ts (before event handler promotion)
    //    and stored on the extraction. Apply them to the body text here.
    if (ext.constLiterals && ext.constLiterals.size > 0) {
        body = inlineConstCaptures(body, ext.constLiterals);
    }
    // 3a. Resolve const literals from parent for any remaining captures.
    //     This handles non-event-handler extractions that weren't processed by early resolution.
    const isRegCtx = matchesRegCtxName(ext, regCtxName);
    if (ext.captureNames.length > 0 && ext.parent !== null) {
        const parentExt = allExtractions.find(e => e.symbolName === ext.parent);
        if (parentExt) {
            const constValues = resolveConstLiterals(parentExt.bodyText, ext.captureNames);
            if (constValues.size > 0) {
                body = inlineConstCaptures(body, constValues);
                // Remove inlined names from captureNames
                ext.captureNames = ext.captureNames.filter(n => !constValues.has(n));
                ext.captures = ext.captureNames.length > 0;
                // Store for later use (e.g., parent DCE)
                if (!ext.constLiterals)
                    ext.constLiterals = constValues;
                else
                    for (const [k, v] of constValues)
                        ext.constLiterals.set(k, v);
            }
        }
    }
    // 3b. Inject _captures unpacking if this extraction has remaining captures.
    //     For regCtxName-matched extractions, don't inject _captures (they don't use it).
    if (isRegCtx) {
        // Don't inject _captures for regCtxName extractions
    }
    else if (ext.captureNames.length > 0) {
        body = injectCapturesUnpacking(body, ext.captureNames);
        additionalImports.set('_captures', '@qwik.dev/core');
    }
    // 3b. _rawProps destructuring optimization for component$ extractions ONLY.
    //     When a component has destructured params like ({field1, field2}),
    //     rewrite to (_rawProps) and replace field refs with _rawProps.field.
    //     Other closures (useTask$, useVisibleTask$, $, etc.) keep their original
    //     destructuring patterns intact (e.g., ({ track }) stays as-is).
    const isComponentCtx = ext.ctxName === 'component$' || ext.ctxName === 'componentQrl';
    {
        const rawPropsResult = isComponentCtx ? applyRawPropsTransform(body) : body;
        if (rawPropsResult !== body) {
            body = rawPropsResult;
            // If _restProps was introduced, ensure its import is tracked
            if (body.includes('_restProps(')) {
                additionalImports.set('_restProps', '@qwik.dev/core');
            }
            // Consolidate .w([_rawProps.foo, _rawProps.bar]) -> .w([_rawProps])
            body = consolidateRawPropsInWCalls(body);
        }
    }
    // 3c. For child segments whose captures were consolidated into _rawProps,
    //     replace original field name references with _rawProps.field in the body.
    //     This handles the case where useComputed$(() => color) inside component$({color})
    //     needs to become useComputed$(() => _rawProps.color).
    if (ext.propsFieldCaptures && ext.propsFieldCaptures.size > 0) {
        body = replacePropsFieldReferencesInBody(body, ext.propsFieldCaptures);
    }
    // 3d. Intra-body const literal propagation.
    //     Inline `const X = <literal>` within the body and remove dead declarations.
    //     Only handles literal consts (string, number, boolean, null) for safety.
    body = propagateConstLiteralsInBody(body);
    // 4. JSX transpilation within the body text
    let finalKeyCounterValue;
    if (jsxBodyOptions?.enableJsx) {
        // Wrap the body as a parseable module-level expression
        const wrapperPrefix = 'const __body__ = ';
        const wrappedSource = wrapperPrefix + body;
        // Parse the wrapped source to get an AST
        const parseResult = parseSync('__body__.tsx', wrappedSource, { experimentalRawTransfer: true });
        if (parseResult.program && !parseResult.errors?.length) {
            const bodyS = new MagicString(wrappedSource);
            // Augment importedNames with QRL variable names so they're classified as
            // const in prop classification (they're module-level const declarations)
            const bodyImportedNames = new Set(jsxBodyOptions.importedNames);
            for (const [, varName] of qrlVarNames) {
                bodyImportedNames.add(varName);
            }
            // Build qpOverrides and qrlsWithCaptures from nested event handler extractions
            // that have promoted captures (paramNames with _, _1 padding).
            // This enables q:p/q:ps injection on JSX elements with event handler QRLs.
            let bodyQpOverrides;
            let bodyQrlsWithCaptures;
            {
                // Build a map from QRL variable name -> promoted capture param names
                const qrlParamMap = new Map();
                for (const child of nested) {
                    if (child.ctxKind !== 'eventHandler')
                        continue;
                    if (child.paramNames.length < 2 || child.paramNames[0] !== '_' || child.paramNames[1] !== '_1')
                        continue;
                    // Extract actual capture params (skip _, _1 padding and _N gap placeholders)
                    const captureParams = [];
                    for (let pi = 2; pi < child.paramNames.length; pi++) {
                        const p = child.paramNames[pi];
                        if (/^_\d+$/.test(p) || p === '_')
                            continue;
                        captureParams.push(p);
                    }
                    if (captureParams.length === 0)
                        continue;
                    const childVarName = qrlVarNames.get(child.symbolName) ?? `q_${child.symbolName}`;
                    qrlParamMap.set(childVarName, captureParams);
                    // Also map the symbol name itself (used when .w() hoisting creates a const)
                    qrlParamMap.set(child.symbolName, captureParams);
                }
                if (qrlParamMap.size > 0) {
                    bodyQpOverrides = new Map();
                    bodyQrlsWithCaptures = new Set();
                    // Walk the parsed body AST to find JSX elements with event handler attributes
                    function walkAstForQp(node) {
                        if (!node || typeof node !== 'object')
                            return;
                        if (Array.isArray(node)) {
                            node.forEach(walkAstForQp);
                            return;
                        }
                        if (node.type === 'JSXElement' && node.openingElement) {
                            const attrs = node.openingElement.attributes || [];
                            const elementParams = [];
                            const seen = new Set();
                            for (const attr of attrs) {
                                if (attr.type === 'JSXAttribute') {
                                    let attrName = null;
                                    if (attr.name?.type === 'JSXIdentifier') {
                                        attrName = attr.name.name;
                                    }
                                    else if (attr.name?.type === 'JSXNamespacedName') {
                                        attrName = `${attr.name.namespace?.name}:${attr.name.name?.name}`;
                                    }
                                    const isEventAttr = attrName && (attrName.endsWith('$') ||
                                        attrName.startsWith('q-e:') || attrName.startsWith('q-ep:') ||
                                        attrName.startsWith('q-dp:') || attrName.startsWith('q-wp:') ||
                                        attrName.startsWith('q-d:') || attrName.startsWith('q-w:'));
                                    if (isEventAttr) {
                                        if (attr.value?.type === 'JSXExpressionContainer' && attr.value.expression?.type === 'Identifier') {
                                            const qrlName = attr.value.expression.name;
                                            const params = qrlParamMap.get(qrlName);
                                            if (params) {
                                                bodyQrlsWithCaptures.add(qrlName);
                                                for (const p of params) {
                                                    if (!seen.has(p)) {
                                                        seen.add(p);
                                                        elementParams.push(p);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                            if (elementParams.length > 0) {
                                bodyQpOverrides.set(node.start, elementParams);
                            }
                        }
                        for (const key of Object.keys(node)) {
                            if (key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                                continue;
                            walkAstForQp(node[key]);
                        }
                    }
                    walkAstForQp(parseResult.program);
                    // If no overrides were found, clear the maps
                    if (bodyQpOverrides.size === 0) {
                        bodyQpOverrides = undefined;
                        bodyQrlsWithCaptures = undefined;
                    }
                }
            }
            // Run JSX transform on the wrapped body
            const bodyJsxResult = transformAllJsx(wrappedSource, bodyS, parseResult.program, bodyImportedNames, [], // No skip ranges within the body
            jsxBodyOptions.devOptions, jsxBodyOptions.keyCounterStart, true, // enableSignals
            bodyQpOverrides, // qpOverrides for q:p/q:ps injection
            bodyQrlsWithCaptures, // qrlsWithCaptures for var/const prop classification
            undefined, // paramNames
            jsxBodyOptions.relPath, // for key prefix derivation
            sharedSignalHoister);
            // Extract the transformed body by stripping the wrapper prefix
            const transformedWrapped = bodyS.toString();
            body = transformedWrapped.slice(wrapperPrefix.length);
            // Strip trailing semicolon if one was added by the wrapper
            if (body.endsWith(';') && !ext.bodyText.endsWith(';')) {
                body = body.slice(0, -1);
            }
            // Collect imports needed by JSX transform
            for (const sym of bodyJsxResult.neededImports) {
                additionalImports.set(sym, '@qwik.dev/core');
            }
            if (bodyJsxResult.needsFragment) {
                additionalImports.set('Fragment as _Fragment', '@qwik.dev/core/jsx-runtime');
            }
            // Collect hoisted declarations for the parent preamble
            hoistedDeclarations.push(...bodyJsxResult.hoistedDeclarations);
            // Return the final key counter value for continuation
            finalKeyCounterValue = bodyJsxResult.keyCounterValue;
        }
    }
    // Dead const literal elimination: remove `const X = literal;` declarations
    // from the body when X is no longer referenced (after nested extractions
    // consumed those const captures and they were inlined into child segments).
    const hasNestedExts = allExtractions.some(e => e.parent === ext.symbolName);
    if (hasNestedExts) {
        body = removeDeadConstLiterals(body);
    }
    return { transformedBody: body, additionalImports, hoistedDeclarations, keyCounterValue: finalKeyCounterValue };
}
/**
 * Rewrite a parent module source using magic-string.
 *
 * Pipeline:
 *   1. processImports       - remove/filter import declarations, track survivors
 *   2. applyModeTransforms  - strip exports, replace constants
 *   3. resolveNesting       - determine parent-child extraction relationships
 *   4. rewriteCallSites     - replace $() calls with QRL references
 *   5. addCaptureWrapping   - append .w([captures]) to QRL references
 *   6. runJsxTransform      - convert JSX to _jsxSorted calls
 *   7. collectNeededImports - gather all optimizer-added imports
 *   8. buildQrlDeclarations - generate QRL const declarations
 *   9. buildInlineSCalls    - generate .s() calls for inline/hoist strategy
 *  10. filterUnusedImports  - remove specifiers only used in segments
 *  11. assembleOutput       - prepend preamble, insert .s() calls, strip TS
 */
export function rewriteParentModule(source, relPath, extractions, originalImports, migrationDecisions, moduleLevelDecls, jsxOptions, mode, devFilePath, inlineOptions, stripExports, isServer, explicitExtensions, transpileTs, minify, outputExtension, existingProgram) {
    const s = new MagicString(source);
    const program = existingProgram ?? parseSync(relPath, source, { experimentalRawTransfer: true }).program;
    const ctx = {
        source, relPath, s, program, extractions, originalImports,
        migrationDecisions, moduleLevelDecls, jsxOptions, mode, devFilePath,
        inlineOptions, stripExports, isServer, explicitExtensions, transpileTs,
        minify, outputExtension,
        // Accumulated state
        extractedCalleeNames: new Set(),
        alreadyImported: new Set(),
        survivingUserImports: [],
        survivingImportInfos: [],
        topLevel: [],
        earlyQrlVarNames: new Map(),
        neededImports: new Map(),
        qrlVarNames: new Map(),
        qrlDecls: [],
        sCalls: [],
        inlineHoistedDeclarations: [],
        inlinedQrlSymbols: new Set(),
        eventHandlerExtraImports: [],
        noArgQrlCallees: [],
        jsxResult: null,
        jsxKeyCounterValue: 0,
        isDevMode: mode === 'dev' || mode === 'hmr',
        isInline: inlineOptions?.inline === true,
    };
    collectExtractedCalleeNames(ctx);
    processImports(ctx);
    applyModeTransforms(ctx);
    resolveNesting(ctx);
    preConsolidateRawPropsCaptures(ctx);
    ctx.topLevel = extractions.filter((e) => e.parent === null);
    preComputeQrlVarNames(ctx);
    rewriteCallSites(ctx);
    rewriteNoArgMarkers(ctx);
    removeUnusedBindings(ctx);
    removeDuplicateExports(ctx);
    addCaptureWrapping(ctx);
    runJsxTransform(ctx);
    collectNeededImports(ctx);
    buildQrlDeclarations(ctx);
    buildInlineSCalls(ctx);
    filterUnusedImports(ctx);
    const finalCode = assembleOutput(ctx);
    return {
        code: finalCode,
        extractions,
        jsxKeyCounterValue: ctx.jsxKeyCounterValue || undefined,
    };
}
function collectExtractedCalleeNames(ctx) {
    for (const ext of ctx.extractions) {
        ctx.extractedCalleeNames.add(ext.calleeName);
        if (ext.isInlinedQrl) {
            ctx.extractedCalleeNames.add('_captures');
            ctx.extractedCalleeNames.add('_inlinedQrl');
        }
    }
    // SWC strips the bare `$` import unconditionally when any extraction occurs
    if (ctx.extractions.length > 0) {
        ctx.extractedCalleeNames.add('$');
    }
    for (const [localName] of ctx.originalImports) {
        ctx.alreadyImported.add(localName);
    }
}
/**
 * Remove all import declarations from body and track surviving user imports.
 * Imports are reassembled in the preamble so optimizer imports appear first.
 */
function processImports(ctx) {
    const { s, program, source, extractedCalleeNames, minify } = ctx;
    for (const node of program.body) {
        if (node.type !== 'ImportDeclaration')
            continue;
        const specifiers = node.specifiers;
        const sourceNode = node.source;
        const rewrittenSource = rewriteImportSource(sourceNode.value);
        const rawSource = sourceNode.raw ?? sourceNode.value;
        const quoteChar = rawSource.startsWith("'") ? "'" : '"';
        // Side-effect imports: keep in place, just rewrite source
        if (!specifiers || specifiers.length === 0) {
            if (rewrittenSource !== sourceNode.value) {
                s.overwrite(sourceNode.start + 1, sourceNode.end - 1, rewrittenSource);
            }
            continue;
        }
        const toRemove = [];
        for (let i = 0; i < specifiers.length; i++) {
            const spec = specifiers[i];
            if (spec.type !== 'ImportSpecifier')
                continue;
            const importedName = spec.imported?.name ?? spec.local.name;
            if (isMarkerSpecifier(importedName, extractedCalleeNames)) {
                toRemove.push(i);
            }
        }
        let end = node.end;
        if (end < source.length && source[end] === '\n')
            end++;
        s.remove(node.start, end);
        if (toRemove.length === specifiers.length)
            continue;
        // For single-quoted Qwik core imports with non-$ survivors, preserve all
        // specifiers when minify is 'none' (matches Rust behavior)
        const isQwikSource = rewrittenSource.startsWith('@qwik.dev/') ||
            rewrittenSource.startsWith('@builder.io/qwik');
        let preserveAll = false;
        if (isQwikSource && quoteChar === "'" && minify === 'none') {
            const hasNonDollarSurvivor = specifiers.some((spec, i) => {
                if (toRemove.includes(i))
                    return false;
                if (spec.type !== 'ImportSpecifier')
                    return true;
                const importedName = spec.imported?.name ?? spec.local.name;
                return !importedName.endsWith('$');
            });
            if (hasNonDollarSurvivor)
                preserveAll = true;
        }
        let defaultPart = '';
        let nsPart = '';
        const namedParts = [];
        const namedPartsStructured = [];
        for (let i = 0; i < specifiers.length; i++) {
            if (!preserveAll && toRemove.includes(i))
                continue;
            const spec = specifiers[i];
            if (spec.type === 'ImportDefaultSpecifier') {
                defaultPart = spec.local.name;
            }
            else if (spec.type === 'ImportNamespaceSpecifier') {
                nsPart = `* as ${spec.local.name}`;
            }
            else {
                const localName = spec.local.name;
                const importedName = spec.imported?.name ?? localName;
                namedPartsStructured.push({ local: localName, imported: importedName });
                if (importedName !== localName) {
                    namedParts.push(`${importedName} as ${localName}`);
                }
                else {
                    namedParts.push(localName);
                }
            }
        }
        let importParts = '';
        if (nsPart) {
            importParts = defaultPart ? `${defaultPart}, ${nsPart}` : nsPart;
        }
        else if (namedParts.length > 0) {
            importParts = defaultPart
                ? `${defaultPart}, { ${namedParts.join(', ')} }`
                : `{ ${namedParts.join(', ')} }`;
        }
        else if (defaultPart) {
            importParts = defaultPart;
        }
        if (importParts) {
            ctx.survivingUserImports.push(`import ${importParts} from ${quoteChar}${rewrittenSource}${quoteChar};`);
            ctx.survivingImportInfos.push({
                defaultPart,
                nsPart,
                namedParts: namedPartsStructured,
                quote: quoteChar,
                source: rewrittenSource,
                isSideEffect: false,
                preservedAll: preserveAll,
            });
        }
    }
}
function applyModeTransforms(ctx) {
    if (ctx.stripExports && ctx.stripExports.length > 0) {
        stripExportDeclarations(ctx.source, ctx.s, ctx.program, ctx.stripExports, ctx.originalImports);
    }
    const isDev = (ctx.mode === 'dev' || ctx.mode === 'hmr') ? true : ctx.mode === 'prod' ? false : undefined;
    if (ctx.isServer !== undefined || isDev !== undefined) {
        replaceConstants(ctx.source, ctx.s, ctx.program, ctx.originalImports, ctx.isServer, isDev);
    }
}
/**
 * Assign parent-child relationships between extractions.
 * Picks the innermost (smallest range) containing parent for multi-level nesting.
 */
function resolveNesting(ctx) {
    const sorted = [...ctx.extractions].sort((a, b) => a.callStart - b.callStart);
    for (let i = 0; i < sorted.length; i++) {
        let bestParent = null;
        let bestRange = Infinity;
        for (let j = 0; j < sorted.length; j++) {
            if (i === j)
                continue;
            if (sorted[i].callStart >= sorted[j].argStart &&
                sorted[i].callEnd <= sorted[j].argEnd) {
                const range = sorted[j].argEnd - sorted[j].argStart;
                if (range < bestRange) {
                    bestRange = range;
                    bestParent = sorted[j];
                }
            }
        }
        if (bestParent) {
            sorted[i].parent = bestParent.symbolName;
        }
    }
    for (const ext of sorted) {
        const orig = ctx.extractions.find((e) => e.symbolName === ext.symbolName);
        if (orig)
            orig.parent = ext.parent;
    }
}
/**
 * For child segments inside component$ that capture destructured prop fields,
 * consolidate them into a single _rawProps capture. Must run before body generation.
 */
function preConsolidateRawPropsCaptures(ctx) {
    if (!ctx.inlineOptions?.inline)
        return;
    for (const ext of ctx.extractions) {
        if (ext.parent === null || ext.captureNames.length === 0)
            continue;
        const parentExt = ctx.extractions.find(e => e.symbolName === ext.parent);
        if (!parentExt)
            continue;
        const fieldMap = extractDestructuredFieldMap(parentExt.bodyText);
        if (fieldMap.size === 0)
            continue;
        const nonPropsCaptures = [];
        let hasPropsFields = false;
        const propsFieldCaptures = new Map();
        for (const name of ext.captureNames) {
            if (fieldMap.has(name)) {
                hasPropsFields = true;
                propsFieldCaptures.set(name, fieldMap.get(name));
            }
            else {
                nonPropsCaptures.push(name);
            }
        }
        if (hasPropsFields) {
            ext.propsFieldCaptures = propsFieldCaptures;
            ext.captureNames = [...nonPropsCaptures, '_rawProps'].sort();
            ext.captures = ext.captureNames.length > 0;
        }
    }
}
/**
 * When strip options are active, stripped segments use sentinel-named variables
 * (q_qrl_{counter}) instead of q_{symbolName}. Pre-compute so call site
 * rewriting uses the correct names.
 */
function preComputeQrlVarNames(ctx) {
    if (!ctx.inlineOptions)
        return;
    let earlyStrippedCounter = 0;
    for (const ext of ctx.extractions) {
        if (ext.isSync)
            continue;
        const stripped = isStrippedSegment(ext.ctxName, ext.ctxKind, ctx.inlineOptions.stripCtxName, ctx.inlineOptions.stripEventHandlers);
        if (stripped) {
            const idx = earlyStrippedCounter++;
            const counter = 0xffff0000 + idx * 2;
            ctx.earlyQrlVarNames.set(ext.symbolName, `q_qrl_${counter}`);
        }
        else {
            ctx.earlyQrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
        }
    }
}
function getQrlVarName(ctx, symbolName) {
    return ctx.earlyQrlVarNames.get(symbolName) ?? `q_${symbolName}`;
}
/** Replace top-level $() call sites with QRL variable references. */
function rewriteCallSites(ctx) {
    const { s, topLevel, inlineOptions } = ctx;
    for (const ext of topLevel) {
        if (ext.isSync) {
            s.overwrite(ext.callStart, ext.callEnd, buildSyncTransform(ext.bodyText));
        }
        else if (ext.isInlinedQrl) {
            s.overwrite(ext.callStart, ext.callEnd, getQrlVarName(ctx, ext.symbolName));
        }
        else if (ext.isBare) {
            s.overwrite(ext.callStart, ext.callEnd, getQrlVarName(ctx, ext.symbolName));
        }
        else if ((ext.ctxKind === 'eventHandler' || ext.ctxKind === 'jSXProp') && !ext.qrlCallee) {
            // Direct JSX event/QRL-prop attribute
            let propName;
            if (ext.isComponentEvent) {
                propName = ext.ctxName;
            }
            else {
                propName = transformEventPropName(ext.ctxName, new Set()) ?? ext.ctxName;
            }
            const isRegCtx = matchesRegCtxName(ext, inlineOptions?.regCtxName);
            let qrlRef = isRegCtx ? `serverQrl(${getQrlVarName(ctx, ext.symbolName)})` : getQrlVarName(ctx, ext.symbolName);
            if (isRegCtx) {
                const serverQrlSource = ext.importSource || '@qwik.dev/core';
                ctx.eventHandlerExtraImports.push({ sym: 'serverQrl', src: serverQrlSource });
            }
            if (!isRegCtx && ext.captureNames.length > 0) {
                qrlRef += '.w([\n        ' + ext.captureNames.join(',\n        ') + '\n    ])';
            }
            s.overwrite(ext.callStart, ext.callEnd, `${propName}={${qrlRef}}`);
        }
        else {
            // Named marker (component$, useTask$, etc.)
            s.overwrite(ext.calleeStart, ext.calleeEnd, ext.qrlCallee);
            s.overwrite(ext.argStart, ext.argEnd, getQrlVarName(ctx, ext.symbolName));
            if (needsPureAnnotation(ext.qrlCallee)) {
                s.prependRight(ext.callStart, '/*#__PURE__*/ ');
            }
        }
    }
}
/** Rename marker calls with no arguments (e.g. `component$()`) to Qrl form. */
function rewriteNoArgMarkers(ctx) {
    const { s, program, originalImports, extractedCalleeNames, alreadyImported } = ctx;
    const extractedCallStarts = new Set(ctx.extractions.map(e => e.callStart));
    function walk(node) {
        if (!node || typeof node !== 'object')
            return;
        if (Array.isArray(node)) {
            for (const item of node)
                walk(item);
            return;
        }
        if (node.type === 'CallExpression' && !extractedCallStarts.has(node.start)) {
            const calleeName = node.callee?.type === 'Identifier' ? node.callee.name : null;
            if (calleeName) {
                const importInfo = originalImports.get(calleeName);
                if (importInfo && importInfo.importedName.endsWith('$') &&
                    importInfo.importedName !== '$' && importInfo.importedName !== 'sync$') {
                    if (!node.arguments || node.arguments.length === 0) {
                        const qrlCallee = importInfo.importedName.slice(0, -1) + 'Qrl';
                        s.overwrite(node.callee.start, node.callee.end, qrlCallee);
                        if (needsPureAnnotation(qrlCallee)) {
                            s.prependRight(node.start, '/*#__PURE__*/ ');
                        }
                        extractedCalleeNames.add(importInfo.importedName);
                        ctx.noArgQrlCallees.push({ callee: qrlCallee, source: importInfo.source });
                        if (!alreadyImported.has(qrlCallee)) {
                            alreadyImported.add(qrlCallee);
                        }
                    }
                }
            }
        }
        for (const key of Object.keys(node)) {
            if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                continue;
            walk(node[key]);
        }
    }
    walk(program.body);
}
/**
 * Strip `const foo = ` from unused variable bindings wrapping QRL call sites.
 * For bare $() on unused bindings, mark them for inline QRL (no separate const).
 * Also replaces inlined QRL symbols with full qrl() expressions.
 */
function removeUnusedBindings(ctx) {
    if (ctx.minify === 'none')
        return;
    const { s, source, program, topLevel, explicitExtensions, outputExtension } = ctx;
    for (const stmt of program.body) {
        if (stmt.type === 'ExportNamedDeclaration')
            continue;
        if (stmt.type !== 'VariableDeclaration')
            continue;
        const decl = stmt;
        if (!decl.declarations || decl.declarations.length !== 1)
            continue;
        const declarator = decl.declarations[0];
        if (!declarator.init)
            continue;
        const initStart = declarator.init.start;
        const initEnd = declarator.init.end;
        const matchingExtractions = topLevel.filter((ext) => !ext.isSync &&
            ext.callStart >= initStart && ext.callEnd <= initEnd);
        const isInlinedQrlCall = declarator.init.type === 'CallExpression' &&
            declarator.init.callee?.type === 'Identifier' &&
            declarator.init.callee.name === 'inlinedQrl';
        if (matchingExtractions.length === 0 && !isInlinedQrlCall)
            continue;
        const varName = declarator.id?.type === 'Identifier' ? declarator.id.name : null;
        if (!varName)
            continue;
        const wordBoundaryRegex = new RegExp(`\\b${varName}\\b`);
        let bodyText = '';
        for (const bodyStmt of program.body) {
            if (bodyStmt.type === 'ImportDeclaration')
                continue;
            if (bodyStmt === decl)
                continue;
            bodyText += source.slice(bodyStmt.start, bodyStmt.end) + '\n';
        }
        if (!wordBoundaryRegex.test(bodyText)) {
            s.remove(decl.start, initStart);
            for (const ext of matchingExtractions) {
                if (ext.isBare && ext.callStart === initStart && ext.callEnd === initEnd) {
                    ctx.inlinedQrlSymbols.add(ext.symbolName);
                }
            }
        }
    }
    // Replace inlined QRL symbols with full qrl() expressions
    for (const ext of topLevel) {
        if (!ctx.inlinedQrlSymbols.has(ext.symbolName))
            continue;
        const inlineExt = explicitExtensions ? (outputExtension ?? '.js') : '';
        const inlineQrl = `/*#__PURE__*/ qrl(()=>import("./${ext.canonicalFilename}${inlineExt}"), "${ext.symbolName}")`;
        s.overwrite(ext.callStart, ext.callEnd, inlineQrl);
    }
}
/** Remove duplicate `export const { ... }` declarations (keep first occurrence). */
function removeDuplicateExports(ctx) {
    if (ctx.minify === 'none')
        return;
    const seenExportNames = new Set();
    for (const stmt of ctx.program.body) {
        if (stmt.type !== 'ExportNamedDeclaration')
            continue;
        const innerDecl = stmt.declaration;
        if (!innerDecl || innerDecl.type !== 'VariableDeclaration')
            continue;
        if (!innerDecl.declarations || innerDecl.declarations.length !== 1)
            continue;
        const declarator = innerDecl.declarations[0];
        if (!declarator.init)
            continue;
        const exportedNames = collectBindingNames(declarator.id);
        if (exportedNames.length === 0)
            continue;
        const hasDuplicate = exportedNames.some(n => seenExportNames.has(n));
        if (hasDuplicate) {
            ctx.s.remove(stmt.start, stmt.end);
        }
        else {
            for (const name of exportedNames) {
                seenExportNames.add(name);
            }
        }
    }
}
/** Append .w([captures]) to QRL references for captured variables. */
function addCaptureWrapping(ctx) {
    const { s, topLevel, migrationDecisions } = ctx;
    // Migrated variables don't need .w() wrapping
    const migratedNames = new Set((migrationDecisions ?? [])
        .filter(d => d.action === 'reexport' || d.action === 'move')
        .map(d => d.varName));
    for (const ext of topLevel) {
        if (ext.isSync)
            continue;
        if (ext.isInlinedQrl) {
            if (!ext.explicitCaptures)
                continue;
            const captureItems = parseArrayItems(ext.explicitCaptures);
            if (captureItems.length === 0)
                continue;
            const wrapVars = captureItems.join(',\n    ');
            s.appendLeft(ext.callEnd, `.w([\n    ${wrapVars}\n])`);
            continue;
        }
        if (ext.captureNames.length === 0)
            continue;
        // JSX event/prop extractions already have .w() baked into the replacement
        if ((ext.ctxKind === 'eventHandler' || ext.ctxKind === 'jSXProp') && !ext.qrlCallee)
            continue;
        const effectiveCaptures = ext.captureNames.filter(name => !migratedNames.has(name));
        if (effectiveCaptures.length === 0)
            continue;
        const wrapVars = effectiveCaptures.join(',\n        ');
        const wText = `.w([\n        ${wrapVars}\n    ])`;
        if (ext.isBare) {
            s.appendLeft(ext.callEnd, wText);
        }
        else {
            s.appendLeft(ext.argEnd, wText);
        }
    }
}
function runJsxTransform(ctx) {
    if (!ctx.jsxOptions?.enableJsx)
        return;
    const skipRanges = ctx.topLevel.map((ext) => ({
        start: ext.argStart,
        end: ext.argEnd,
    }));
    ctx.jsxResult = transformAllJsx(ctx.source, ctx.s, ctx.program, ctx.jsxOptions.importedNames, skipRanges, ctx.isDevMode ? { relPath: ctx.relPath } : undefined, undefined, ctx.jsxOptions.enableSignals !== false, undefined, undefined, undefined, ctx.relPath);
    ctx.jsxKeyCounterValue = ctx.jsxResult.keyCounterValue;
}
/** Gather all optimizer-added imports from extractions, JSX, and event handlers. */
function collectNeededImports(ctx) {
    const { neededImports, alreadyImported, topLevel, extractions, inlineOptions, isDevMode, isInline, inlinedQrlSymbols, noArgQrlCallees, eventHandlerExtraImports, jsxResult, originalImports } = ctx;
    const hasTopLevelNonSync = topLevel.some((e) => !e.isSync);
    const hasAnyNonSync = extractions.some((e) => !e.isSync);
    if (isInline) {
        if (hasAnyNonSync) {
            const noopSymbol = isDevMode ? '_noopQrlDEV' : '_noopQrl';
            if (!alreadyImported.has(noopSymbol)) {
                neededImports.set(noopSymbol, '@qwik.dev/core');
            }
        }
        const needsCapturesImport = extractions.some((e) => !e.isSync && e.captureNames.length > 0 && !(inlineOptions && isStrippedSegment(e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers)));
        if (needsCapturesImport && !alreadyImported.has('_captures')) {
            neededImports.set('_captures', '@qwik.dev/core');
        }
    }
    else if (inlineOptions && !inlineOptions.inline) {
        if (hasTopLevelNonSync) {
            const hasNonStripped = topLevel.some((e) => !e.isSync && !isStrippedSegment(e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers));
            const hasStripped = topLevel.some((e) => !e.isSync && isStrippedSegment(e.ctxName, e.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers));
            if (hasNonStripped) {
                const qrlSymbol = isDevMode ? 'qrlDEV' : 'qrl';
                if (!alreadyImported.has(qrlSymbol))
                    neededImports.set(qrlSymbol, '@qwik.dev/core');
            }
            if (hasStripped) {
                const noopSymbol = isDevMode ? '_noopQrlDEV' : '_noopQrl';
                if (!alreadyImported.has(noopSymbol))
                    neededImports.set(noopSymbol, '@qwik.dev/core');
            }
        }
    }
    else {
        if (hasTopLevelNonSync) {
            const qrlSymbol = isDevMode ? 'qrlDEV' : 'qrl';
            if (!alreadyImported.has(qrlSymbol))
                neededImports.set(qrlSymbol, '@qwik.dev/core');
            const hasInlinedQrlLocal = topLevel.some((e) => e.isInlinedQrl && !ctx.relPath.includes('node_modules'));
            if (hasInlinedQrlLocal && !isDevMode && !alreadyImported.has('qrlDEV')) {
                neededImports.set('qrlDEV', '@qwik.dev/core');
            }
        }
    }
    for (const ext of topLevel) {
        if (ext.isSync) {
            if (!alreadyImported.has('_qrlSync'))
                neededImports.set('_qrlSync', '@qwik.dev/core');
            continue;
        }
        if (ext.isBare) {
            if (inlinedQrlSymbols.has(ext.symbolName) && !alreadyImported.has('qrl')) {
                neededImports.set('qrl', '@qwik.dev/core');
            }
            continue;
        }
        const qrlCallee = ext.qrlCallee;
        if (qrlCallee && !alreadyImported.has(qrlCallee)) {
            if (!isCustomInlined(ext, originalImports)) {
                neededImports.set(qrlCallee, getQrlImportSource(qrlCallee, ext.importSource));
            }
        }
    }
    for (const { callee, source } of noArgQrlCallees) {
        if (!neededImports.has(callee)) {
            neededImports.set(callee, getQrlImportSource(callee, source));
        }
    }
    for (const { sym, src } of eventHandlerExtraImports) {
        if (!alreadyImported.has(sym) && !neededImports.has(sym)) {
            neededImports.set(sym, src);
        }
    }
    if (jsxResult) {
        for (const sym of jsxResult.neededImports) {
            if (!alreadyImported.has(sym))
                neededImports.set(sym, '@qwik.dev/core');
        }
        if (jsxResult.needsFragment && !alreadyImported.has('_Fragment')) {
            neededImports.set('Fragment as _Fragment', '@qwik.dev/core/jsx-runtime');
        }
    }
}
function buildQrlDeclarations(ctx) {
    const { extractions, inlineOptions, isDevMode, devFilePath, isInline, inlinedQrlSymbols, explicitExtensions, outputExtension, relPath } = ctx;
    const topLevelNonSync = extractions.filter((e) => !e.isSync && e.parent === null && !inlinedQrlSymbols.has(e.symbolName));
    const allNonSync = extractions.filter((e) => !e.isSync && !inlinedQrlSymbols.has(e.symbolName));
    let strippedCounter = 0;
    if (isInline) {
        for (const ext of allNonSync) {
            const isRegCtx = matchesRegCtxName(ext, inlineOptions?.regCtxName);
            const stripped = !isRegCtx && inlineOptions && isStrippedSegment(ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers);
            if (stripped) {
                const idx = strippedCounter++;
                if (isDevMode && devFilePath) {
                    ctx.qrlDecls.push(buildStrippedNoopQrlDev(ext.symbolName, idx, {
                        file: devFilePath, lo: 0, hi: 0, displayName: ext.displayName,
                    }));
                }
                else {
                    ctx.qrlDecls.push(buildStrippedNoopQrl(ext.symbolName, idx));
                }
                const counter = 0xffff0000 + idx * 2;
                ctx.qrlVarNames.set(ext.symbolName, `q_qrl_${counter}`);
            }
            else {
                if (isDevMode && devFilePath) {
                    ctx.qrlDecls.push(buildNoopQrlDevDeclaration(ext.symbolName, {
                        file: devFilePath, lo: ext.argStart, hi: ext.argEnd, displayName: ext.displayName,
                    }));
                }
                else {
                    ctx.qrlDecls.push(buildNoopQrlDeclaration(ext.symbolName));
                }
                ctx.qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
            }
        }
    }
    else if (inlineOptions && !inlineOptions.inline) {
        for (const ext of topLevelNonSync) {
            const stripped = isStrippedSegment(ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers);
            if (stripped) {
                const idx = strippedCounter++;
                if (isDevMode && devFilePath) {
                    ctx.qrlDecls.push(buildStrippedNoopQrlDev(ext.symbolName, idx, {
                        file: devFilePath, lo: 0, hi: 0, displayName: ext.displayName,
                    }));
                }
                else {
                    ctx.qrlDecls.push(buildStrippedNoopQrl(ext.symbolName, idx));
                }
                const counter = 0xffff0000 + idx * 2;
                ctx.qrlVarNames.set(ext.symbolName, `q_qrl_${counter}`);
            }
            else {
                if (isDevMode && devFilePath) {
                    const devExt = explicitExtensions ? (outputExtension ?? '.js') : undefined;
                    ctx.qrlDecls.push(buildQrlDevDeclaration(ext.symbolName, ext.canonicalFilename, devFilePath, ext.loc[0], ext.loc[1], ext.displayName, devExt));
                }
                else {
                    ctx.qrlDecls.push(buildQrlDeclaration(ext.symbolName, ext.canonicalFilename, explicitExtensions, ext.extension, outputExtension));
                }
                ctx.qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
            }
        }
    }
    else {
        const devExt = explicitExtensions ? (outputExtension ?? '.js') : undefined;
        for (const ext of topLevelNonSync) {
            if (isDevMode && devFilePath) {
                ctx.qrlDecls.push(buildQrlDevDeclaration(ext.symbolName, ext.canonicalFilename, devFilePath, ext.loc[0], ext.loc[1], ext.displayName, devExt));
            }
            else if (ext.isInlinedQrl && !relPath.includes('node_modules')) {
                const inlinedDevFile = devFilePath ?? buildDevFilePath(relPath, '', undefined);
                ctx.qrlDecls.push(buildQrlDevDeclaration(ext.symbolName, ext.canonicalFilename, inlinedDevFile, ext.loc[0], ext.loc[1], ext.displayName, devExt));
            }
            else {
                ctx.qrlDecls.push(buildQrlDeclaration(ext.symbolName, ext.canonicalFilename, explicitExtensions, ext.extension, outputExtension));
            }
            ctx.qrlVarNames.set(ext.symbolName, `q_${ext.symbolName}`);
        }
    }
    ctx.qrlDecls.sort();
}
function buildInlineSCalls(ctx) {
    if (!ctx.isInline)
        return;
    const { extractions, inlineOptions, jsxOptions, isDevMode, relPath, s, program, neededImports, alreadyImported, qrlVarNames, inlinedQrlSymbols, mode, transpileTs } = ctx;
    const allNonSync = extractions.filter((e) => !e.isSync && !inlinedQrlSymbols.has(e.symbolName));
    // Use hoist-to-const when entryType is 'hoist', or 'inline' with both transpileTs
    // and JSX enabled (except dev mode which always uses inline .s())
    const isHoist = inlineOptions?.entryType === 'hoist' ||
        (inlineOptions?.entryType === 'inline' && !!transpileTs && !!jsxOptions?.enableJsx && mode !== 'dev');
    let sCallJsxOptions = jsxOptions?.enableJsx
        ? {
            enableJsx: true,
            importedNames: jsxOptions.importedNames,
            devOptions: isDevMode ? { relPath } : undefined,
            keyCounterStart: isHoist ? ctx.jsxKeyCounterValue : undefined,
            relPath,
        }
        : undefined;
    const sharedHoister = jsxOptions?.enableJsx ? new SignalHoister() : undefined;
    // Partition: nested first, then top-level non-component, then component
    const nestedExts = [];
    const topNonComponent = [];
    const topComponent = [];
    for (const ext of allNonSync) {
        const isRegCtx = matchesRegCtxName(ext, inlineOptions?.regCtxName);
        const isStrippedExt = !isRegCtx && inlineOptions && isStrippedSegment(ext.ctxName, ext.ctxKind, inlineOptions.stripCtxName, inlineOptions.stripEventHandlers);
        if (isStrippedExt)
            continue;
        if (ext.parent !== null) {
            nestedExts.push(ext);
        }
        else if (ext.ctxName === 'component') {
            topComponent.push(ext);
        }
        else {
            topNonComponent.push(ext);
        }
    }
    // For hoist: map each extraction to its containing statement
    const extContainingStmtStart = new Map();
    if (isHoist) {
        for (const ext of allNonSync) {
            for (const stmt of program.body) {
                if (stmt.type === 'ImportDeclaration')
                    continue;
                if (ext.callStart >= stmt.start && ext.callStart < stmt.end) {
                    extContainingStmtStart.set(ext.symbolName, stmt.start);
                    break;
                }
            }
        }
    }
    const processExtraction = (ext) => {
        const varName = qrlVarNames.get(ext.symbolName) ?? `q_${ext.symbolName}`;
        const { transformedBody: rawBody, additionalImports, hoistedDeclarations, keyCounterValue } = transformSCallBody(ext, extractions, qrlVarNames, sCallJsxOptions, inlineOptions?.regCtxName, sharedHoister);
        // Rewrite function signature for event handlers with positional params
        let sigRewrittenBody = rawBody;
        if (ext.paramNames.length >= 2 &&
            ext.paramNames[0] === '_' && ext.paramNames[1] === '_1') {
            sigRewrittenBody = rewriteFunctionSignature(rawBody, ext.paramNames);
        }
        const isRegCtxMatch = matchesRegCtxName(ext, inlineOptions?.regCtxName);
        let transformedBody = sigRewrittenBody;
        if (isRegCtxMatch) {
            transformedBody = `/*#__PURE__*/ _regSymbol(${rawBody}, "${ext.hash}")`;
            neededImports.set('_regSymbol', '@qwik.dev/core');
        }
        if (isHoist && keyCounterValue !== undefined && sCallJsxOptions) {
            ctx.jsxKeyCounterValue = keyCounterValue;
            sCallJsxOptions = { ...sCallJsxOptions, keyCounterStart: ctx.jsxKeyCounterValue };
        }
        ctx.inlineHoistedDeclarations.push(...hoistedDeclarations);
        for (const [sym, src] of additionalImports) {
            if (!alreadyImported.has(sym) && !neededImports.has(sym)) {
                neededImports.set(sym, src);
            }
        }
        const forceInlineForRegCtx = isRegCtxMatch && inlineOptions?.entryType === 'inline';
        if (isHoist && !forceInlineForRegCtx) {
            // Strip TS types since hoist output is emitted as .js
            let hoistBody = transformedBody;
            try {
                const stripped = oxcTransformSync('__body__.tsx', hoistBody);
                if (stripped.code && !stripped.errors?.length) {
                    hoistBody = stripped.code;
                    if (hoistBody.endsWith(';\n'))
                        hoistBody = hoistBody.slice(0, -2);
                    else if (hoistBody.endsWith(';'))
                        hoistBody = hoistBody.slice(0, -1);
                }
            }
            catch {
                // TS stripping failed, use original
            }
            const constDecl = buildHoistConstDecl(ext.symbolName, hoistBody);
            const sCall = buildHoistSCall(varName, ext.symbolName);
            const stmtStart = extContainingStmtStart.get(ext.symbolName);
            if (stmtStart !== undefined) {
                s.appendLeft(stmtStart, constDecl + '\n' + sCall + '\n');
            }
            else {
                ctx.sCalls.push(constDecl);
                ctx.sCalls.push(sCall);
            }
        }
        else {
            ctx.sCalls.push(buildSCall(varName, transformedBody));
        }
    };
    for (const ext of nestedExts)
        processExtraction(ext);
    for (const ext of topNonComponent)
        processExtraction(ext);
    for (const ext of topComponent)
        processExtraction(ext);
    if (sharedHoister) {
        ctx.inlineHoistedDeclarations.length = 0;
        ctx.inlineHoistedDeclarations.push(...sharedHoister.getDeclarations());
    }
}
/**
 * Remove specifiers from surviving user imports that are only used inside
 * segment bodies (no longer referenced in the parent module).
 */
function filterUnusedImports(ctx) {
    const { survivingUserImports, survivingImportInfos, s, qrlDecls, sCalls, inlineHoistedDeclarations, isInline, inlineOptions, relPath } = ctx;
    if (survivingUserImports.length === 0 || survivingImportInfos.length === 0)
        return;
    const bodyText = s.toString();
    const allPreambleText = [...qrlDecls, ...sCalls, ...inlineHoistedDeclarations].join('\n');
    const fullRefText = bodyText + '\n' + allPreambleText;
    for (let idx = survivingUserImports.length - 1; idx >= 0; idx--) {
        const info = survivingImportInfos[idx];
        if (info.isSideEffect || info.nsPart || info.preservedAll)
            continue;
        let defaultUsed = false;
        if (info.defaultPart) {
            defaultUsed = new RegExp(`\\b${info.defaultPart}\\b`).test(fullRefText);
        }
        const usedNamed = [];
        for (const np of info.namedParts) {
            if (new RegExp(`\\b${np.local}\\b`).test(fullRefText)) {
                usedNamed.push(np);
            }
        }
        if (!defaultUsed && usedNamed.length === 0 && !info.nsPart) {
            // For inline strategy with stripping: relative imports within srcDir become side-effect imports
            const src = info.source;
            const hasStripping = !!(inlineOptions?.stripCtxName?.length || inlineOptions?.stripEventHandlers);
            if (isInline && hasStripping && src.startsWith('.')) {
                const segments = src.split('/');
                let upLevels = 0;
                for (const seg of segments) {
                    if (seg === '..')
                        upLevels++;
                    else
                        break;
                }
                const fileDir = relPath.replace(/[^/]+$/, '');
                const fileDirDepth = fileDir.split('/').filter(Boolean).length;
                if (upLevels <= fileDirDepth) {
                    survivingUserImports[idx] = `import ${info.quote}${src}${info.quote};`;
                    survivingImportInfos[idx] = { ...info, namedParts: [], defaultPart: '', isSideEffect: true };
                    continue;
                }
            }
            survivingUserImports.splice(idx, 1);
            survivingImportInfos.splice(idx, 1);
            continue;
        }
        if (usedNamed.length < info.namedParts.length) {
            const namedStrs = usedNamed.map(np => np.imported !== np.local ? `${np.imported} as ${np.local}` : np.local);
            let importParts = '';
            const dp = defaultUsed ? info.defaultPart : '';
            if (namedStrs.length > 0) {
                importParts = dp
                    ? `${dp}, { ${namedStrs.join(', ')} }`
                    : `{ ${namedStrs.join(', ')} }`;
            }
            else if (dp) {
                importParts = dp;
            }
            if (importParts) {
                survivingUserImports[idx] = `import ${importParts} from ${info.quote}${info.source}${info.quote};`;
                survivingImportInfos[idx] = { ...info, namedParts: usedNamed, defaultPart: dp };
            }
            else {
                survivingUserImports.splice(idx, 1);
                survivingImportInfos.splice(idx, 1);
            }
        }
    }
}
/** Build preamble, insert .s() calls, apply migrations, strip TS types. */
function assembleOutput(ctx) {
    const { s, source, neededImports, survivingUserImports, jsxResult, inlineHoistedDeclarations, qrlDecls, sCalls, migrationDecisions, moduleLevelDecls, jsxOptions, transpileTs } = ctx;
    const importStatements = Array.from(neededImports.entries()).map(([symbol, src]) => `import { ${symbol} } from "${src}";`);
    const preamble = [];
    if (importStatements.length > 0)
        preamble.push(...importStatements);
    if (survivingUserImports.length > 0)
        preamble.push(...survivingUserImports);
    // Signal hoists go between first // separator and QRL declarations
    const allHoistedDecls = [];
    if (jsxResult && jsxResult.hoistedDeclarations.length > 0) {
        allHoistedDecls.push(...jsxResult.hoistedDeclarations);
    }
    if (inlineHoistedDeclarations.length > 0) {
        allHoistedDecls.push(...inlineHoistedDeclarations);
    }
    if (allHoistedDecls.length > 0) {
        preamble.push('//');
        preamble.push(...allHoistedDecls);
    }
    if (qrlDecls.length > 0) {
        preamble.push('//');
        preamble.push(...qrlDecls);
    }
    if (sCalls.length === 0) {
        preamble.push('//');
    }
    s.prepend(preamble.join('\n') + '\n');
    // _auto_ exports for module-level migration
    if (migrationDecisions) {
        for (const decision of migrationDecisions) {
            if (decision.action === 'reexport') {
                const decl = moduleLevelDecls?.find(d => d.name === decision.varName);
                if (decl?.isExported)
                    continue;
                s.append(`\nexport { ${decision.varName} as _auto_${decision.varName} };`);
            }
        }
    }
    // Remove migrated (moved) declarations from parent
    if (migrationDecisions && moduleLevelDecls) {
        const removedRanges = new Set();
        for (const decision of migrationDecisions) {
            if (decision.action !== 'move')
                continue;
            const decl = moduleLevelDecls.find((d) => d.name === decision.varName);
            if (!decl)
                continue;
            const rangeKey = `${decl.declStart}:${decl.declEnd}`;
            if (removedRanges.has(rangeKey))
                continue;
            removedRanges.add(rangeKey);
            let end = decl.declEnd;
            if (end < source.length && source[end] === '\n')
                end++;
            s.remove(decl.declStart, end);
        }
    }
    // Insert .s() calls just before the final QRL export
    let finalCode = s.toString();
    if (sCalls.length > 0) {
        const lines = finalCode.split('\n');
        let insertIdx = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
            const trimmed = lines[i].trimStart();
            if (trimmed.startsWith('export default ') || trimmed.startsWith('export const ') || trimmed.startsWith('export {')) {
                if (trimmed.includes('Qrl(') || trimmed.includes('export default ')) {
                    insertIdx = i;
                    break;
                }
            }
        }
        if (insertIdx >= 0) {
            lines.splice(insertIdx, 0, ...sCalls);
        }
        else {
            lines.push(...sCalls);
        }
        finalCode = lines.join('\n');
    }
    // TS type stripping
    if (transpileTs) {
        const tsStripOptions = { typescript: { onlyRemoveTypeImports: false } };
        if (!jsxOptions?.enableJsx) {
            tsStripOptions.jsx = 'preserve';
        }
        const stripped = oxcTransformSync('output.tsx', finalCode, tsStripOptions);
        if (stripped.code) {
            finalCode = stripped.code;
            finalCode = finalCode.replace(/\/\* @__PURE__ \*\//g, '/*#__PURE__*/');
            finalCode = finalCode.replace(/\b((?:export\s+)?)let\s+(\w+)\s*=\s*(\/\*[^*]*\*\/\s*)?function\s*\(\2\)/g, '$1var $2 = $3function($2)');
        }
    }
    return finalCode;
}
//# sourceMappingURL=rewrite-parent.js.map