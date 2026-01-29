import type {
  ArrayLiteralExpression,
  Block,
  CallExpression,
  Expression,
  Identifier,
  ImportSpecifier,
  NamedImports,
  ObjectLiteralExpression,
  SourceFile,
  Statement,
  TransformerFactory,
} from 'typescript';
import type { EnsureImport, ViteConfigUpdates } from '../types';

export function updateViteConfig(ts: TypeScript, sourceText: string, updates?: ViteConfigUpdates) {
  if (
    !updates?.imports &&
    !updates?.qwikViteConfig &&
    !updates?.viteConfig &&
    !updates?.vitePlugins &&
    !updates?.vitePluginsPrepend
  ) {
    return null;
  }

  sourceText = transformSource(ts, sourceText, () => (tsSourceFile) => {
    if (updates.imports) {
      for (const importData of updates.imports) {
        tsSourceFile = ensureImport(ts, tsSourceFile, importData);
      }
    }

    const statements: Statement[] = [];

    for (const s of tsSourceFile.statements) {
      if (ts.isExportAssignment(s) && s.expression && ts.isCallExpression(s.expression)) {
        if (
          ts.isIdentifier(s.expression.expression) &&
          s.expression.expression.text === 'defineConfig' &&
          (updates.viteConfig ||
            updates.qwikViteConfig ||
            updates.vitePlugins ||
            updates.vitePluginsPrepend)
        ) {
          statements.push(
            ts.factory.updateExportAssignment(
              s,
              s.modifiers,
              updateDefineConfig(ts, s.expression, updates)
            )
          );
          continue;
        }
      }
      statements.push(s);
    }

    return ts.factory.updateSourceFile(tsSourceFile, statements);
  });

  return sourceText;
}

function ensureImport(ts: TypeScript, tsSourceFile: SourceFile, importData: EnsureImport) {
  if (importData && importData.importPath) {
    if (Array.isArray(importData.namedImports)) {
      importData.namedImports.forEach((namedImport) => {
        tsSourceFile = ensureNamedImport(ts, tsSourceFile, namedImport, importData.importPath);
      });
    }
    if (typeof importData.defaultImport === 'string') {
      tsSourceFile = ensureDefaultImport(
        ts,
        tsSourceFile,
        importData.defaultImport,
        importData.importPath
      );
    }
  }
  return tsSourceFile;
}

function ensureNamedImport(
  ts: TypeScript,
  tsSourceFile: SourceFile,
  namedImport: string,
  importPath: string
) {
  if (!hasNamedImport(ts, tsSourceFile, namedImport, importPath)) {
    tsSourceFile = appendImports(ts, tsSourceFile, null, namedImport, importPath);
  }
  return tsSourceFile;
}

function ensureDefaultImport(
  ts: TypeScript,
  tsSourceFile: SourceFile,
  defaultImport: string,
  importPath: string
) {
  if (!hasDefaultImport(ts, tsSourceFile, importPath)) {
    tsSourceFile = appendImports(ts, tsSourceFile, defaultImport, null, importPath);
  }
  return tsSourceFile;
}

function hasNamedImport(
  ts: TypeScript,
  tsSourceFile: SourceFile,
  namedImport: string,
  importPath: string
) {
  return !!findNamedImport(ts, tsSourceFile, namedImport, importPath);
}

function hasDefaultImport(ts: TypeScript, tsSourceFile: SourceFile, importPath: string) {
  return !!findDefaultImport(ts, tsSourceFile, importPath);
}

function findNamedImport(
  ts: TypeScript,
  tsSourceFile: SourceFile,
  namedImport: string,
  importPath: string
) {
  return findImportDeclarations(ts, tsSourceFile).find((n) => {
    if (n.importClause && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      if (n.moduleSpecifier.text !== importPath) {
        return false;
      }
      const namedImports = n.importClause.namedBindings;
      if (namedImports && ts.isNamedImports(namedImports) && namedImports.elements) {
        return namedImports.elements.some((namedImportElement) => {
          if (ts.isImportSpecifier(namedImportElement)) {
            const importName = namedImportElement.name;
            if (importName && ts.isIdentifier(importName)) {
              return importName.text === namedImport;
            }
          }
          return false;
        });
      }
    }
    return false;
  });
}

