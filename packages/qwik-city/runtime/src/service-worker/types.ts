export interface QPrefetchData {
  links?: string[];
  bundles?: string[];
  symbols?: string[];
}

export interface QPrefetchMessage extends QPrefetchData {
  type: 'qprefetch';
  base: string;
}

export type ServiceWorkerMessage = QPrefetchMessage;

export interface ServiceWorkerMessageEvent {
  data: ServiceWorkerMessage;
}

export type AppSymbols = Map<string, string>;
export type AppBundle =
  | [bundleName: string, importedBundleIds: number[]]
  | [bundleName: string, importedBundleIds: number[], symbolHashesInBundle: string[]];

export type LinkBundle = [routePattern: RegExp, bundleIds: number[]];

export type Fetch = (r: Request) => Promise<Response>;

export type AwaitingRequests = Map<
  string,
  [resolve: (response: Response | PromiseLike<Response>) => void, reject: (msg: any) => void][]
>;
