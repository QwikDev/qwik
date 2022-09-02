export interface QPrefetchData {
  bundles?: string[];
  qKeys?: string[];
}

export interface QPrefetchMessage extends QPrefetchData {
  type: 'qprefetch';
  base: string;
}

export type ServiceWorkerMessage = QPrefetchMessage;

export interface ServiceWorkerMessageEvent {
  data: ServiceWorkerMessage;
}

export type AppBundle = [importedBundleNames: string[], symbolHashesInBundle: string[]];

export interface AppBundles {
  [bundleName: string]: AppBundle;
}

export type Fetch = (r: Request) => Promise<Response>;

export type AwaitingRequests = Map<
  string,
  [resolve: (response: Response | PromiseLike<Response>) => void, reject: (msg: any) => void][]
>;