function findDefaultImport(
  ts: TypeScript,
  tsSourceFile: SourceFile,

  importPath: string
) {
  return findImportDeclarations(ts, tsSourceFile).find((n) => {
    if (n.importClause && n.moduleSpecifier) {
      const modulePath = n.moduleSpecifier;
      if (ts.isStringLiteral(modulePath) && modulePath.text === importPath) {
        const moduleDefault = n.importClause.name;
        if (moduleDefault && moduleDefault.text === importPath) {
          return true;
        }
      }
    }
    return false;
  });
}

function findImportDeclarations(ts: TypeScript, tsSourceFile: SourceFile) {
  return tsSourceFile.statements.filter(ts.isImportDeclaration);
}

function appendImports(
  ts: TypeScript,
  tsSourceFile: SourceFile,
  defaultImport: string | null,
  namedImport: string | null,
  importPath: string
) {
  const statements = tsSourceFile.statements.slice();
  let foundExistingImport = false;

  for (let i = statements.length - 1; i >= 0; i--) {
    const n = statements[i];
    if (!ts.isImportDeclaration(n)) {
      continue;
    }

    if (!n.moduleSpecifier || !ts.isStringLiteral(n.moduleSpecifier)) {
      continue;
    }

    if (n.moduleSpecifier.text !== importPath) {
      continue;
    }

    foundExistingImport = true;

    const existingNamedImports: ImportSpecifier[] = [];
    if (n.importClause) {
      const namedImports = n.importClause.namedBindings;
      if (namedImports && ts.isNamedImports(namedImports) && namedImports.elements) {
        existingNamedImports.push(...namedImports.elements);
      }
    }

    if (typeof namedImport === 'string') {
      const identifier = ts.factory.createIdentifier(namedImport);
      const importSpecifier = ts.factory.createImportSpecifier(false, undefined, identifier);
      existingNamedImports.push(importSpecifier);
    }

    existingNamedImports.sort((a, b) => {
      const aName = a.name.escapedText.toString();
      const bName = b.name.escapedText.toString();
      return aName < bName ? -1 : 1;
    });

    let defaultIdentifier = n.importClause ? n.importClause.name : undefined;
    if (typeof defaultImport === 'string') {
      defaultIdentifier = ts.factory.createIdentifier(defaultImport);
    }

    let namedBindings: NamedImports = undefined as any;
    if (existingNamedImports.length > 0) {
      namedBindings = ts.factory.createNamedImports(existingNamedImports);
    }

    statements[i] = ts.factory.updateImportDeclaration(
      n,
      undefined,
      ts.factory.createImportClause(false, defaultIdentifier, namedBindings),
      n.moduleSpecifier,
      undefined
    );
  }

  if (!foundExistingImport) {
    let defaultIdentifier: Identifier = undefined as any;
    let namedBindings: NamedImports = undefined as any;

    if (typeof defaultImport === 'string') {
      defaultIdentifier = ts.factory.createIdentifier(defaultImport);
    }

    if (typeof namedImport === 'string') {
      namedBindings = ts.factory.createNamedImports([
        ts.factory.createImportSpecifier(
          false,
          undefined,
          ts.factory.createIdentifier(namedImport)
        ),
      ]);
    }

    const newNamedImport = ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(false, defaultIdentifier, namedBindings),
      ts.factory.createStringLiteral(importPath)
    );
    const lastImportIndex = findLastImportIndex(ts, tsSourceFile);
    statements.splice(lastImportIndex + 1, 0, newNamedImport);
  }

  return ts.factory.updateSourceFile(tsSourceFile, statements);
}

