import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { warn } from '../report';
import { addExperimentalFeature } from './vite-config';

const LABS = '@builder.io/qwik-labs';

const TARGETS: Record<string, string> = {
  Insights: '@qwik.dev/core/insights',
  InsightsError: '@qwik.dev/core/insights',
  InsightSymbol: '@qwik.dev/core/insights',
  InsightsPayload: '@qwik.dev/core/insights',
  qwikInsights: '@qwik.dev/core/insights/vite',
  InsightManifest: '@qwik.dev/core/insights/vite',
  // renamed to @qwik.dev/router later
  untypedAppUrl: '@builder.io/qwik-city',
  omitProps: '@builder.io/qwik-city',
};

const TYPES_ONLY = new Set(['InsightsError', 'InsightSymbol', 'InsightsPayload']);

/**
 * `@builder.io/qwik-labs` was removed in v2. Insights moved to `@qwik.dev/core/insights` behind the
 * `insights` experimental flag and the typed routes helpers moved to the router.
 */
export const migrateQwikLabs = (file: SourceFile) => {
  const decls = file
    .getImportDeclarations()
    .filter((d) => [LABS, `${LABS}/vite`].includes(d.getModuleSpecifierValue()));
  if (decls.length === 0) {
    return false;
  }
  let usesInsightsPlugin = false;
  for (const decl of decls) {
    const groups = new Map<string, string[]>();
    for (const named of decl.getNamedImports()) {
      const name = named.getName();
      const target = TARGETS[name];
      if (target) {
        groups.set(target, [...(groups.get(target) ?? []), named.getText()]);
        usesInsightsPlugin ||= name === 'qwikInsights';
        if (TYPES_ONLY.has(name) && !decl.isTypeOnly() && !named.isTypeOnly()) {
          warn(file.getFilePath(), `\`${name}\` is only a type in v2, the zod schema was removed.`);
        }
      } else if (name === 'qwikTypes') {
        removePluginCalls(file, named.getAliasNode()?.getText() ?? name);
        warn(
          file.getFilePath(),
          '`qwikTypes()` was removed in v2, typed routes are not generated.'
        );
      } else {
        warn(file.getFilePath(), `\`${name}\` from "${LABS}" has no replacement in v2.`);
      }
    }
    const typeOnly = decl.isTypeOnly() ? 'type ' : '';
    decl.replaceWithText(
      [...groups]
        .map(([target, names]) => `import ${typeOnly}{ ${names.join(', ')} } from '${target}';`)
        .join('\n')
    );
  }
  removeInsightsProps(file);
  if (usesInsightsPlugin) {
    addExperimentalFeature(file, 'insights');
  }
  return true;
};

/** Removes `name()` calls that are elements of an array, e.g. `plugins: [qwikTypes()]`. */
function removePluginCalls(file: SourceFile, name: string) {
  for (const call of file.getDescendantsOfKind(SyntaxKind.CallExpression).reverse()) {
    const array = call.getParent();
    if (call.getExpression().getText() === name && Node.isArrayLiteralExpression(array)) {
      array.removeElement(call);
    }
  }
}

/** V2 `<Insights />` takes its config from the `qwikInsights()` Vite plugin. */
function removeInsightsProps(file: SourceFile) {
  const insights = file
    .getImportDeclarations()
    .filter((d) => d.getModuleSpecifierValue() === '@qwik.dev/core/insights')
    .flatMap((d) => d.getNamedImports())
    .find((n) => n.getName() === 'Insights');
  if (!insights) {
    return;
  }
  const tagName = insights.getAliasNode()?.getText() ?? 'Insights';
  const elements = [
    ...file.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement),
    ...file.getDescendantsOfKind(SyntaxKind.JsxOpeningElement),
  ].filter((e) => e.getTagNameNode().getText() === tagName);
  for (const element of elements) {
    for (const attr of element.getAttributes()) {
      if (!Node.isJsxAttribute(attr)) {
        continue;
      }
      const name = attr.getNameNode().getText();
      if (name === 'postUrl') {
        warn(
          file.getFilePath(),
          '`<Insights postUrl>` was removed in v2, set `qwikInsights({ baseUrl })` so it posts to `${baseUrl}/api/v1/${publicApiKey}/post/`.'
        );
      }
      if (name === 'publicApiKey' || name === 'postUrl') {
        attr.remove();
      }
    }
  }
}
