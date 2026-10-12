const ROUTER_IMPORT =
  /import\s*\{([^}]*)\}\s*from\s*(["'])(@builder\.io\/qwik-city|@qwik\.dev\/router)\2;?/g;
const Z_SPECIFIER = /^z(\s+as\s+[\w$]+)?$/;

/**
 * The router no longer re-exports `z`, but published libraries still import it from the router, so
 * point those imports at `zod` instead.
 */
export function moveRouterZodImport(code: string): string | null {
  let hasZodImport = false;
  const result = code.replace(ROUTER_IMPORT, (statement, specifierList: string, quote, source) => {
    const specifiers = specifierList
      .split(',')
      .map((specifier) => specifier.trim())
      .filter(Boolean);
    const zodSpecifiers = specifiers.filter((specifier) => Z_SPECIFIER.test(specifier));
    if (zodSpecifiers.length === 0) {
      return statement;
    }
    hasZodImport = true;
    const zodImport = `import { ${zodSpecifiers.join(', ')} } from ${quote}zod${quote};`;
    const routerSpecifiers = specifiers.filter((specifier) => !Z_SPECIFIER.test(specifier));
    if (routerSpecifiers.length === 0) {
      return zodImport;
    }
    return `import { ${routerSpecifiers.join(', ')} } from ${quote}${source}${quote};${zodImport}`;
  });
  return hasZodImport ? result : null;
}
