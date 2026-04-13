/**
 * Capture analysis module for the Qwik optimizer.
 *
 * Detects variables that cross $() boundaries -- variables referenced
 * inside a $() closure but declared in an enclosing scope. These become
 * the `captureNames` array in segment metadata, used for _captures injection.
 */
import { getUndeclaredIdentifiersInFunction } from 'oxc-walker';
/**
 * Analyze a $() closure node to determine which variables cross the
 * serialization boundary. Excludes globals and import bindings.
 */
export function analyzeCaptures(closureNode, parentScopeIdentifiers, importedNames) {
    const paramNames = collectParamNames(closureNode.params ?? []);
    const undeclared = getUndeclaredIdentifiersInFunction(closureNode);
    const captureNames = [...new Set(undeclared
            .filter((name) => parentScopeIdentifiers.has(name) && !importedNames.has(name))
            .sort())];
    return {
        captureNames,
        captures: captureNames.length > 0,
        paramNames,
    };
}
/** Extract all binding names from function parameter AST nodes. */
export function collectParamNames(params) {
    const names = [];
    for (const param of params) {
        collectBindingNamesFromPattern(param, names);
    }
    return names;
}
function collectBindingNamesFromPattern(node, names) {
    if (!node)
        return;
    switch (node.type) {
        case 'Identifier':
            names.push(node.name);
            break;
        case 'ObjectPattern':
            for (const prop of node.properties ?? []) {
                const target = prop.type === 'RestElement' ? prop.argument : prop.value;
                collectBindingNamesFromPattern(target, names);
            }
            break;
        case 'ArrayPattern':
            for (const elem of node.elements ?? []) {
                collectBindingNamesFromPattern(elem, names);
            }
            break;
        case 'RestElement':
            collectBindingNamesFromPattern(node.argument, names);
            break;
        case 'AssignmentPattern':
            collectBindingNamesFromPattern(node.left, names);
            break;
        default:
            if (node.parameter) {
                collectBindingNamesFromPattern(node.parameter, names);
            }
            break;
    }
}
/**
 * Collect all identifiers declared in a container scope (function body or program).
 */
export function collectScopeIdentifiers(containerNode, _source, _relPath) {
    const ids = new Set();
    collectDeclarationsFromNode(containerNode, ids);
    return ids;
}
function collectDeclarationsFromNode(node, ids) {
    if (!node)
        return;
    if (node.type === 'VariableDeclaration') {
        for (const decl of node.declarations ?? []) {
            if (decl.id)
                collectBindingNamesFromPatternToSet(decl.id, ids);
        }
        return;
    }
    if (node.type === 'FunctionDeclaration' && node.id?.type === 'Identifier') {
        ids.add(node.id.name);
        return;
    }
    if (node.type === 'BlockStatement' || node.type === 'Program') {
        for (const stmt of node.body ?? []) {
            collectDeclarationsFromNode(stmt, ids);
        }
        return;
    }
    const isFunctionNode = node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'FunctionDeclaration';
    if (isFunctionNode) {
        for (const param of node.params ?? []) {
            collectBindingNamesFromPatternToSet(param, ids);
        }
        if (node.body)
            collectDeclarationsFromNode(node.body, ids);
    }
}
/** Same as collectBindingNamesFromPattern but collects into a Set. */
function collectBindingNamesFromPatternToSet(node, names) {
    if (!node)
        return;
    switch (node.type) {
        case 'Identifier':
            names.add(node.name);
            break;
        case 'ObjectPattern':
            for (const prop of node.properties ?? []) {
                const target = prop.type === 'RestElement' ? prop.argument : prop.value;
                collectBindingNamesFromPatternToSet(target, names);
            }
            break;
        case 'ArrayPattern':
            for (const elem of node.elements ?? []) {
                collectBindingNamesFromPatternToSet(elem, names);
            }
            break;
        case 'RestElement':
            collectBindingNamesFromPatternToSet(node.argument, names);
            break;
        case 'AssignmentPattern':
            collectBindingNamesFromPatternToSet(node.left, names);
            break;
        default:
            if (node.parameter) {
                collectBindingNamesFromPatternToSet(node.parameter, names);
            }
            break;
    }
}
//# sourceMappingURL=capture-analysis.js.map