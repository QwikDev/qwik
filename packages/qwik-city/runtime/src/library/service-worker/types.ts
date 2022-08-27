export interface QrlPrefetchData {
  urls?: string[];
  links?: string[];
}

export interface QrlPrefetchMessage extends QrlPrefetchData {
  type: 'qprefetch';
  base: string;
}

export type ServiceWorkerMessage = QrlPrefetchMessage;

export interface ServiceWorkerMessageEvent {
  data: ServiceWorkerMessage;
}

export interface ServiceWorkerBundles {
  [bundleName: string]: string[];
}

export type ServiceWorkerLink = [pattern: RegExp, bundleNames: string[]];

export type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
