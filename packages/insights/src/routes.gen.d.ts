///////////////////////////////////////////////////////////////////////////
/// GENERATED FILE --- DO NOT EDIT --- YOUR CHANGES WILL BE OVERWRITTEN ///
///////////////////////////////////////////////////////////////////////////

export type AppRoutes =
  | "/"
  | "/api/v1/[publicApiKey]/bundles/"
  | "/api/v1/[publicApiKey]/post/"
  | "/api/v1/[publicApiKey]/post/error/"
  | "/app/"
  | "/app/[publicApiKey]/"
  | "/app/[publicApiKey]/edit/"
  | "/app/[publicApiKey]/errors/"
  | "/app/[publicApiKey]/symbols/"
  | "/app/[publicApiKey]/symbols/slow/";

export interface AppRouteMap {
  "/": {};
  "/api/v1/[publicApiKey]/bundles/": { publicApiKey: string };
  "/api/v1/[publicApiKey]/post/": { publicApiKey: string };
  "/api/v1/[publicApiKey]/post/error/": { publicApiKey: string };
  "/app/": {};
  "/app/[publicApiKey]/": { publicApiKey: string };
  "/app/[publicApiKey]/edit/": { publicApiKey: string };
  "/app/[publicApiKey]/errors/": { publicApiKey: string };
  "/app/[publicApiKey]/symbols/": { publicApiKey: string };
  "/app/[publicApiKey]/symbols/slow/": { publicApiKey: string };
}

export interface AppRouteParamsFunction {
  (route: "/", params?: {}): string;
  (
    route: "/api/v1/[publicApiKey]/bundles/",
    params: { publicApiKey: string }
  ): string;
  (
    route: "/api/v1/[publicApiKey]/post/",
    params: { publicApiKey: string }
  ): string;
  (
    route: "/api/v1/[publicApiKey]/post/error/",
    params: { publicApiKey: string }
  ): string;
  (route: "/app/", params?: {}): string;
  (route: "/app/[publicApiKey]/", params: { publicApiKey: string }): string;
  (
    route: "/app/[publicApiKey]/edit/",
    params: { publicApiKey: string }
  ): string;
  (
    route: "/app/[publicApiKey]/errors/",
    params: { publicApiKey: string }
  ): string;
  (
    route: "/app/[publicApiKey]/symbols/",
    params: { publicApiKey: string }
  ): string;
  (
    route: "/app/[publicApiKey]/symbols/slow/",
    params: { publicApiKey: string }
  ): string;
}

export type AppLinkProps =
  | { route: "/" }
  | { route: "/api/v1/[publicApiKey]/bundles/"; "param:publicApiKey": string }
  | { route: "/api/v1/[publicApiKey]/post/"; "param:publicApiKey": string }
  | {
      route: "/api/v1/[publicApiKey]/post/error/";
      "param:publicApiKey": string;
    }
  | { route: "/app/" }
  | { route: "/app/[publicApiKey]/"; "param:publicApiKey": string }
  | { route: "/app/[publicApiKey]/edit/"; "param:publicApiKey": string }
  | { route: "/app/[publicApiKey]/errors/"; "param:publicApiKey": string }
  | { route: "/app/[publicApiKey]/symbols/"; "param:publicApiKey": string }
  | {
      route: "/app/[publicApiKey]/symbols/slow/";
      "param:publicApiKey": string;
    };
