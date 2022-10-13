import type { BuildRoute } from '../../buildtime/types';

export function generateOutput(routes: BuildRoute[]) {
  const cfFunctions = generateFunctions(routes);
  const cfHeaders = generateHeaders(routes);
  const cfRedirects = generateRedirects(routes);
  const cfRoutes = generateRoutes(routes);

  const output: CloudflareGeneratedOutput = {
    entryModule: generateEntryModule(),
    functions: cfFunctions,
    headers: serializeHeaders(cfHeaders),
    redirects: serializeRedirects(cfRedirects),
    routes: JSON.stringify(cfRoutes, null, 2),
  };

  return output;
}

function generateFunctions(routes: BuildRoute[]) {
  const cfFunctions: CloudflareFunction[] = [];
  return cfFunctions;
}

function generateHeaders(routes: BuildRoute[]) {
  const cfHeaders: CloudflareHeader[] = [];
  return cfHeaders;
}

function serializeHeaders(cfHeaders: CloudflareHeader[]) {
  const o: string[] = [];
  for (const header of cfHeaders) {
    o.push(header.path);
    for (const h of header.headers) {
      o.push(`  ${h.name}: ${h.value}`);
    }
    o.push(``);
  }
  return o.join('\n') + '\n';
}

function generateRedirects(routes: BuildRoute[]) {
  const cfRedirects: CloudflareRedirect[] = [];
  return cfRedirects;
}

function serializeRedirects(cfRedirects: CloudflareRedirect[]) {
  const o: string[] = [];
  for (const r of cfRedirects) {
    o.push(`${r.source} ${r.destination} ${r.status}`);
  }
  return o.join('\n') + '\n';
}

function generateRoutes(routes: BuildRoute[]) {
  // default is to exclude everything from cloudflare functions
  // unless there's a specific "include" rule, then assume the
  // route is a static file to server rather than a cloudflare function
  const cfRoutes: CloudflareRoutes = {
    version: 1,
    include: ['/'],
    exclude: [],
  };

  for (const route of routes) {
    cfRoutes.include.push(route.pathname);
  }

  return cfRoutes;
}

function generateEntryModule() {
  const o: string[] = [];
  return o.join('\n') + '\n';
}

interface CloudflareFunction {
  path: string;
  content: string;
}

interface CloudflareHeader {
  path: string;
  headers: { name: string; value: string }[];
}

interface CloudflareRedirect {
  source: string;
  destination: string;
  status: number;
}

interface CloudflareRoutes {
  version: number;
  include: string[];
  exclude: string[];
}

interface CloudflareGeneratedOutput {
  entryModule: string;
  functions: CloudflareFunction[];
  headers: string;
  redirects: string;
  routes: string;
}
