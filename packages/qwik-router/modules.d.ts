declare module '@qwik-router-config' {
  import type { RouteData, RouteModule } from '@qwik.dev/router';
  export const routes: RouteData;
  export const serverPlugins: RouteModule[];
  export const trailingSlash: boolean;
  export const basePathname: string;
  export const cacheModules: boolean;
  export const fallthrough: boolean;
  const defaultExport: {
    routes: RouteData;
    serverPlugins: RouteModule[];
    trailingSlash: boolean;
    basePathname: string;
    cacheModules: boolean;
    fallthrough: boolean;
  };
  export default defaultExport;
}

declare module '@qwik-city-plan' {
  export * from '@qwik-router-config';
  export { default } from '@qwik-router-config';
}

declare module '@qwik-city-not-found-paths' {
  /** @deprecated Use `getNotFound` from `@qwik.dev/router/middleware/request-handler` instead. */
  export { getNotFound } from '@qwik.dev/router/middleware/request-handler';
}

declare module '@qwik-city-static-paths' {
  /** @deprecated Use `isStaticPath` from `@qwik.dev/router/middleware/request-handler` instead. */
  export { isStaticPath } from '@qwik.dev/router/middleware/request-handler';
}
