import type { BuildContext, EndpointRoute } from '../types';
import { createFileId } from '../utils/fs';
import { getPagePathname } from '../utils/pathname';
import { parseRouteId } from '../routing/parse-route';

export function parseEndpointFile(ctx: BuildContext, routesDir: string, filePath: string) {
  const id = createFileId(ctx, routesDir, filePath);
  const pathname = getPagePathname(ctx.opts, filePath);
  const route = parseRouteId(pathname);
  const handlers = new Set<string | undefined>();

  // const result = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest);

  // for (const s of result.statements) {
  //   if (ts.isVariableStatement(s)) {
  //     if (s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
  //       for (const dec of s.declarationList.declarations) {
  //         handlers.add(dec.name.getText());
  //       }
  //     }
  //   } else if (ts.isFunctionDeclaration(s)) {
  //     if (s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
  //       if (s.name) {
  //         handlers.add(s.name.getText());
  //       }
  //     }
  //   } else if (ts.isExportDeclaration(s)) {
  //     if (s.exportClause && ts.isNamedExports(s.exportClause)) {
  //       s.exportClause;
  //     }
  //   }
  // }

  const pageRoute: EndpointRoute = {
    type: 'endpoint',
    id,
    pathname,
    filePath,
    handlers: Array.from(handlers)
      .filter((h: any) => VALID_METHODS[h])
      .sort() as any,
    ...route,
  };

  return pageRoute;
}

const VALID_METHODS: { [method: string]: boolean } = {
  get: true,
  post: true,
  put: true,
  del: true,
  patch: true,
  head: true,
  options: true,
};
