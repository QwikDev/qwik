/**
 * Strip exports module for the Qwik optimizer.
 *
 * When the `stripExports` option specifies export names, their bodies are
 * replaced with a throw statement. Imports that become unused after stripping
 * are removed.
 */
const STRIP_THROW_MSG = 'Symbol removed by Qwik Optimizer, it can not be called from current platform';
/**
 * Replace specified exports with throw statements and remove unused imports.
 */
export function stripExportDeclarations(source, s, program, stripExports, importMap) {
    if (stripExports.length === 0) {
        return { strippedNames: [] };
    }
    const stripSet = new Set(stripExports);
    const strippedNames = [];
    const strippedRanges = [];
    for (const node of program.body) {
        if (node.type !== 'ExportNamedDeclaration')
            continue;
        const decl = node.declaration;
        if (!decl)
            continue;
        if (decl.type === 'VariableDeclaration') {
            for (const declarator of decl.declarations) {
                if (declarator.id?.type !== 'Identifier')
                    continue;
                const name = declarator.id.name;
                if (!stripSet.has(name))
                    continue;
                if (declarator.init) {
                    const throwBody = `()=>{\n    throw "${STRIP_THROW_MSG}";\n}`;
                    s.overwrite(declarator.init.start, declarator.init.end, throwBody);
                    strippedNames.push(name);
                    strippedRanges.push({ start: declarator.init.start, end: declarator.init.end });
                }
            }
        }
        else if (decl.type === 'FunctionDeclaration') {
            if (decl.id?.type !== 'Identifier')
                continue;
            const name = decl.id.name;
            if (!stripSet.has(name))
                continue;
            const throwBody = `const ${name} = ()=>{\n    throw "${STRIP_THROW_MSG}";\n}`;
            s.overwrite(decl.start, decl.end, throwBody);
            strippedNames.push(name);
            strippedRanges.push({ start: decl.start, end: decl.end });
        }
    }
    if (strippedNames.length === 0) {
        return { strippedNames: [] };
    }
    removeUnusedImports(source, s, program, strippedRanges, importMap);
    return { strippedNames };
}
/**
 * Remove import specifiers that are no longer referenced after stripping.
 */
function removeUnusedImports(source, s, program, strippedRanges, importMap) {
    const usedNames = new Set();
    const importDeclarationRanges = [];
    for (const node of program.body) {
        if (node.type === 'ImportDeclaration') {
            importDeclarationRanges.push({ start: node.start, end: node.end });
        }
    }
    const excludeRanges = [...strippedRanges, ...importDeclarationRanges].sort((a, b) => a.start - b.start);
    let liveCode = '';
    let pos = 0;
    for (const range of excludeRanges) {
        if (pos < range.start) {
            liveCode += source.slice(pos, range.start);
        }
        pos = range.end;
    }
    if (pos < source.length) {
        liveCode += source.slice(pos);
    }
    for (const [localName] of importMap) {
        const pattern = new RegExp(`\\b${escapeRegex(localName)}\\b`);
        if (pattern.test(liveCode)) {
            usedNames.add(localName);
        }
    }
    for (const node of program.body) {
        if (node.type !== 'ImportDeclaration')
            continue;
        const specifiers = node.specifiers;
        if (!specifiers || specifiers.length === 0)
            continue;
        const unusedIndices = [];
        for (let i = 0; i < specifiers.length; i++) {
            const localName = specifiers[i].local.name;
            if (!usedNames.has(localName)) {
                unusedIndices.push(i);
            }
        }
        if (unusedIndices.length === 0)
            continue;
        if (unusedIndices.length === specifiers.length) {
            let end = node.end;
            if (end < source.length && source[end] === '\n')
                end++;
            s.overwrite(node.start, end, '');
            continue;
        }
        // Partial removal: rebuild import without unused specifiers
        const unusedSet = new Set(unusedIndices);
        const sourceNode = node.source;
        let defaultPart = '';
        const namedParts = [];
        for (let i = 0; i < specifiers.length; i++) {
            if (unusedSet.has(i))
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
        let importClause = '';
        if (namedParts.length > 0) {
            importClause = defaultPart
                ? `${defaultPart}, { ${namedParts.join(', ')} }`
                : `{ ${namedParts.join(', ')} }`;
        }
        else if (defaultPart) {
            importClause = defaultPart;
        }
        const newImport = `import ${importClause} from ${source.slice(sourceNode.start, sourceNode.end)};`;
        let end = node.end;
        if (end < source.length && source[end] === '\n')
            end++;
        s.overwrite(node.start, end, newImport + '\n');
    }
}
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=strip-exports.js.map