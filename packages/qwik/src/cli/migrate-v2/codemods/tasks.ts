import { Node, type SourceFile } from 'ts-morph';
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