function findLastImportIndex(ts: TypeScript, tsSourceFile: SourceFile) {
  for (let i = tsSourceFile.statements.length - 1; i >= 0; i--) {
    const s = tsSourceFile.statements[i];
    if (ts.isImportDeclaration(s)) {
      return i;
    }
    if (ts.isStringLiteral(s) && s.text === 'use strict') {
      return i;
    }
  }
  return 0;
}

function updateDefineConfig(ts: TypeScript, callExp: CallExpression, updates: ViteConfigUpdates) {
  const args: Expression[] = [];

  for (let i = 0; i < callExp.arguments.length; i++) {
    const exp = callExp.arguments[i];

    if (i === 0) {
      if (ts.isArrowFunction(exp) && ts.isBlock(exp.body)) {
        args.push(
          ts.factory.updateArrowFunction(
            exp,
            exp.modifiers,
            exp.typeParameters,
            exp.parameters,
            exp.type,
            exp.equalsGreaterThanToken,
            updateDefineConfigFnReturn(ts, exp.body, updates)
          )
        );
        continue;
      }

      if (ts.isFunctionExpression(exp) && ts.isBlock(exp.body)) {
        args.push(
          ts.factory.updateFunctionExpression(
            exp,
            exp.modifiers,
            exp.asteriskToken,
            exp.name,
            exp.typeParameters,
            exp.parameters,
            exp.type,
            updateDefineConfigFnReturn(ts, exp.body, updates)
          )
        );
        continue;
      }

      if (ts.isObjectLiteralExpression(exp)) {
        args.push(updateVitConfigObj(ts, exp, updates));
        continue;
      }
    }

    args.push(exp);
  }

  return ts.factory.updateCallExpression(callExp, callExp.expression, callExp.typeArguments, args);
}

function updateDefineConfigFnReturn(ts: TypeScript, fnBody: Block, updates: ViteConfigUpdates) {
  const statements: Statement[] = [];
  for (const s of fnBody.statements) {
    if (ts.isReturnStatement(s) && s.expression && ts.isObjectLiteralExpression(s.expression)) {
      statements.push(
        ts.factory.updateReturnStatement(s, updateVitConfigObj(ts, s.expression, updates))
      );
    } else {
      statements.push(s);
    }
  }
  return ts.factory.updateBlock(fnBody, statements);
}

function updateVitConfigObj(
  ts: TypeScript,
  obj: ObjectLiteralExpression,
  updates: ViteConfigUpdates
) {
  if (updates.viteConfig) {
    obj = updateObjectLiteralExpression(ts, obj, updates.viteConfig);
  }
  if (updates.vitePlugins || updates.vitePluginsPrepend || updates.qwikViteConfig) {
    obj = updatePlugins(ts, obj, updates);
  }
  return obj;
}

function updatePlugins(ts: TypeScript, obj: ObjectLiteralExpression, updates: ViteConfigUpdates) {
  const properties: any[] = [];

  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p)) {
      if (p.name && ts.isIdentifier(p.name) && p.name.text === 'plugins') {
        if (ts.isArrayLiteralExpression(p.initializer)) {
          properties.push(
            ts.factory.updatePropertyAssignment(
              p,
              p.name,
              updatePluginsArray(ts, p.initializer, updates)
            )
          );
          continue;
        }
      }
    }
    properties.push(p);
  }

  return ts.factory.updateObjectLiteralExpression(obj, properties);
}

