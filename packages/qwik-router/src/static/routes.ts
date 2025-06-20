export function createRouteTester(
  basePathname: string,
  includeRoutes: string[] | undefined,
  excludeRoutes: string[] | undefined
) {
  const includes = routesToRegExps(includeRoutes);
  const excludes = routesToRegExps(excludeRoutes);

  return (pathname: string) => {
    if (pathname.endsWith('404.html')) {
      // always static render 404.html routes
      return true;
    }

    if (basePathname !== '/') {
      // the "include" and "exclude" routes are relative to the file system
      // routes directory, and should not involve the URL base pathname
      pathname = pathname.slice(basePathname.length - 1);
    }

    for (const exclude of excludes) {
      if (exclude.test(pathname)) {
        return false;
      }
    }
    for (const include of includes) {
      if (include.test(pathname)) {
        return true;
      }
    }
    return false;
  };
}

function routesToRegExps(routes: string[] | undefined) {
  if (!Array.isArray(routes)) {
    return [];
  }
  return routes.filter((r) => typeof r === 'string').map(routeToRegExp);
}

function routeToRegExp(rule: string) {
  let transformedRule: string;

  if (rule === '/' || rule === '/*') {
    transformedRule = rule;
  } else if (rule.endsWith('/*')) {
    // make `/*` an optional group so we can match both /foo/* and /foo
    // /foo/* => /foo(/*)?
    transformedRule = `${rule.substring(0, rule.length - 2)}(/*)?`;
  } else if (rule.endsWith('/')) {
    // make `/` an optional group so we can match both /foo/ and /foo
    // /foo/ => /foo(/)?
    transformedRule = `${rule.substring(0, rule.length - 1)}(/)?`;
  } else if (rule.endsWith('*')) {
    transformedRule = rule;
  } else {
    transformedRule = `${rule}(/)?`;
  }

  // /foo* => /foo.* => ^/foo.*$
  transformedRule = `^${transformedRule.replace(/\*/g, '.*')}$`;

  // ^/foo.*$ => /^\/foo.*$/
  return new RegExp(transformedRule);
}
