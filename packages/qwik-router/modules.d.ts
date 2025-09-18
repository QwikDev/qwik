declare module '@qwik-router-config' {
  export const routes: any[];
  export const menus: any[];
  export const trailingSlash: boolean;
  export const basePathname: string;
  export const cacheModules: boolean;
  export const loaderIdToRoute: Record<string, string>;
  const defaultExport: {
    routes: any[];
    menus: any[];
    trailingSlash: boolean;
    basePathname: string;
    cacheModules: boolean;
    loaderIdToRoute: Record<string, string>;
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
