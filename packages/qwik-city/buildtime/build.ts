import type { BuildContext } from './types';
import { addError, addWarning } from '../utils/format';
import { walkRoutes } from './routing/walk-routes-dir';
import { resolveSourceFiles } from './routing/resolve-source-file';
import { walkServerPlugins } from './routing/walk-server-plugins';

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

function rewriteRoutes(ctx: BuildContext, resolved: ReturnType<typeof resolveSourceFiles>) {
  if (ctx.opts.rewriteRoutes) {
    ctx.opts.rewriteRoutes.forEach((rewriteOpt, rewriteIndex) => {
      const rewriteFrom = Object.keys(rewriteOpt.paths || {});
      const rewriteRoutes = (resolved.routes || []).filter(
        (route) =>
          rewriteFrom.some((from) => route.pathname.split('/').includes(from)) ||
          (rewriteOpt.prefix && route.pathname === '/')
      );

      const replacePath = (part: string) => (rewriteOpt.paths || {})[part] ?? part;

      rewriteRoutes.forEach((rewriteRoute) => {
        const pathnamePrefix = rewriteOpt.prefix ? '/' + rewriteOpt.prefix : '';
        const routeNamePrefix = rewriteOpt.prefix ? rewriteOpt.prefix + '/' : '';
        const idSuffix = rewriteOpt.prefix?.toUpperCase().replace(/-/g, '');
        const patternInfix = rewriteOpt.prefix ? [rewriteOpt.prefix] : [];

        const splittedPathName = rewriteRoute.pathname.split('/');
        const translatedPathParts = splittedPathName.map(replacePath);

        const splittedRouteName = rewriteRoute.routeName.split('/');
        const translatedRouteParts = splittedRouteName.map(replacePath);

        const splittedPattern = rewriteRoute.pattern.toString().split('\\/');
        const [translatedPatternFirst, ...translatedPatternOthers] =
          splittedPattern.map(replacePath);
        const translatedPatternParts = [
          translatedPatternFirst,
          ...patternInfix,
          ...translatedPatternOthers,
        ];
        const translatedPatternString = translatedPatternParts.join('\\/');
        const translatedRegExp = translatedPatternString.substring(
          1,
          rewriteRoute.pathname === '/'
            ? translatedPatternString.length - 1
            : translatedPatternString.length - 2
        );

        const translatedSegments = rewriteRoute.segments.map((segment) =>
          segment.map((item) => ({ ...item, content: replacePath(item.content) }))
        );

        if (rewriteOpt.prefix) {
          translatedSegments.splice(0, 0, [
            {
              content: rewriteOpt.prefix,
              dynamic: false,
              rest: false,
            },
          ]);
        }

        const translatedPath = translatedPathParts.join('/');
        const translatedRoute = translatedRouteParts.join('/');

        resolved.routes.push({
          ...rewriteRoute,
          id: rewriteRoute.id + (idSuffix || rewriteIndex),
          pathname: pathnamePrefix + translatedPath,
          routeName: routeNamePrefix + (translatedRoute !== '/' ? translatedRoute : ''),
          pattern: new RegExp(translatedRegExp),
          segments: translatedSegments,
        });
      });
    });
  }
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
        `The "top" layout feature, which is used by "${l.filePath}" has been deprecated and will be removed from future versions. In most cases the "group" layout feature can be used in its place: https://qwik.builder.io/qwikcity/layout/grouped/`
      );
    });
}
