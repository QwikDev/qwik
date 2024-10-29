declare module '@qwik-router-config' {
  export const routes: any[];
  export const menus: any[];
  export const trailingSlash: boolean;
  export const basePathname: string;
  export const cacheModules: boolean;
  const defaultExport: {
    routes: any[];
    menus: any[];
    trailingSlash: boolean;
    basePathname: string;
    cacheModules: boolean;
  };
  export default defaultExport;
}
declare module '@qwik-router-not-found-paths' {
  function getNotFound(_pathname: string): string;
  export { getNotFound };
}
declare module '@qwik-router-static-paths' {
  function isStaticPath(method: string, url: URL): boolean;
  export { isStaticPath };
}
