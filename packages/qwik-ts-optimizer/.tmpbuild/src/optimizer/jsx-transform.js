/**
 * JSX element transformation module for the Qwik optimizer.
 *
 * Converts JSX syntax to _jsxSorted/_jsxSplit function calls with
 * correct prop classification (varProps/constProps), flags computation,
 * key generation, spread handling, and fragment support.
 */
import { createRegExp, exactly, oneOrMore, anyOf, digit, whitespace, charNotIn } from 'magic-regexp';
import { walk } from 'oxc-walker';
import { analyzeSignalExpression, SignalHoister } from './signal-analysis.js';
import { transformEventPropName, isEventProp, isPassiveDirective, collectPassiveDirectives } from './event-handler-transform.js';
import { isBindProp, transformBindProp, mergeEventHandlers } from './bind-transform.js';
import { detectLoopContext, buildQpProp } from './loop-hoisting.js';
import { computeKeyPrefix } from './key-prefix.js';
const jsxFlagTail = createRegExp(exactly(',').and(whitespace.times.any()).and(oneOrMore(digit).grouped())
    .and(',').and(whitespace.times.any())
    .and(anyOf(exactly('"').and(charNotIn('"').times.any()).and('"'), exactly('null')))
    .and(whitespace.times.any()).and(')').at.lineEnd());
const jsxSortedVarProps = createRegExp(exactly('_jsxSorted(').and(oneOrMore(charNotIn(','))).and(',').and(whitespace.times.any())
    .and(anyOf('{', 'null').grouped()));
/**
 * A const binding is "static" when its initializer is absent, or is a call
 * to a $-suffixed / Qrl-suffixed / use-prefixed function. Static bindings
 * are treated as immutable for prop classification.
 */