function updatePluginsArray(
  ts: TypeScript,
  arr: ArrayLiteralExpression,
  updates: ViteConfigUpdates
) {
  const elms: Expression[] = [...arr.elements];

  if (updates.vitePlugins) {
    for (const vitePlugin of updates.vitePlugins) {
      const pluginExp = createPluginCall(ts, vitePlugin);
      const pluginName = (pluginExp?.expression as Identifier | null)?.escapedText;
      const alreadyDefined = elms.some(
        (el) =>
          ts.isCallExpression(el) &&
          ts.isIdentifier(el.expression) &&
          el.expression.escapedText === pluginName
      );
      if (pluginExp && !alreadyDefined) {
        elms.push(pluginExp);
      }
    }
  }

  if (updates.vitePluginsPrepend) {
    for (const vitePlugin of updates.vitePluginsPrepend) {
      const pluginExp = createPluginCall(ts, vitePlugin);
      const pluginName = (pluginExp?.expression as Identifier | null)?.escapedText;
      const alreadyDefined = elms.some(
        (el) =>
          ts.isCallExpression(el) &&
          ts.isIdentifier(el.expression) &&
          el.expression.escapedText === pluginName
      );
      if (pluginExp && !alreadyDefined) {
        elms.unshift(pluginExp);
      }
    }
  }

  if (updates.qwikViteConfig) {
    for (let i = 0; i < elms.length; i++) {
      const elm = elms[i];
      if (ts.isCallExpression(elm) && ts.isIdentifier(elm.expression)) {
        if (elm.expression.escapedText === 'qwikVite') {
          elms[i] = updateQwikCityPlugin(ts, elm, updates.qwikViteConfig);
        }
      }
    }
  }

  return ts.factory.updateArrayLiteralExpression(arr, elms);
}

function createPluginCall(ts: TypeScript, vitePlugin: string): CallExpression | null {
  if (typeof vitePlugin === 'string') {
    const tmp = ts.createSourceFile(
      'tmp.ts',
      'export default ' + vitePlugin,
      ts.ScriptTarget.Latest
    );
    for (const s of tmp.statements) {
      if (ts.isExportAssignment(s)) {
        return s.expression as CallExpression;
      }
    }
  }
  return null;
}

function updateQwikCityPlugin(
  ts: TypeScript,
  callExp: CallExpression,
  qwikViteConfig: { [key: string]: string }
) {
  const args = callExp.arguments.slice();

  const config =
    args[0] && ts.isObjectLiteralExpression(args[0])
      ? args[0]
      : ts.factory.createObjectLiteralExpression();

  args[0] = updateObjectLiteralExpression(ts, config, qwikViteConfig);

  return ts.factory.updateCallExpression(callExp, callExp.expression, callExp.typeArguments, args);
}

function updateObjectLiteralExpression(
  ts: TypeScript,
  obj: ObjectLiteralExpression,
  updateObj: { [propName: string]: string }
) {
  for (const [propName, value] of Object.entries(updateObj)) {
    if (typeof value === 'string') {
      const tmp = ts.createSourceFile('tmp.ts', 'export default ' + value, ts.ScriptTarget.Latest);

      for (const s of tmp.statements) {
        if (ts.isExportAssignment(s)) {
          const exp = s.expression;
          let added = false;
          const properties: any[] = [];
          for (const p of obj.properties) {
            if (p.name && ts.isIdentifier(p.name) && p.name.text === propName) {
              properties.push(ts.factory.createPropertyAssignment(propName, exp));
              added = true;
            } else {
              properties.push(p);
            }
          }
          if (!added) {
            properties.unshift(ts.factory.createPropertyAssignment(propName, exp));
          }

          obj = ts.factory.updateObjectLiteralExpression(obj, properties);
        }
      }
    }
  }
  return obj;
}

function transformSource(ts: TypeScript, sourceText: string, transformer: TransformerFactory<any>) {
  const t = ts.transform(ts.createSourceFile('/tmp.ts', sourceText, ts.ScriptTarget.Latest), [
    transformer,
  ]);

  const p = ts.createPrinter({
    removeComments: false,
    omitTrailingSemicolon: false,
    noEmitHelpers: true,
  });

  return p.printFile(t.transformed[0]);
}

type TypeScript = typeof import('typescript');
