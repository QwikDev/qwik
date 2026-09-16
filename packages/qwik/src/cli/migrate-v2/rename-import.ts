import { Node, type SourceFile, ts } from 'ts-morph';
import type { Codemod } from './codemods/run-codemods';
import { isReference } from './codemods/utils';

/**
 * Renames the imports of `library` (and its subpaths) in a file. Usages are only renamed when the
 * import is not aliased, and only in files that import the name from `library`.
 */
export function renameImports(
  sourceFile: SourceFile,
  changes: [oldImport: string, newImport: string][],
  library: string
): boolean {
  const renames = new Map<string, string>();
  let changed = false;

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    // startsWith is used in order to handle nested imports
    if (!importDeclaration.getModuleSpecifierValue().startsWith(library)) {
      continue;
    }
    for (const [oldImport, newImport] of changes) {
      for (const namedImport of importDeclaration.getNamedImports()) {
        if (namedImport.getName() === oldImport) {
          namedImport.setName(newImport);
          changed = true;
          if (!namedImport.getAliasNode()) {
            renames.set(oldImport, newImport);
          }
        }
      }
      const defaultImport = importDeclaration.getDefaultImport();
      if (defaultImport?.getText() === oldImport) {
        renames.set(oldImport, newImport);
      }
    }
  }

  for (const identifier of sourceFile.getDescendantsOfKind(ts.SyntaxKind.Identifier)) {
    if (identifier.wasForgotten()) {
      continue;
    }
    const newName = renames.get(identifier.getText());
    if (!newName || !isReference(identifier)) {
      continue;
    }
    const parent = identifier.getParent();
    if (Node.isShorthandPropertyAssignment(parent)) {
      // keep the property key: `{ oldName }` -> `{ oldName: newName }`
      parent.replaceWithText(`${identifier.getText()}: ${newName}`);
    } else {
      identifier.replaceWithText(newName);
    }
    changed = true;
  }
  return changed;
}

/** Renames of the exports that v2 renamed, run after the codemods that match the v1 names. */
export const importRenames: Codemod[] = [
  (file) =>
    renameImports(
      file,
      [
        ['QwikCityProvider', 'QwikRouterProvider'],
        ['qwikCity', 'qwikRouter'],
        ['QwikCityVitePluginOptions', 'QwikRouterVitePluginOptions'],
        ['QwikCityPlugin', 'QwikRouterPlugin'],
        ['createQwikCity', 'createQwikRouter'],
        ['QwikCityNodeRequestOptions', 'QwikRouterNodeRequestOptions'],
        ['QwikCityAwsLambdaOptions', 'QwikRouterAwsLambdaOptions'],
        ['QwikCityAzureOptions', 'QwikRouterAzureOptions'],
        ['QwikCityBunOptions', 'QwikRouterBunOptions'],
        ['QwikCityCloudflarePagesOptions', 'QwikRouterCloudflarePagesOptions'],
        ['QwikCityDenoOptions', 'QwikRouterDenoOptions'],
        ['QwikCityFirebaseOptions', 'QwikRouterFirebaseOptions'],
        ['QwikCityNetlifyOptions', 'QwikRouterNetlifyOptions'],
        ['QwikCityVercelEdgeOptions', 'QwikRouterVercelEdgeOptions'],
        ['QwikCityProps', 'QwikRouterProps'],
        ['QwikCityPlan', 'QwikRouterConfig'],
        ['QwikCityMockProvider', 'QwikRouterMockProvider'],
        ['QwikCityMockProps', 'QwikRouterMockProps'],
        ['QwikCityMockActionProp', 'QwikRouterMockActionProp'],
        ['QwikCityMockLoaderProp', 'QwikRouterMockLoaderProp'],
        ['staticAdapter', 'ssgAdapter'],
        ['StaticGenerateAdapterOptions', 'SsgAdapterOptions'],
        ['StaticGenerateRenderOptions', 'SsgRenderOptions'],
        ['StaticGenerateOptions', 'SsgOptions'],
      ],
      '@builder.io/qwik-city'
    ),
  (file) =>
    renameImports(
      file,
      [
        ['qwikRollup', 'qwikRolldown'],
        ['QwikRollupPluginOptions', 'QwikRolldownPluginOptions'],
      ],
      '@builder.io/qwik/optimizer'
    ),
  (file) => renameImports(file, [['qwikCityPlan', 'qwikRouterConfig']], '@qwik-city-plan'),
];
