/**
 * Const replacement module for the Qwik optimizer.
 *
 * Replaces isServer/isBrowser/isDev identifiers imported from Qwik packages
 * with boolean literals based on build configuration.
 */
import { walk } from 'oxc-walker';
const CONST_SOURCES = [
    '@qwik.dev/core',
    '@qwik.dev/core/build',
    '@builder.io/qwik',
    '@builder.io/qwik/build',
    '@builder.io/qwik-city/build',
];
function isConstSource(source) {
    return CONST_SOURCES.includes(source);
}
/**
 * Replace isServer/isBrowser/isDev identifiers with boolean literals.
 * Only replaces identifiers that trace to actual Qwik package imports.
 * After replacement, removes the corresponding import bindings.
 */
export function replaceConstants(source, s, program, importMap, isServer, isDev) {
    const replacements = new Map();
    for (const [localName, info] of importMap) {
        if (!isConstSource(info.source))
            continue;
        const { importedName } = info;
        if (isServer !== undefined) {
            if (importedName === 'isServer')
                replacements.set(localName, String(isServer));
            else if (importedName === 'isBrowser')
                replacements.set(localName, String(!isServer));
        }
        if (isDev !== undefined && importedName === 'isDev') {
            replacements.set(localName, String(isDev));
        }
    }
    if (replacements.size === 0) {
        return { replacedCount: 0 };
    }
    let replacedCount = 0;
    const replacedLocalNames = new Set();
    // Collect import specifier positions to skip during walk
    const importRanges = new Set();
    for (const node of program.body) {
        if (node.type === 'ImportDeclaration') {
            for (const spec of node.specifiers) {
                importRanges.add(`${spec.local.start}:${spec.local.end}`);
            }
        }
    }
    walk(program, {
        enter(node, parent) {
            if (node.type !== 'Identifier')
                return;
            const replacement = replacements.get(node.name);
            if (replacement === undefined)
                return;
            if (importRanges.has(`${node.start}:${node.end}`))
                return;
            if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed)
                return;
            if (parent?.type === 'VariableDeclarator' && parent.id === node)
                return;
            if (parent?.type === 'ImportSpecifier' && parent.imported === node)
                return;
            s.overwrite(node.start, node.end, replacement);
            replacedCount++;
            replacedLocalNames.add(node.name);
        },
    });
    if (replacedLocalNames.size > 0) {
        removeReplacedImports(source, s, program, replacedLocalNames);
    }
    return { replacedCount };
}
/** Remove import specifiers for replaced constants, or the whole import if all were replaced. */
function removeReplacedImports(source, s, program, replacedNames) {
    for (const node of program.body) {
        if (node.type !== 'ImportDeclaration')
            continue;
        const specifiers = node.specifiers;
        if (!specifiers || specifiers.length === 0)
            continue;
        const removedIndices = new Set();
        for (let i = 0; i < specifiers.length; i++) {
            if (replacedNames.has(specifiers[i].local.name))
                removedIndices.add(i);
        }
        if (removedIndices.size === 0)
            continue;
        let end = node.end;
        if (end < source.length && source[end] === '\n')
            end++;
        if (removedIndices.size === specifiers.length) {
            s.overwrite(node.start, end, '');
            continue;
        }
        // Partial removal: rebuild the import statement with remaining specifiers
        let defaultPart = '';
        const namedParts = [];
        for (let i = 0; i < specifiers.length; i++) {
            if (removedIndices.has(i))
                continue;
            const spec = specifiers[i];
            if (spec.type === 'ImportDefaultSpecifier') {
                defaultPart = spec.local.name;
            }
            else if (spec.type === 'ImportNamespaceSpecifier') {
                defaultPart = `* as ${spec.local.name}`;
            }
            else {
                const localName = spec.local.name;
                const importedName = spec.imported?.name ?? localName;
                namedParts.push(importedName !== localName ? `${importedName} as ${localName}` : localName);
            }
        }
        const importParts = namedParts.length > 0
            ? defaultPart
                ? `${defaultPart}, { ${namedParts.join(', ')} }`
                : `{ ${namedParts.join(', ')} }`
            : defaultPart;
        const sourceSlice = source.slice(node.source.start, node.source.end);
        s.overwrite(node.start, end, `import ${importParts} from ${sourceSlice};\n`);
    }
}
//# sourceMappingURL=const-replacement.js.map