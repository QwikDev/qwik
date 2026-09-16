import { Node, SyntaxKind, type ObjectLiteralExpression, type SourceFile } from 'ts-morph';
import { warn } from '../report';
import { appendProperty, findCalls, findNamedImports } from './utils';

const qwikViteCalls = (file: SourceFile) =>
  findCalls(file, findNamedImports(file, '@builder.io/qwik/optimizer', 'qwikVite'));

const qwikViteOptions = (file: SourceFile) =>
  qwikViteCalls(file)
    .map((call) => call.getArguments()[0])
    .filter((arg): arg is ObjectLiteralExpression => Node.isObjectLiteralExpression(arg));

/** Returns the object literal value of `obj[name]`, if it is one. */
export const objectProperty = (obj: ObjectLiteralExpression, name: string) => {
  const prop = obj.getProperty(name);
  const value = Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
  return Node.isObjectLiteralExpression(value) ? value : undefined;
};

/** `client.devInput` was removed, v2 renders the dev server through `ssr.input`. */
export const removeDevInput = (file: SourceFile) => {
  let changed = false;
  for (const options of qwikViteOptions(file)) {
    const devInput = objectProperty(options, 'client')?.getProperty('devInput');
    if (devInput) {
      devInput.remove();
      changed = true;
    }
  }
  return changed;
};

const REMOVED_EXPERIMENTAL = new Set(['preventNavigate', 'enableRequestRewrite']);

/** `preventNavigate` and `enableRequestRewrite` are always enabled in v2. */
export const removeStableExperimentalFeatures = (file: SourceFile) => {
  let changed = false;
  for (const options of qwikViteOptions(file)) {
    const prop = options.getProperty('experimental');
    const value = Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
    if (!Node.isArrayLiteralExpression(value)) {
      continue;
    }
    const removed = value
      .getElements()
      .filter((e) => Node.isStringLiteral(e) && REMOVED_EXPERIMENTAL.has(e.getLiteralValue()));
    if (removed.length === 0) {
      continue;
    }
    if (removed.length === value.getElements().length) {
      prop!.remove();
    } else {
      removed.reverse().forEach((e) => value.removeElement(e));
    }
    changed = true;
  }
  return changed;
};

/**
 * V1 placed the client build under Vite's `base` (`dist/<base>`), v2 always uses `dist`. Setting
 * `client.outDir` keeps the v1 output layout.
 */
export const keepBaseOutDir = (file: SourceFile) => {
  const calls = qwikViteCalls(file);
  if (calls.length !== 1) {
    return false;
  }
  const bases = file
    .getDescendantsOfKind(SyntaxKind.PropertyAssignment)
    .filter((p) => p.getName() === 'base');
  if (bases.length === 0) {
    return false;
  }
  const value = bases.length === 1 ? bases[0].getInitializer() : undefined;
  if (!Node.isStringLiteral(value) && !Node.isNoSubstitutionTemplateLiteral(value)) {
    warn(
      file.getFilePath(),
      "v2 no longer puts the client build under Vite's `base`, set `qwikVite({ client: { outDir } })` to keep the output directory."
    );
    return false;
  }
  const base = value.getLiteralValue().replace(/^\/+|\/+$/g, '');
  if (!base) {
    return false;
  }
  const call = calls[0];
  const options = call.getArguments()[0];
  if (!options) {
    call.addArgument(`{ client: { outDir: 'dist/${base}' } }`);
    return true;
  }
  if (!Node.isObjectLiteralExpression(options)) {
    return false;
  }
  const client = objectProperty(options, 'client');
  if (!client) {
    appendProperty(options, `client: { outDir: 'dist/${base}' }`);
    return true;
  }
  const outDir = client.getProperty('outDir');
  const outDirValue = Node.isPropertyAssignment(outDir) ? outDir.getInitializer() : undefined;
  if (!outDir) {
    appendProperty(client, `outDir: 'dist/${base}'`);
    return true;
  }
  if (Node.isStringLiteral(outDirValue)) {
    outDirValue.setLiteralValue(`${outDirValue.getLiteralValue().replace(/\/+$/, '')}/${base}`);
    return true;
  }
  return false;
};
