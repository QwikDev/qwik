export interface QPrefetchData {
  urls?: string[];
  links?: string[];
}

export interface QPrefetchMessage extends QPrefetchData {
  type: 'qprefetch';
  base: string;
}

export type ServiceWorkerMessage = QPrefetchMessage;

export interface ServiceWorkerMessageEvent {
  data: ServiceWorkerMessage;
}

export interface ServiceWorkerBundles {
  [bundleName: string]: string[];
}

export type ServiceWorkerLink = [pattern: RegExp, bundleNames: string[]];

export type Fetch = (r: Request) => Promise<Response>;

export type AwaitingRequests = Map<
  string,
  { resolve: (response: Response | PromiseLike<Response>) => void; reject: (msg: any) => void }[]
>;
