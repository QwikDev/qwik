import { Node, SyntaxKind, type SourceFile } from 'ts-morph';
import { warn } from '../report';
import { findCalls, findNamedImports } from './utils';

const CORE = '@builder.io/qwik';

/**
 * The deprecated `eagerness` task option was removed in v2. In v1 `useTask$(fn, { eagerness })`
 * also re-ran the task in the browser on that event, which v2 can't express with a single task.
 */
export const removeTaskEagerness = (file: SourceFile) => {
  let changed = false;
  const hooks = ['useTask$', 'useVisibleTask$'].flatMap((name) =>
    findNamedImports(file, CORE, name)
  );
  for (const call of findCalls(file, hooks)) {
    const options = call.getArguments()[1];
    const eagerness = Node.isObjectLiteralExpression(options)
      ? options.getProperty('eagerness')
      : undefined;
    if (!eagerness || !Node.isObjectLiteralExpression(options)) {
      continue;
    }
    warn(
      file.getFilePath(),
      `\`${call.getExpression().getText()}\` option \`eagerness\` was removed in v2, the task no longer re-runs in the browser on that event. Add a \`useVisibleTask$\` if you need it.`
    );
    if (options.getProperties().length === 1) {
      call.removeArgument(options);
    } else {
      eagerness.remove();
    }
    changed = true;
  }
  return changed;
};

/** Whether calling the function may return a value, e.g. a promise. */
const mayReturnValue = (fn: Node) => {
  if (!Node.isArrowFunction(fn) && !Node.isFunctionExpression(fn)) {
    return false;
  }
  if (fn.isAsync()) {
    return true;
  }
  const body = fn.getBody();
  if (!Node.isBlock(body)) {
    return true;
  }
  return body
    .getDescendantsOfKind(SyntaxKind.ReturnStatement)
    .some((r) => r.getExpression() && r.getFirstAncestor(isFunction) === fn);
};

const isFunction = (node: Node) =>
  Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isFunctionDeclaration(node);

/**
 * V1 called task cleanups without waiting for a returned promise, v2 waits for it before the task
 * re-runs. Wrapping the cleanup keeps the v1 timing.
 */
export const keepV1TaskCleanupTiming = (file: SourceFile) => {
  const hooks = ['useTask$', 'useVisibleTask$'].flatMap((name) =>
    findNamedImports(file, CORE, name)
  );
  const cleanups: Node[] = [];
  for (const call of findCalls(file, hooks)) {
    const task = call.getArguments()[0];
    if (!Node.isArrowFunction(task) && !Node.isFunctionExpression(task)) {
      continue;
    }
    const cleanupNames = new Set<string>();
    const ctx = task.getParameters()[0]?.getNameNode();
    if (Node.isObjectBindingPattern(ctx)) {
      for (const element of ctx.getElements()) {
        if ((element.getPropertyNameNode() ?? element.getNameNode()).getText() === 'cleanup') {
          cleanupNames.add(element.getNameNode().getText());
        }
      }
    } else if (ctx) {
      cleanupNames.add(`${ctx.getText()}.cleanup`);
    }
    for (const cleanupCall of task.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      if (cleanupNames.has(cleanupCall.getExpression().getText())) {
        cleanups.push(cleanupCall.getArguments()[0]);
      }
    }
    const body = task.getBody();
    if (Node.isBlock(body)) {
      for (const ret of body.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
        if (ret.getFirstAncestor(isFunction) === task && ret.getExpression()) {
          cleanups.push(ret.getExpression()!);
        }
      }
    } else {
      cleanups.push(body);
    }
  }
  const wrap = cleanups.filter((fn) => fn && mayReturnValue(fn));
  // replace inner cleanups first
  for (const fn of wrap.sort((a, b) => b.getStart() - a.getStart())) {
    fn.replaceWithText(`() => {\n  void (${fn.getText()})();\n}`);
  }
  return wrap.length > 0;
};
