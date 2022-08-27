import ts from 'typescript';

export function stripServerEndpoints(code: string, id: string) {
  let didModify = false;
  const sourceFile = ts.createSourceFile(id, code, ts.ScriptTarget.Latest);

  for (const s of sourceFile.statements) {
    if (!ts.isVariableStatement(s)) {
      continue;
    }

    if (!s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
      continue;
    }

    const decs = s.declarationList.declarations;

    for (const d of decs) {
      if (!ts.isVariableDeclaration(d)) {
        continue;
      }
      const identifier = d.name;
      if (!ts.isIdentifier(identifier)) {
        continue;
      }
      if (!SERVER_ENDPOINT_FNS.some((fn) => identifier.escapedText === fn)) {
        continue;
      }

      (d as any).initializer = ts.factory.createNull();
      didModify = true;
    }
  }

  if (didModify) {
    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    return printer.printFile(sourceFile);
  }
  return null;
}

export const SERVER_ENDPOINT_FNS = ['onGet', 'onPost', 'onPut', 'onRequest'];
