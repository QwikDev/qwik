import { addError, addWarning } from '../utils/format';
import { resolveSourceFiles } from './routing/resolve-source-file';
import { walkRoutes } from './routing/walk-routes-dir';
import { walkServerPlugins } from './routing/walk-server-plugins';
import type { BuildContext, BuildRoute, RewriteRouteOption } from './types';

export async function build(ctx: BuildContext) {
  try {
    await updateBuildContext(ctx);
    validateBuild(ctx);
  } catch (e) {
    addError(ctx, e);
  }

  for (const d of ctx.diagnostics) {
    if (d.type === 'error') {
      throw new Error(d.message);
    } else {
      console.warn(d.message);
    }
  }
}

export async function updateBuildContext(ctx: BuildContext) {
  if (!ctx.activeBuild) {
    ctx.activeBuild = new Promise<void>((resolve, reject) => {
      walkServerPlugins(ctx.opts)
        .then((serverPlugins) => {
          ctx.serverPlugins = serverPlugins;
          return walkRoutes(ctx.opts.routesDir);
        })
        .then((sourceFiles) => {
          const resolved = resolveSourceFiles(ctx.opts, sourceFiles);
          rewriteRoutes(ctx, resolved);
          ctx.layouts = resolved.layouts;
          ctx.routes = resolved.routes;
          ctx.entries = resolved.entries;
          ctx.serviceWorkers = resolved.serviceWorkers;
          ctx.menus = resolved.menus;
          resolve();
        }, reject)
        .finally(() => {
          ctx.activeBuild = null;
        });
    });
  }
  return ctx.activeBuild;
}

function rewriteRoutes(ctx: BuildContext, resolvedFiles: ReturnType<typeof resolveSourceFiles>) {
  if (!ctx.opts.rewriteRoutes || !resolvedFiles.routes) {
    return;
  }

  const translatedRoutes: BuildRoute[] = [];

  let segmentsToTranslate = ctx.opts.rewriteRoutes.flatMap((rewriteConfig) => {
    return Object.keys(rewriteConfig.paths || {});
  });

  segmentsToTranslate = Array.from(new Set(segmentsToTranslate));

  resolvedFiles.routes.forEach((route) => {
    // always push the original route
    translatedRoutes.push(route);

    const currentRouteSegments = route.pathname.split('/');
    const foundSegmentToTranslate = currentRouteSegments.some((segment) =>
      segmentsToTranslate.includes(segment)
    );

    if (foundSegmentToTranslate || route.pathname === '/') {
      ctx.opts.rewriteRoutes.forEach((config, configIndex) => {
        // In case it is the root route and there is a prefix
        // we want to create a root with that prefix
        // if it doesn't have a prefix, we'll skip it so we won't create a duplicate root route
        if (route.pathname === '/' && !config.prefix) {
          return;
        }
        const routeToPush = translateRoute(route, config, configIndex);

        if (
          !translatedRoutes.some(
            (item) =>
              item.pathname === routeToPush.pathname && item.routeName === routeToPush.routeName
          )
        ) {
          translatedRoutes.push(routeToPush);
        }
      });
    }
  });

  resolvedFiles.routes = translatedRoutes;
}

function translateRoute(
  route: BuildRoute,
  config: RewriteRouteOption,
  configIndex: number
): BuildRoute {
  const replacePath = (part: string) => (config.paths || {})[part] ?? part;

  const pathnamePrefix = config.prefix ? '/' + config.prefix : '';
  const routeNamePrefix = config.prefix ? config.prefix + '/' : '';
  const idSuffix = config.prefix?.toUpperCase().replace(/-/g, '');
  const patternInfix = config.prefix ? [config.prefix] : [];

  // PATH NAME
  const splittedPathName = route.pathname.split('/');
  const translatedPathParts = splittedPathName.map(replacePath);

  // ROUTE NAME
  const splittedRouteName = route.routeName.split('/');
  const translatedRouteParts = splittedRouteName.map(replacePath);

  // REGEX
  const splittedPattern = route.pattern.toString().split('\\/');
  const [translatedPatternFirst, ...translatedPatternOthers] = splittedPattern.map(replacePath);
  const translatedPatternParts = [
    translatedPatternFirst,
    ...patternInfix,
    ...translatedPatternOthers,
  ];
  const translatedPatternString = translatedPatternParts.join('\\/');
  const translatedRegExp = translatedPatternString.substring(
    1,
    route.pathname === '/' ? translatedPatternString.length - 1 : translatedPatternString.length - 2
  );

  const translatedSegments = route.segments.map((segment) =>
    segment.map((item) => ({ ...item, content: replacePath(item.content) }))
  );

  if (config.prefix) {
    translatedSegments.splice(0, 0, [
      {
        content: config.prefix,
        dynamic: false,
        rest: false,
      },
    ]);
  }

  const translatedPath = translatedPathParts.join('/');
  const translatedRoute = translatedRouteParts.join('/');

  const routeToPush = {
    ...route,
    id: route.id + (idSuffix || configIndex),
    pathname: pathnamePrefix + translatedPath,
    routeName: routeNamePrefix + (translatedRoute !== '/' ? translatedRoute : ''),
    pattern: new RegExp(translatedRegExp),
    segments: translatedSegments,
  };
  return routeToPush;
}

function validateBuild(ctx: BuildContext) {
  const pathnames = Array.from(new Set(ctx.routes.map((r) => r.pathname))).sort();

  for (const pathname of pathnames) {
    const foundRoutes = ctx.routes.filter((r) => r.pathname === pathname);
    if (foundRoutes.length > 1) {
      addError(
        ctx,
        `More than one route has been found for pathname "${pathname}". Please narrow it down to only one of these:\n${foundRoutes
          .map((r) => `  - ${r.filePath}`)
          .join('\n')}`
      );
    }
  }

  ctx.layouts
    .filter((l) => l.layoutType === 'top')
    .forEach((l) => {
      addWarning(
        ctx,
        `The "top" layout feature, which is used by "${l.filePath}" has been deprecated and will be removed from future versions. In most cases the "group" layout feature can be used in its place: https://qwik.dev/qwikcity/layout/grouped/`
      );
    });
}
