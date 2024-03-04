///////////////////////////////////////////////////////////////////////////
/// GENERATED FILE --- DO NOT EDIT --- YOUR CHANGES WILL BE OVERWRITTEN ///
///////////////////////////////////////////////////////////////////////////

export type AppRoutes =
  | "/"
  | "/api/v1/[publicApiKey]/bundles/"
  | "/api/v1/[publicApiKey]/bundles/strategy/"
  | "/api/v1/[publicApiKey]/post/"
  | "/api/v1/[publicApiKey]/post/error/"
  | "/api/v1/[publicApiKey]/post/manifest/"
  | "/app/"
  | "/app/[publicApiKey]/"
  | "/app/[publicApiKey]/edit/"
  | "/app/[publicApiKey]/errors/"
  | "/app/[publicApiKey]/manifests/"
  | "/app/[publicApiKey]/routes/"
  | "/app/[publicApiKey]/routes/[route]/"
  | "/app/[publicApiKey]/symbols/"
  | "/app/[publicApiKey]/symbols/bundles/"
  | "/app/[publicApiKey]/symbols/edge/"
  | "/app/[publicApiKey]/symbols/outgoing/"
  | "/app/[publicApiKey]/symbols/slow/"
  | "/app/add/"
  | "/test/"
  | "/test/counter/"
  | "/test/visible-task/";

export interface AppRouteMap {
  "/": {};
  "/api/v1/[publicApiKey]/bundles/": { publicApiKey: string };
  "/api/v1/[publicApiKey]/bundles/strategy/": { publicApiKey: string };
  "/api/v1/[publicApiKey]/post/": { publicApiKey: string };
  "/api/v1/[publicApiKey]/post/error/": { publicApiKey: string };
  "/api/v1/[publicApiKey]/post/manifest/": { publicApiKey: string };
  "/app/": {};
  "/app/[publicApiKey]/": { publicApiKey: string };
  "/app/[publicApiKey]/edit/": { publicApiKey: string };
  "/app/[publicApiKey]/errors/": { publicApiKey: string };
  "/app/[publicApiKey]/manifests/": { publicApiKey: string };
  "/app/[publicApiKey]/routes/": { publicApiKey: string };
  "/app/[publicApiKey]/routes/[route]/": {
    publicApiKey: string;
    route: string;
  };
  "/app/[publicApiKey]/symbols/": { publicApiKey: string };
  "/app/[publicApiKey]/symbols/bundles/": { publicApiKey: string };
  "/app/[publicApiKey]/symbols/edge/": { publicApiKey: string };
  "/app/[publicApiKey]/symbols/outgoing/": { publicApiKey: string };
  "/app/[publicApiKey]/symbols/slow/": { publicApiKey: string };
  "/app/add/": {};
  "/test/": {};
  "/test/counter/": {};
  "/test/visible-task/": {};
}

export interface AppRouteParamsFunction {
  (route: "/", params?: {}): string;
  (
    route: "/api/v1/[publicApiKey]/bundles/",
    params: { publicApiKey: string },
  ): string;
  (
    route: "/api/v1/[publicApiKey]/bundles/strategy/",
    params: { publicApiKey: string },
  ): string;
  (
    route: "/api/v1/[publicApiKey]/post/",
    params: { publicApiKey: string },
  ): string;
  (
    route: "/api/v1/[publicApiKey]/post/error/",
    params: { publicApiKey: string },
  ): string;
  (
    route: "/api/v1/[publicApiKey]/post/manifest/",
    params: { publicApiKey: string },
  ): string;
  (route: "/app/", params?: {}): string;
  (route: "/app/[publicApiKey]/", params: { publicApiKey: string }): string;
  (
    route: "/app/[publicApiKey]/edit/",
    params: { publicApiKey: string },
  ): string;
  (
    route: "/app/[publicApiKey]/errors/",
    params: { publicApiKey: string },
  ): string;
  (
    route: "/app/[publicApiKey]/manifests/",
    params: { publicApiKey: string },
  ): string;
  (
    route: "/app/[publicApiKey]/routes/",
    params: { publicApiKey: string },
  ): string;
  (
    route: "/app/[publicApiKey]/routes/[route]/",
    params: { publicApiKey: string; route: string },
  ): string;
  (
    route: "/app/[publicApiKey]/symbols/",
    params: { publicApiKey: string },
  ): string;
  (
    route: "/app/[publicApiKey]/symbols/bundles/",
    params: { publicApiKey: string },
  ): string;
  (
    route: "/app/[publicApiKey]/symbols/edge/",
    params: { publicApiKey: string },
  ): string;
  (
    route: "/app/[publicApiKey]/symbols/outgoing/",
    params: { publicApiKey: string },
  ): string;
  (
    route: "/app/[publicApiKey]/symbols/slow/",
    params: { publicApiKey: string },
  ): string;
  (route: "/app/add/", params?: {}): string;
  (route: "/test/", params?: {}): string;
  (route: "/test/counter/", params?: {}): string;
  (route: "/test/visible-task/", params?: {}): string;
}

export type AppLinkProps =
  | { route: "/" }
  | { route: "/api/v1/[publicApiKey]/bundles/"; "param:publicApiKey": string }
  | {
      route: "/api/v1/[publicApiKey]/bundles/strategy/";
      "param:publicApiKey": string;
    }
  | { route: "/api/v1/[publicApiKey]/post/"; "param:publicApiKey": string }
  | {
      route: "/api/v1/[publicApiKey]/post/error/";
      "param:publicApiKey": string;
    }
  | {
      route: "/api/v1/[publicApiKey]/post/manifest/";
      "param:publicApiKey": string;
    }
  | { route: "/app/" }
  | { route: "/app/[publicApiKey]/"; "param:publicApiKey": string }
  | { route: "/app/[publicApiKey]/edit/"; "param:publicApiKey": string }
  | { route: "/app/[publicApiKey]/errors/"; "param:publicApiKey": string }
  | { route: "/app/[publicApiKey]/manifests/"; "param:publicApiKey": string }
  | { route: "/app/[publicApiKey]/routes/"; "param:publicApiKey": string }
  | {
      route: "/app/[publicApiKey]/routes/[route]/";
      "param:publicApiKey": string;
      "param:route": string;
    }
  | { route: "/app/[publicApiKey]/symbols/"; "param:publicApiKey": string }
  | {
      route: "/app/[publicApiKey]/symbols/bundles/";
      "param:publicApiKey": string;
    }
  | { route: "/app/[publicApiKey]/symbols/edge/"; "param:publicApiKey": string }
  | {
      route: "/app/[publicApiKey]/symbols/outgoing/";
      "param:publicApiKey": string;
    }
  | { route: "/app/[publicApiKey]/symbols/slow/"; "param:publicApiKey": string }
  | { route: "/app/add/" }
  | { route: "/test/" }
  | { route: "/test/counter/" }
  | { route: "/test/visible-task/" };