function isReturnStatic(init) {
    if (!init)
        return true;
    if (init.type === 'CallExpression' && init.callee) {
        const callee = init.callee;
        let calleeName;
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
export function collectConstIdents(program) {
    const constIdents = new Set();
    function visitNode(node) {
        if (!node || typeof node !== 'object')
            return;
        if (node.type === 'VariableDeclaration' && node.kind === 'const') {
            for (const decl of node.declarations || []) {
                collectFromDeclarator(decl);
            }
        }
        for (const key of Object.keys(node)) {
            if (key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                continue;
            const val = node[key];
            if (Array.isArray(val)) {
                for (const item of val)
                    visitNode(item);
            }
            else if (val && typeof val === 'object' && val.type) {
                visitNode(val);
            }
        }
    }
    function collectFromDeclarator(decl) {
        if (!decl)
            return;
        const id = decl.id || decl.name;
        const init = decl.init;
        if (!id)
            return;
        if (id.type === 'Identifier') {
            if (isReturnStatic(init)) {
                constIdents.add(id.name);
            }
        }
        else if (id.type === 'ArrayPattern') {
            for (const elem of id.elements || []) {
                if (elem && elem.type === 'Identifier' && isReturnStatic(init)) {
                    constIdents.add(elem.name);
                }
            }
        }
        else if (id.type === 'ObjectPattern') {
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
export function collectAllLocalNames(program) {
    const names = new Set();
    function addIdent(node) {
        if (!node)
            return;
        if (node.type === 'Identifier') {
            names.add(node.name);
        }
        else if (node.type === 'ArrayPattern') {
            for (const elem of node.elements || []) {
                if (elem)
                    addIdent(elem.type === 'RestElement' ? elem.argument : elem);
            }
        }
        else if (node.type === 'ObjectPattern') {
            for (const prop of node.properties || []) {
                if (prop.type === 'RestElement') {
                    addIdent(prop.argument);
                }
                else {
                    addIdent(prop.value || prop.key);
                }
            }
        }
        else if (node.type === 'AssignmentPattern') {
            addIdent(node.left);
        }
    }
    function visit(node) {
        if (!node || typeof node !== 'object')
            return;
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
        for (const key of Object.keys(node)) {
            if (key === 'start' || key === 'end' || key === 'loc' || key === 'range')
                continue;
            const val = node[key];
            if (Array.isArray(val)) {
                for (const item of val)
                    visit(item);
            }
            else if (val && typeof val === 'object' && val.type) {
                visit(val);
            }
        }
    }
    visit(program);
    return names;
}
/**
 * Determine if an expression is immutable (const) or mutable (var).
 * Mirrors SWC's `is_const_expr`.
 */
export function classifyProp(exprNode, importedNames, constIdents) {
    if (!exprNode)
        return 'const';
    switch (exprNode.type) {
        case 'StringLiteral':
        case 'Literal':
        case 'NumericLiteral':
        case 'BooleanLiteral':
        case 'NullLiteral':
            return 'const';
        case 'TemplateLiteral': {
            if (!exprNode.expressions || exprNode.expressions.length === 0)
                return 'const';
            for (const expr of exprNode.expressions) {
                if (classifyProp(expr, importedNames, constIdents) === 'var')
                    return 'var';
            }
            return 'const';
        }
        case 'Identifier': {
            const name = exprNode.name;
            if (name === 'undefined')
                return 'const';
            if (importedNames.has(name))
                return 'const';
            if (constIdents?.has(name))
                return 'const';
            return 'var';
        }
        // Member access on imports is const; on locals is var (locals can be reactive)
        case 'MemberExpression':
        case 'StaticMemberExpression':
        case 'ComputedMemberExpression': {
            const obj = exprNode.object;
            if (obj && obj.type === 'Identifier' && importedNames.has(obj.name))
                return 'const';
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
            if (!exprNode.properties)
                return 'const';
            for (const prop of exprNode.properties) {
                if (prop.type === 'SpreadElement') {
                    if (classifyProp(prop.argument, importedNames, constIdents) === 'var')
                        return 'var';
                }
                else if (prop.value) {
                    if (classifyProp(prop.value, importedNames, constIdents) === 'var')
                        return 'var';
                }
            }
            return 'const';
        }
        case 'ArrayExpression': {
            if (!exprNode.elements)
                return 'const';
            for (const el of exprNode.elements) {
                if (el === null)
                    continue;
                if (el.type === 'SpreadElement') {
                    if (classifyProp(el.argument, importedNames, constIdents) === 'var')
                        return 'var';
                }
                else {
                    if (classifyProp(el, importedNames, constIdents) === 'var')
                        return 'var';
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
                if (classifyProp(expr, importedNames, constIdents) === 'var')
                    return 'var';
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
export function computeFlags(hasVarProps, childrenType, inLoop = false, hasVarEventHandler = false) {
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
/**
 * Per-module counter for generating deterministic JSX element keys.
 * Keys follow the pattern "{prefix}_{N}" where prefix is derived from
 * the file path hash.
 */
export class JsxKeyCounter {
    count;
    prefix;
    constructor(startAt = 0, prefix = 'u6') {
        this.count = startAt;
        this.prefix = prefix;
    }
    next() {
        return `${this.prefix}_${this.count++}`;
    }
    current() {
        return this.count;
    }
    reset() {
        this.count = 0;
    }
}
export function isHtmlElement(tagName) {
    return tagName.length > 0 && tagName[0] === tagName[0].toLowerCase();
}
/** Text-only HTML elements whose children should NOT be signal-wrapped. */
const TEXT_ONLY_TAGS = new Set([
    'text', 'textarea', 'title', 'option', 'script', 'style', 'noscript',
]);
export function isTextOnlyElement(tagName) {
    return TEXT_ONLY_TAGS.has(tagName);
}
/**
 * Extract tag representation from a JSX opening element name node.
 *
 * - JSXIdentifier with lowercase -> `"div"` (string literal)
 * - JSXIdentifier with uppercase -> `Div` (identifier)
 * - JSXMemberExpression -> `Foo.Bar`
 * - JSXNamespacedName -> `"ns:name"`
 */
export function processJsxTag(nameNode) {
    if (!nameNode)
        return '"div"';
    switch (nameNode.type) {
        case 'JSXIdentifier': {
            const name = nameNode.name;
            return isHtmlElement(name) ? `"${name}"` : name;
        }
        case 'JSXMemberExpression': {
            const parts = [];
            let current = nameNode;
            while (current.type === 'JSXMemberExpression') {
                parts.unshift(current.property.name);
                current = current.object;
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
/** True for value nodes that are always const (literals, arrows, identifiers). */
function isConstValueNode(valueNode) {
    if (!valueNode)
        return true;
    switch (valueNode.type) {
        case 'ArrowFunctionExpression':
        case 'FunctionExpression':
        case 'Identifier':
        case 'Literal':
        case 'StringLiteral':
        case 'NumericLiteral':
        case 'BooleanLiteral':
        case 'NullLiteral':
            return true;
        default:
            return false;
    }
}
/** True for pre-rewritten event handler prop prefixes (q-e:, q-d:, q-w:, etc.). */
function isRewrittenEventProp(propName) {
    return propName.startsWith('q-e:') || propName.startsWith('q-d:') ||
        propName.startsWith('q-w:') || propName.startsWith('q-ep:') ||
        propName.startsWith('q-dp:') || propName.startsWith('q-wp:');
}
/** True if entry string starts with a rewritten event handler prefix. */
function isRewrittenEventEntry(entry) {
    return entry.startsWith('"q-e:') || entry.startsWith('"q-d:') ||
        entry.startsWith('"q-w:') || entry.startsWith('"q-ep:') ||
        entry.startsWith('"q-dp:') || entry.startsWith('"q-wp:');
}
/** Sort var entries alphabetically by prop key (SWC sorts var_props when no spread). */
function sortVarEntries(entries) {
    if (entries.length > 1) {
        entries.sort((a, b) => {
            const keyA = a.split(':')[0].replace(/"/g, '').trim();
            const keyB = b.split(':')[0].replace(/"/g, '').trim();
            return keyA.localeCompare(keyB);
        });
    }
}
function needsQuoting(name) {
    return /[^a-zA-Z0-9_$]/.test(name);
}
function formatPropName(name) {
    return needsQuoting(name) ? `"${name}"` : name;
}
/**
 * Normalize JSXText nodes following standard JSX whitespace rules.
 * Returns only meaningful children (non-empty text and non-text nodes).
 */
function normalizeJsxChildren(children) {
    const meaningful = [];
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.type !== 'JSXText') {
            meaningful.push(child);
            continue;
        }
        const raw = child.value ?? '';
        const hasNewline = raw.includes('\n');
        let normalized;
        if (hasNewline) {
            const lines = raw.split('\n');
            const trimmedLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);
            normalized = trimmedLines.join(' ');
        }
        else {
            // Preserve leading whitespace after expression containers
            const prevChild = i > 0 ? children[i - 1] : null;
            if (prevChild && prevChild.type === 'JSXExpressionContainer') {
                normalized = raw;
            }
            else {
                normalized = raw.replace(/^\s+/, '');
            }
            // Trim trailing if this is the last meaningful child
            const nextNonWhitespace = children.slice(i + 1).find((c) => c.type !== 'JSXText' || (c.value?.trim()));
            if (!nextNonWhitespace) {
                normalized = normalized.trimEnd();
            }
        }
        if (normalized) {
            meaningful.push({ ...child, _trimmedText: normalized });
            continue;
        }
        // Whitespace-only text: preserve as " " only when between two expression
        // containers on the same line. Multi-line whitespace is stripped.
        if (!hasNewline) {
            const prevSibling = meaningful.length > 0 ? meaningful[meaningful.length - 1] : null;
            const nextSibling = children.slice(i + 1).find((c) => c.type !== 'JSXText' || c.value?.trim());
            if (prevSibling && nextSibling &&
                prevSibling.type === 'JSXExpressionContainer' &&
                nextSibling.type === 'JSXExpressionContainer') {
                meaningful.push({ ...child, _trimmedText: ' ' });
            }
        }
    }
    return meaningful;
}
/**
 * Process JSX children nodes and return a children string representation.
 */
function processChildren(children, source, s, importedNames, signalHoister, neededImports, constIdents, allDeclaredNames) {
    if (!children || children.length === 0) {
        return { text: null, type: 'none' };
    }
    const meaningful = normalizeJsxChildren(children);
    if (meaningful.length === 0) {
        return { text: null, type: 'none' };
    }
    if (meaningful.length === 1) {
        return processOneChild(meaningful[0], source, s, importedNames, signalHoister, neededImports, constIdents, allDeclaredNames);
    }
    const parts = [];
    let isDynamic = false;
    for (const child of meaningful) {
        const { text, type } = processOneChild(child, source, s, importedNames, signalHoister, neededImports, constIdents, allDeclaredNames);
        if (text !== null) {
            parts.push(text);
        }
        if (type === 'dynamic')
            isDynamic = true;
    }
    return {
        text: `[${parts.join(', ')}]`,
        type: isDynamic ? 'dynamic' : 'static',
    };
}
/**
 * Check if a transformed JSX call's flag indicates a dynamic subtree.
 * Parses the trailing ", N, key)" pattern from _jsxSorted output.
 */
function hasStaticSubtreeFlag(transformedText) {
    const flagMatch = transformedText.match(jsxFlagTail);
    if (!flagMatch)
        return true;
    const flag = parseInt(flagMatch[1], 10);
    return (flag & 2) !== 0;
}
/**
 * Classify a nested JSX element/fragment child as static or dynamic.
 * SWC propagates dynamic status upward through the JSX tree.
 */
function classifyNestedJsxChild(child, childText) {
    if (child.type === 'JSXFragment') {
        return hasStaticSubtreeFlag(childText) ? 'static' : 'dynamic';
    }
    // Component tags (uppercase) are always dynamic
    const tagName = child.openingElement?.name;
    const tagStr = tagName?.type === 'JSXIdentifier' ? tagName.name : '';
    const isComponent = tagStr.length > 0 && tagStr[0] === tagStr[0].toUpperCase() && tagStr[0] !== tagStr[0].toLowerCase();
    if (isComponent)
        return 'dynamic';
    // HTML elements: dynamic if they have varProps or a dynamic subtree flag
    const varPropsMatch = childText.match(jsxSortedVarProps);
    if (varPropsMatch && varPropsMatch[1] === '{')
        return 'dynamic';
    return hasStaticSubtreeFlag(childText) ? 'static' : 'dynamic';
}
function processOneChild(child, source, s, importedNames, signalHoister, neededImports, constIdents, allDeclaredNames) {
    if (child._trimmedText) {
        return { text: `"${child._trimmedText}"`, type: 'static' };
    }
    if (child.type === 'JSXText') {
        const trimmed = child.value?.trim();
        if (!trimmed)
            return { text: null, type: 'none' };
        return { text: `"${trimmed}"`, type: 'static' };
    }
    if (child.type === 'JSXExpressionContainer') {
        return processExpressionChild(child, source, s, importedNames, signalHoister, neededImports, constIdents, allDeclaredNames);
    }
    if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
        const childText = s ? s.slice(child.start, child.end) : source.slice(child.start, child.end);
        const type = classifyNestedJsxChild(child, childText);
        return { text: childText, type };
    }
    return { text: null, type: 'none' };
}
/** Process a JSX expression container child ({expr}). */
function processExpressionChild(child, source, s, importedNames, signalHoister, neededImports, constIdents, allDeclaredNames) {
    const expr = child.expression;
    if (!expr || expr.type === 'JSXEmptyExpression') {
        return { text: null, type: 'none' };
    }
    const exprText = s ? s.slice(expr.start, expr.end) : source.slice(expr.start, expr.end);
    if (expr.type === 'StringLiteral' ||
        expr.type === 'NumericLiteral' ||
        expr.type === 'BooleanLiteral' ||
        (expr.type === 'Literal' &&
            (typeof expr.value === 'string' ||
                typeof expr.value === 'number' ||
                typeof expr.value === 'boolean'))) {
        return { text: exprText, type: 'static' };
    }
    if (importedNames && signalHoister) {
        const signalResult = analyzeSignalExpression(expr, source, importedNames, allDeclaredNames);
        if (signalResult.type === 'wrapProp') {
            neededImports?.add('_wrapProp');
            // _wrapProp children are static only when the signal/store target is const-bound
            let wrapIsConst = true;
            if (expr.type === 'MemberExpression' && expr.object?.type === 'Identifier') {
                const objName = expr.object.name;
                if (!importedNames.has(objName) && !(constIdents?.has(objName))) {
                    wrapIsConst = false;
                }
            }
            return { text: signalResult.code, type: wrapIsConst ? 'static' : 'dynamic' };
        }
        if (signalResult.type === 'fnSignal') {
            const hfName = signalHoister.hoist(signalResult.hoistedFn, signalResult.hoistedStr, expr.start ?? 0);
            const fnSignalCall = `_fnSignal(${hfName}, [${signalResult.deps.join(', ')}], ${hfName}_str)`;
            neededImports?.add('_fnSignal');
            const depsConst = signalResult.deps.every(dep => importedNames.has(dep) || (constIdents?.has(dep) ?? false));
            return { text: fnSignalCall, type: depsConst ? 'static' : 'dynamic' };
        }
    }
    if (importedNames) {
        const propClass = classifyProp(expr, importedNames, constIdents);
        if (propClass === 'const') {
            return { text: exprText, type: 'static' };
        }
    }
    return { text: exprText, type: 'dynamic' };
}
/**
 * Process JSX attributes and classify them into varProps and constProps.
 */
function processProps(attributes, source, importedNames, tagIsHtml, passiveEvents, signalHoister, inLoop, qrlsWithCaptures, _paramNames, constIdents, allDeclaredNames, skipSignalAnalysis) {
    const varEntries = [];
    const constEntries = [];
    const beforeSpreadEntries = [];
    const neededImports = new Set();
    let key = null;
    let hasSpread = false;
    let hasVarEventHandler = false;
    const bindHandlers = new Map();
    if (!attributes || attributes.length === 0) {
        return { varEntries, constEntries, beforeSpreadEntries, key, hasVarProps: false, hasVarEventHandler: false, hasSpread, additionalSpreads: [], neededImports };
    }
    const hasSpreadAttr = attributes.some(a => a.type === 'JSXSpreadAttribute');
    const spreadIndex = attributes.findIndex(a => a.type === 'JSXSpreadAttribute');
    const additionalSpreads = [];
    let spreadCount = 0;
    for (let attrIdx = 0; attrIdx < attributes.length; attrIdx++) {
        const attr = attributes[attrIdx];
        const beforeSpread = hasSpreadAttr && attrIdx < spreadIndex;
        if (attr.type === 'JSXSpreadAttribute') {
            hasSpread = true;
            spreadCount++;
            if (spreadCount > 1) {
                additionalSpreads.push(source.slice(attr.argument.start, attr.argument.end));
            }
            continue;
        }
        if (attr.type !== 'JSXAttribute')
            continue;
        let propName;
        if (attr.name?.type === 'JSXNamespacedName') {
            propName = `${attr.name.namespace.name}:${attr.name.name.name}`;
        }
        else {
            propName = attr.name?.name;
        }
        if (!propName)
            continue;
        if (propName === 'className' && tagIsHtml) {
            propName = 'class';
        }
        if (propName === 'key') {
            if (attr.value) {
                if (attr.value.type === 'JSXExpressionContainer') {
                    key = source.slice(attr.value.expression.start, attr.value.expression.end);
                }
                else if (attr.value.type === 'StringLiteral' || attr.value.type === 'Literal') {
                    key = `"${attr.value.value}"`;
                }
            }
            continue;
        }
        if (isPassiveDirective(propName))
            continue;
        if (propName.startsWith('preventdefault:')) {
            // Only emit when no matching passive:EVENT on the same element
            const eventName = propName.slice('preventdefault:'.length);
            if (!passiveEvents.has(eventName)) {
                constEntries.push(`"${propName}": true`);
            }
            continue;
        }
        let valueText;
        let valueNode;
        if (attr.value === null || attr.value === undefined) {
            valueText = 'true';
            valueNode = null;
        }
        else if (attr.value.type === 'JSXExpressionContainer') {
            valueNode = attr.value.expression;
            valueText = source.slice(valueNode.start, valueNode.end);
        }
        else {
            valueNode = attr.value;
            valueText = source.slice(attr.value.start, attr.value.end);
        }
        // Bind desugaring: component tags keep bind: as-is for _jsxSplit
        if (isBindProp(propName) && !tagIsHtml) {
            constEntries.push(`"${propName}": ${valueText}`);
            continue;
        }
        if (isBindProp(propName) && !hasSpreadAttr) {
            const bindResult = transformBindProp(propName, valueText);
            constEntries.push(`"${bindResult.propName}": ${bindResult.propValue}`);
            if (bindResult.handler) {
                const existing = bindHandlers.get(bindResult.handler.name);
                if (existing) {
                    bindHandlers.set(bindResult.handler.name, `[${existing}, ${bindResult.handler.code}]`);
                }
                else {
                    bindHandlers.set(bindResult.handler.name, bindResult.handler.code);
                }
            }
            for (const imp of bindResult.needsImport) {
                neededImports.add(imp);
            }
            continue;
        }
        if (isBindProp(propName) && hasSpreadAttr) {
            varEntries.push(`"${propName}": ${valueText}`);
            continue;
        }
        if (isEventProp(propName) && tagIsHtml) {
            const renamedProp = transformEventPropName(propName, passiveEvents);
            if (renamedProp !== null) {
                const formattedName = formatPropName(renamedProp);
                if (isConstValueNode(valueNode)) {
                    constEntries.push(`${formattedName}: ${valueText}`);
                }
                else {
                    varEntries.push(`${formattedName}: ${valueText}`);
                    hasVarEventHandler = true;
                }
                continue;
            }
        }
        // QRL prop passthrough ($-suffixed props not already handled as events)
        if (propName.endsWith('$') && !isRewrittenEventProp(propName)) {
            const formattedName = formatPropName(propName);
            if (isConstValueNode(valueNode)) {
                constEntries.push(`${formattedName}: ${valueText}`);
            }
            else {
                varEntries.push(`${formattedName}: ${valueText}`);
            }
            continue;
        }
        // Pre-rewritten event props from extraction rewriting
        if (isRewrittenEventProp(propName)) {
            const formattedName = `"${propName}"`;
            if (inLoop) {
                if (qrlsWithCaptures) {
                    const qrlName = valueText.trim();
                    if (qrlsWithCaptures.has(qrlName)) {
                        varEntries.push(`${formattedName}: ${valueText}`);
                    }
                    else {
                        constEntries.push(`${formattedName}: ${valueText}`);
                    }
                }
                else {
                    varEntries.push(`${formattedName}: ${valueText}`);
                }
            }
            else {
                // Outside loop: track for merging with bind handlers
                const existing = bindHandlers.get(propName);
                if (existing) {
                    bindHandlers.set(propName, `[${existing}, ${valueText}]`);
                }
                else {
                    bindHandlers.set(propName, valueText);
                }
            }
            continue;
        }
        // Signal analysis (skipped for _createElement path)
        if (valueNode && !skipSignalAnalysis) {
            const signalResult = analyzeSignalExpression(valueNode, source, importedNames, allDeclaredNames);
            if (signalResult.type === 'wrapProp') {
                const formattedName = formatPropName(propName);
                if (signalResult.isStoreField && tagIsHtml) {
                    const objName = signalResult.code.match(/_wrapProp\((\w+)/)?.[1];
                    const isConst = objName ? (importedNames.has(objName) || (constIdents?.has(objName) ?? false)) : false;
                    (isConst ? constEntries : varEntries).push(`${formattedName}: ${signalResult.code}`);
                }
                else {
                    constEntries.push(`${formattedName}: ${signalResult.code}`);
                }
                neededImports.add('_wrapProp');
                continue;
            }
            if (signalResult.type === 'fnSignal') {
                // SWC skips _fnSignal for object expressions on class/className props
                if (signalResult.isObjectExpr && (propName === 'class' || propName === 'className')) {
                    // Fall through to classifyProp
                }
                else {
                    const hfName = signalHoister.hoist(signalResult.hoistedFn, signalResult.hoistedStr, valueNode.start ?? 0);
                    const fnSignalCall = `_fnSignal(${hfName}, [${signalResult.deps.join(', ')}], ${hfName}_str)`;
                    const formattedName = formatPropName(propName);
                    const depsAllConst = signalResult.deps.every(dep => importedNames.has(dep) || (constIdents?.has(dep) ?? false));
                    if (depsAllConst && !inLoop) {
                        constEntries.push(`${formattedName}: ${fnSignalCall}`);
                    }
                    else {
                        varEntries.push(`${formattedName}: ${fnSignalCall}`);
                    }
                    neededImports.add('_fnSignal');
                    continue;
                }
            }
        }
        // Default: classify by expression constness
        const classification = valueNode
            ? classifyProp(valueNode, importedNames, constIdents)
            : 'const';
        const entry = `${formatPropName(propName)}: ${valueText}`;
        if (beforeSpread) {
            beforeSpreadEntries.push(entry);
        }
        else if (classification === 'var') {
            varEntries.push(entry);
        }
        else {
            constEntries.push(entry);
        }
    }
    if (!hasSpread) {
        sortVarEntries(varEntries);
    }
    // Merge bind handlers into their target bucket
    const hasBindEntries = varEntries.some(e => e.startsWith('"bind:'));
    const eventTarget = (hasSpread && tagIsHtml && !hasBindEntries) ? varEntries : constEntries;
    for (const [eventName, handlerCode] of bindHandlers) {
        const quotedEventName = `"${eventName}"`;
        const existingIdx = constEntries.findIndex((e) => e.startsWith(`${quotedEventName}: `));
        if (existingIdx >= 0) {
            const existingEntry = constEntries[existingIdx];
            const existingValue = existingEntry.slice(quotedEventName.length + 2);
            constEntries[existingIdx] = `${quotedEventName}: ${mergeEventHandlers(existingValue, handlerCode)}`;
        }
        else {
            eventTarget.push(`${quotedEventName}: ${handlerCode}`);
        }
    }
    return {
        varEntries,
        constEntries,
        beforeSpreadEntries,
        additionalSpreads,
        key,
        hasVarProps: varEntries.length > 0 || beforeSpreadEntries.length > 0,
        hasVarEventHandler,
        hasSpread,
        neededImports,
    };
}
/**
 * Inject q:p/q:ps prop for capture context on HTML elements.
 * Mutates varEntries in place.
 */
function injectQpProp(node, tagIsHtml, inLoop, loopCtx, qpOverrides, varEntries, constEntries) {
    if (!tagIsHtml)
        return;
    const overrideParams = qpOverrides?.get(node.start);
    if (overrideParams && overrideParams.length > 0) {
        const qpResult = buildQpProp(overrideParams, true);
        if (qpResult) {
            varEntries.push(`${formatPropName(qpResult.propName)}: ${qpResult.propValue}`);
        }
        return;
    }
    if (!inLoop || qpOverrides)
        return;
    // Fall back to iterVars-based q:p for elements with event handlers in loops
    const hasEventHandlers = varEntries.some(e => isRewrittenEventEntry(e) || e.startsWith('"host:'))
        || constEntries.some(e => isRewrittenEventEntry(e) || e.startsWith('"host:'));
    if (!hasEventHandlers)
        return;
    const qpResult = buildQpProp(loopCtx.iterVars);
    if (qpResult) {
        varEntries.push(`${formatPropName(qpResult.propName)}: ${qpResult.propValue}`);
    }
}
/**
 * Move event handlers from constEntries to varEntries when q:ps captures
 * include non-static-const vars. Mutates both arrays in place.
 */
function moveEventHandlersForNonConstCaptures(node, tagIsHtml, inLoop, qpOverrides, constIdents, importedNames, varEntries, constEntries, hasSpread) {
    if (!tagIsHtml || inLoop)
        return false;
    const overrideParams = qpOverrides?.get(node.start);
    if (!overrideParams || overrideParams.length === 0)
        return false;
    const hasNonConstParam = overrideParams.some(p => !constIdents?.has(p) && !importedNames.has(p));
    if (!hasNonConstParam)
        return false;
    let movedAny = false;
    for (let i = constEntries.length - 1; i >= 0; i--) {
        if (isRewrittenEventEntry(constEntries[i])) {
            varEntries.push(constEntries[i]);
            constEntries.splice(i, 1);
            movedAny = true;
        }
    }
    if (movedAny && !hasSpread) {
        sortVarEntries(varEntries);
    }
    return movedAny;
}
/** Build a _createElement call for spread + explicit key. */
function buildCreateElementCall(tag, spreadArg, beforeSpreadEntries, varEntries, constEntries, explicitKey, childrenText, neededImports) {
    neededImports.add('createElement as _createElement');
    const allPropEntries = [...beforeSpreadEntries, ...varEntries, ...constEntries];
    allPropEntries.push(`key: ${explicitKey}`);
    const propsObj = `{ ...${spreadArg}, ${allPropEntries.join(', ')} }`;
    const callString = `_createElement(${tag}, ${propsObj})`;
    return {
        tag,
        varProps: null,
        constProps: null,
        children: childrenText,
        flags: 0,
        key: explicitKey,
        callString,
        neededImports,
    };
}
/** Build a _jsxSplit call for spread without explicit key. */
function buildJsxSplitCall(tag, tagIsHtml, spreadArg, beforeSpreadEntries, varEntries, constEntries, additionalSpreads, childrenText, flags, keyStr, neededImports) {
    neededImports.add('_jsxSplit');
    neededImports.add('_getVarProps');
    neededImports.add('_getConstProps');
    const beforePart = beforeSpreadEntries.length > 0 ? `${beforeSpreadEntries.join(', ')}, ` : '';
    const afterPart = varEntries.length > 0 ? `, ${varEntries.join(', ')}` : '';
    const additionalSpreadsPart = additionalSpreads.length > 0
        ? `, ${additionalSpreads.map((s) => s === spreadArg ? `..._getVarProps(${s})` : `...${s}`).join(', ')}`
        : '';
    let varPropsPart;
    let constPropsPart;
    // Component elements with extras merge everything into varProps
    const componentHasExtras = !tagIsHtml && (constEntries.length > 0 || varEntries.length > 0 ||
        beforeSpreadEntries.length > 0 || additionalSpreads.length > 0);
    if (componentHasExtras) {
        const constPart = constEntries.length > 0 ? `, ${constEntries.join(', ')}` : '';
        varPropsPart = `{ ${beforePart}..._getVarProps(${spreadArg}), ..._getConstProps(${spreadArg})${afterPart}${constPart}${additionalSpreadsPart} }`;
        constPropsPart = 'null';
    }
    else {
        // HTML elements keep _getConstProps in constProps unless merge is needed
        const hasNonBindNonEventVarEntries = varEntries.some(e => !e.startsWith('"bind:') && !isRewrittenEventEntry(e) &&
            !e.startsWith('"q:p') && !e.startsWith('"q:ps'));
        const shouldMergeConst = (varEntries.length > 0 && constEntries.length > 0) || hasNonBindNonEventVarEntries;
        if (shouldMergeConst) {
            varPropsPart = `{ ${beforePart}..._getVarProps(${spreadArg}), ..._getConstProps(${spreadArg})${afterPart}${additionalSpreadsPart} }`;
            const hasDuplicateSpreads = additionalSpreads.some(s => s === spreadArg);
            constPropsPart = constEntries.length > 0
                ? `{ ${constEntries.join(', ')} }`
                : hasDuplicateSpreads ? `_getConstProps(${spreadArg})` : 'null';
        }
        else {
            varPropsPart = `{ ${beforePart}..._getVarProps(${spreadArg})${afterPart}${additionalSpreadsPart} }`;
            constPropsPart = constEntries.length > 0
                ? `{ ..._getConstProps(${spreadArg}), ${constEntries.join(', ')} }`
                : `_getConstProps(${spreadArg})`;
        }
    }
    const callString = `_jsxSplit(${tag}, ${varPropsPart}, ${constPropsPart}, ${childrenText ?? 'null'}, ${flags}, ${keyStr ?? 'null'})`;
    return {
        tag,
        varProps: varPropsPart,
        constProps: constPropsPart,
        children: childrenText,
        flags,
        key: keyStr,
        callString,
        neededImports,
    };
}
/**
 * Transform a single JSX element node to a _jsxSorted/_jsxSplit/_createElement call.
 */
export function transformJsxElement(node, source, s, importedNames, keyCounter, passiveEvents, signalHoister, loopCtx, isSoleChild, enableChildSignals = true, qpOverrides, qrlsWithCaptures, paramNames, constIdents, allDeclaredNames) {
    if (node.type !== 'JSXElement')
        return null;
    const neededImports = new Set();
    const openingElement = node.openingElement;
    const tag = processJsxTag(openingElement.name);
    const tagIsHtml = tag.startsWith('"') && tag.length > 2 &&
        tag[1] === tag[1].toLowerCase() && tag[1] >= 'a' && tag[1] <= 'z';
    const rawTagName = tagIsHtml ? tag.slice(1, -1) : '';
    const textOnly = tagIsHtml && isTextOnlyElement(rawTagName);
    const elementPassiveEvents = passiveEvents ?? collectPassiveDirectives(openingElement.attributes);
    const hoister = signalHoister ?? new SignalHoister();
    const inLoop = !!loopCtx && loopCtx.iterVars.length > 0;
    // Pre-detect _createElement path (spread + explicit key skips signal analysis)
    const preHasSpread = openingElement.attributes?.some((a) => a.type === 'JSXSpreadAttribute') ?? false;
    const preHasKey = openingElement.attributes?.some((a) => a.type === 'JSXAttribute' &&
        ((a.name?.type === 'JSXIdentifier' && a.name.name === 'key') ||
            (a.name?.type === 'JSXNamespacedName' && a.name.name?.name === 'key'))) ?? false;
    const willUseCreateElement = preHasSpread && preHasKey;
    const { varEntries, constEntries, beforeSpreadEntries, additionalSpreads, key: explicitKey, hasVarProps, hasVarEventHandler: initialHasVarEventHandler, hasSpread, neededImports: propImports, } = processProps(openingElement.attributes, source, importedNames, tagIsHtml, elementPassiveEvents, hoister, inLoop, qrlsWithCaptures, paramNames, constIdents, allDeclaredNames, willUseCreateElement);
    let hasVarEventHandler = initialHasVarEventHandler;
    for (const imp of propImports) {
        neededImports.add(imp);
    }
    // Inject q:p/q:ps for capture context
    injectQpProp(node, tagIsHtml, inLoop, loopCtx, qpOverrides, varEntries, constEntries);
    // Move event handlers to varProps when captures include non-const vars
    if (moveEventHandlersForNonConstCaptures(node, tagIsHtml, inLoop, qpOverrides, constIdents, importedNames, varEntries, constEntries, hasSpread)) {
        hasVarEventHandler = true;
    }
    // Children: text-only elements and disabled signals skip _wrapProp/_fnSignal
    const childSignalsEnabled = enableChildSignals && !textOnly;
    const { text: childrenText, type: childrenType } = processChildren(node.children, source, s, childSignalsEnabled ? importedNames : undefined, childSignalsEnabled ? hoister : undefined, neededImports, constIdents, allDeclaredNames);
    // Compute flags
    const hasQpProp = varEntries.some(e => e.startsWith('"q:p"') || e.startsWith('"q:ps"'))
        || constEntries.some(e => e.startsWith('"q:p"') || e.startsWith('"q:ps"'));
    const effectiveLoopCtx = tagIsHtml && (qpOverrides ? hasQpProp : (!!loopCtx && hasQpProp));
    const effectiveHasVarProps = varEntries.length > 0 || beforeSpreadEntries.length > 0;
    const isRealLoop = !!loopCtx && loopCtx.iterVars.length > 0;
    const isCaptureOnly = effectiveLoopCtx && !isRealLoop;
    let flags;
    if (hasSpread) {
        const hasQpEntry = varEntries.some(e => e.startsWith('"q:p"') || e.startsWith('"q:p":') || e.startsWith('"q:ps"') || e.startsWith('"q:ps":'));
        flags = hasQpEntry ? 4 : 0;
    }
    else if (isCaptureOnly) {
        // Non-loop capture: base flags + capture bit
        flags = computeFlags(hasVarProps, childrenType, false, hasVarEventHandler) | 4;
    }
    else {
        flags = computeFlags(effectiveHasVarProps, childrenType, effectiveLoopCtx, hasVarEventHandler);
    }
    // Key: explicit > null for child HTML elements > generated
    let keyStr;
    if (explicitKey !== null) {
        keyStr = explicitKey;
    }
    else if (isSoleChild && tagIsHtml) {
        keyStr = null;
    }
    else {
        keyStr = `"${keyCounter.next()}"`;
    }
    // Build the final call
    if (hasSpread) {
        const spreadAttr = openingElement.attributes.find((a) => a.type === 'JSXSpreadAttribute');
        const spreadArg = spreadAttr
            ? source.slice(spreadAttr.argument.start, spreadAttr.argument.end)
            : 'props';
        if (explicitKey !== null) {
            return buildCreateElementCall(tag, spreadArg, beforeSpreadEntries, varEntries, constEntries, explicitKey, childrenText, neededImports);
        }
        return buildJsxSplitCall(tag, tagIsHtml, spreadArg, beforeSpreadEntries, varEntries, constEntries, additionalSpreads, childrenText, flags, keyStr, neededImports);
    }
    // Dynamic component tags with bind: props use _jsxSplit
    const hasBindInConst = !tagIsHtml && constEntries.some(e => e.startsWith('"bind:'));
    const varProps = varEntries.length > 0 ? `{ ${varEntries.join(', ')} }` : null;
    const constProps = constEntries.length > 0 ? `{ ${constEntries.join(', ')} }` : null;
    const jsxFn = hasBindInConst ? '_jsxSplit' : '_jsxSorted';
    neededImports.add(jsxFn);
    const callString = `${jsxFn}(${tag}, ${varProps ?? 'null'}, ${constProps ?? 'null'}, ${childrenText ?? 'null'}, ${flags}, ${keyStr ?? 'null'})`;
    return {
        tag,
        varProps,
        constProps,
        children: childrenText,
        flags,
        key: keyStr,
        callString,
        neededImports,
    };
}
export function transformJsxFragment(node, source, s, importedNames, keyCounter, _isSoleChild, constIdents, signalHoister, allDeclaredNames) {
    if (node.type !== 'JSXFragment')
        return null;
    const neededImports = new Set();
    neededImports.add('_jsxSorted');
    const { text: childrenText, type: childrenType } = processChildren(node.children, source, s, importedNames, signalHoister, neededImports, constIdents, allDeclaredNames);
    const flags = computeFlags(false, childrenType);
    // Fragments always get generated keys (even as children)
    const keyStr = `"${keyCounter.next()}"`;
    const callString = `_jsxSorted(_Fragment, null, null, ${childrenText ?? 'null'}, ${flags}, ${keyStr})`;
    return {
        tag: '_Fragment',
        varProps: null,
        constProps: null,
        children: childrenText,
        flags,
        key: keyStr,
        callString,
        neededImports,
    };
}
function isInSkipRange(nodeStart, nodeEnd, skipRanges) {
    for (const range of skipRanges) {
        if (nodeStart >= range.start && nodeEnd <= range.end)
            return true;
    }
    return false;
}
/**
 * Apply two-phase rename (old -> temp -> new) to avoid collisions when
 * renumbering _hf variables to match SWC's top-down source order.
 */
function applySignalHoistRenames(s, renameMap) {
    const content = s.toString();
    let renamed = content;
    // Phase 1: old names -> temporary placeholders
    const tempMap = new Map();
    for (const [oldName, newName] of renameMap) {
        const temp = `__hf_temp_${oldName.slice(3)}__`;
        tempMap.set(temp, newName);
        renamed = renamed.split(`${oldName}_str`).join(`${temp}_str`);
        renamed = renamed.split(oldName).join(temp);
    }
    // Phase 2: temporary placeholders -> new names
    for (const [temp, newName] of tempMap) {
        renamed = renamed.split(`${temp}_str`).join(`${newName}_str`);
        renamed = renamed.split(temp).join(newName);
    }
    if (renamed !== content) {
        s.overwrite(0, s.original.length, renamed);
    }
}
/** Append dev source location info to a JSX call string. */
function appendDevSuffix(callString, devSuffix) {
    if (!devSuffix)
        return callString;
    return callString.slice(0, -1) + devSuffix + ')';
}
/**
 * Walk the AST bottom-up and transform all JSX nodes.
 * Uses leave callback to ensure inner JSX is transformed before outer JSX.
 */
export function transformAllJsx(source, s, program, importedNames, skipRanges, devOptions, keyCounterStart, enableSignals = true, qpOverrides, qrlsWithCaptures, paramNames, relPath, sharedSignalHoister, constIdents) {
    const resolvedConstIdents = constIdents ?? collectConstIdents(program);
    const allDeclaredNames = collectAllLocalNames(program);
    const prefix = relPath ? computeKeyPrefix(relPath) : 'u6';
    const keyCounter = new JsxKeyCounter(keyCounterStart ?? 0, prefix);
    const signalHoister = sharedSignalHoister ?? new SignalHoister();
    const neededImports = new Set();
    let needsFragment = false;
    const ranges = skipRanges ?? [];
    // Precompute line starts for dev mode offset->line/col lookup
    let lineStarts = null;
    if (devOptions) {
        lineStarts = [0];
        for (let i = 0; i < source.length; i++) {
            if (source[i] === '\n')
                lineStarts.push(i + 1);
        }
    }
    function getDevSourceSuffix(nodeStart) {
        if (!devOptions || !lineStarts)
            return '';
        let lo = 0, hi = lineStarts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (lineStarts[mid] <= nodeStart)
                lo = mid;
            else
                hi = mid - 1;
        }
        const lineNumber = lo + 1;
        const columnNumber = nodeStart - lineStarts[lo] + 1;
        return `, {\n    fileName: "${devOptions.relPath}",\n    lineNumber: ${lineNumber},\n    columnNumber: ${columnNumber}\n}`;
    }
    const loopStack = [];
    const childJsxNodes = new WeakSet();
    walk(program, {
        enter(node) {
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
        leave(node) {
            if (loopStack.length > 0 && loopStack[loopStack.length - 1].loopNode === node) {
                loopStack.pop();
            }
            if (ranges.length > 0 && isInSkipRange(node.start, node.end, ranges))
                return;
            const currentLoop = loopStack.length > 0 ? loopStack[loopStack.length - 1] : null;
            if (node.type === 'JSXElement') {
                const passiveEvents = collectPassiveDirectives(node.openingElement?.attributes ?? []);
                const isSoleChild = childJsxNodes.has(node);
                const result = transformJsxElement(node, source, s, importedNames, keyCounter, passiveEvents, signalHoister, currentLoop, isSoleChild, enableSignals, qpOverrides, qrlsWithCaptures, paramNames, resolvedConstIdents, allDeclaredNames);
                if (result) {
                    const callStr = appendDevSuffix(result.callString, getDevSourceSuffix(node.start));
                    s.overwrite(node.start, node.end, `/*#__PURE__*/ ${callStr}`);
                    for (const imp of result.neededImports)
                        neededImports.add(imp);
                }
            }
            else if (node.type === 'JSXFragment') {
                const isChildFragment = childJsxNodes.has(node);
                const result = transformJsxFragment(node, source, s, importedNames, keyCounter, isChildFragment, resolvedConstIdents, signalHoister, allDeclaredNames);
                if (result) {
                    const callStr = appendDevSuffix(result.callString, getDevSourceSuffix(node.start));
                    s.overwrite(node.start, node.end, `/*#__PURE__*/ ${callStr}`);
                    for (const imp of result.neededImports)
                        neededImports.add(imp);
                    needsFragment = true;
                }
            }
        },
    });
    // Renumber _hf variables to match SWC's top-down source order
    const renameMap = signalHoister.buildRenameMap();
    if (renameMap && renameMap.size > 0) {
        applySignalHoistRenames(s, renameMap);
    }
    const hoistedDeclarations = signalHoister.getDeclarations();
    return { neededImports, needsFragment, hoistedDeclarations, keyCounterValue: keyCounter.current() };
}
//# sourceMappingURL=jsx-transform.js.map