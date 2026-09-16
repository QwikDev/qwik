import { Node, type ObjectLiteralExpression, type SourceFile } from 'ts-morph';
import { findCalls, findNamedImports } from './utils';

const qwikViteOptions = (file: SourceFile) =>
  findCalls(file, findNamedImports(file, '@builder.io/qwik/optimizer', 'qwikVite'))
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
