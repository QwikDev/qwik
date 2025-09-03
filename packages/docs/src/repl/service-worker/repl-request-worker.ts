import type { ReplModuleOutput } from '../types';

interface RequestWorkerMessage {
  type: 'init' | 'update' | 'request';
  clientId: string;
  requestId?: string;
  buildId?: number;
  html?: string;
  clientBundles?: ReplModuleOutput[];
  ssrModules?: ReplModuleOutput[];
  request?: {
    url: string;
    method: string;
    headers: Record<string, string>;
  };
}

interface RequestWorkerResponse {
  type: 'response';
  requestId: string;
  clientId: string;
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
  } | null;
}

class ReplRequestWorker {
  private clientId = '';
  private buildId = 0;
  private html = '';
  private clientBundles: ReplModuleOutput[] = [];
  private ssrModules: ReplModuleOutput[] = [];
  private blobUrls = new Map<string, string>();

  constructor() {
    self.onmessage = this.handleMessage.bind(this);
  }

  private handleMessage(ev: MessageEvent<RequestWorkerMessage>) {
    const msg = ev.data;

    switch (msg.type) {
      case 'init':
        this.clientId = msg.clientId;
        break;
      case 'update':
        this.updateBuild(msg);
        break;
      case 'request':
        this.handleRequest(msg);
        break;
    }
  }

  private updateBuild(msg: RequestWorkerMessage) {
    if (msg.buildId) {
      this.buildId = msg.buildId;
    }
    if (msg.html) {
      this.html = msg.html;
    }
    if (msg.clientBundles) {
      this.clientBundles = msg.clientBundles;
    }
    if (msg.ssrModules) {
      this.ssrModules = msg.ssrModules;
    }

    // Create blob URLs for all modules
    this.updateBlobUrls();
  }

  private updateBlobUrls() {
    // Clean up old blob URLs
    for (const url of this.blobUrls.values()) {
      URL.revokeObjectURL(url);
    }
    this.blobUrls.clear();

    // Create new blob URLs
    for (const bundle of this.clientBundles) {
      const blob = new Blob([bundle.code], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      this.blobUrls.set(`/repl/${this.clientId}/build/${bundle.path}`, url);
    }

    for (const module of this.ssrModules) {
      const blob = new Blob([module.code], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      this.blobUrls.set(`/repl/${this.clientId}/server/${module.path}`, url);
    }

    // HTML blob URL
    if (this.html) {
      const blob = new Blob([this.html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      this.blobUrls.set(`/repl/${this.clientId}/`, url);
    }
  }

  private handleRequest(msg: RequestWorkerMessage) {
    if (!msg.request) {
      return;
    }

    const { url } = msg.request;
    const blobUrl = this.blobUrls.get(url);

    const response: RequestWorkerResponse = {
      type: 'response',
      requestId: msg.requestId || '',
      clientId: this.clientId,
      response: blobUrl
        ? {
            status: 200,
            statusText: 'OK',
            headers: {
              'Content-Type': this.getContentType(url),
              'Cache-Control': 'no-store, no-cache, max-age=0',
              'X-Qwik-REPL-App': 'blob-result',
            },
            body: blobUrl,
          }
        : null,
    };

    (self as any).postMessage(response);
  }

  private getContentType(url: string): string {
    if (url.endsWith('.js')) {
      return 'application/javascript; charset=utf-8';
    }
    if (url.endsWith('.html')) {
      return 'text/html; charset=utf-8';
    }
    if (url.endsWith('.css')) {
      return 'text/css; charset=utf-8';
    }
    return 'text/plain; charset=utf-8';
  }
}

// Initialize the worker
new ReplRequestWorker();
