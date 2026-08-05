import { component$ } from '@qwik.dev/core';
import { Link, routeLoader$ } from '@qwik.dev/router';
import Histogram, { delayColors, latencyColors } from '~/components/histogram';
import { ManifestIcon } from '~/components/icons/manifest';
import { SymbolIcon } from '~/components/icons/symbol';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { getEdges } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { BUCKETS, vectorAdd, vectorNew } from '~/stats/vector';

interface Symbol {
  hash: string;
  manifests: Record<string, Manifest>;
  delay: number[];
  latency: number[];
}

interface Manifest {
  hash: string;
  delay: number[];
  latency: number[];
}

interface SymbolsInfo {
  symbols: Symbol[];
  manifests: Manifest[];
  buckets: typeof BUCKETS;
  page: number;
  hasNext: boolean;
}

export const useData = routeLoader$<SymbolsInfo>(async ({ params, url }) => {
  const db = getDB();
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '', 10) || 1);
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!)
    : undefined;
  const manifestHashes = await dbGetManifestHashes(db, params.publicApiKey, {
    limit: 101,
    offset: (page - 1) * 100,
  });
  const hasNext = manifestHashes.length > 100;
  const pageManifestHashes = manifestHashes.slice(0, 100);
  const edges = pageManifestHashes.length
    ? await getEdges(db, params.publicApiKey, { limit, manifestHashes: pageManifestHashes })
    : [];

  const symbolMap = new Map<string, Symbol>();
  const manifests = new Map<string, Manifest>();
  edges.forEach((edge) => {
    const manifest = getManifest('<UNKNOWN>');
    const symbol = getSymbol(edge.to);
    const symbolManifest = getSymbolManifest(symbol, '<UNKNOWN>');
    vectorAdd(manifest.delay, edge.delay);
    vectorAdd(manifest.latency, edge.latency);
    vectorAdd(symbolManifest.delay, edge.delay);
    vectorAdd(symbolManifest.latency, edge.latency);
    vectorAdd(symbol.delay, edge.delay);
    vectorAdd(symbol.latency, edge.latency);
  });
  return {
    symbols: Array.from(symbolMap.values()),
    manifests: Array.from(manifests.values()),
    buckets: BUCKETS,
    page,
    hasNext,
  };
  ////////////////////////////////////////////////////////
  function getSymbol(name: string) {
    let symbol = symbolMap.get(name);
    if (!symbol) {
      symbol = {
        hash: name,
        manifests: {} as Symbol['manifests'],
        delay: vectorNew(),
        latency: vectorNew(),
      };
      symbolMap.set(name, symbol);
    }
    return symbol;
  }

  function getSymbolManifest(symbol: Symbol, manifestHash: string) {
    let manifest = symbol.manifests[manifestHash] as undefined | Manifest;
    if (!manifest) {
      manifest = {
        hash: manifestHash,
        delay: vectorNew(),
        latency: vectorNew(),
      };
      symbol.manifests[manifestHash] = manifest;
    }
    return manifest;
  }

  function getManifest(manifestHash: string) {
    let manifest = manifests.get(manifestHash);
    if (!manifest) {
      manifest = {
        hash: manifestHash,
        delay: vectorNew(),
        latency: vectorNew(),
      };
      manifests.set(manifestHash, manifest);
    }
    return manifest;
  }
});

export default component$(() => {
  const data = useData();
  return (
    <div>
      <h1 class="h3">
        <SymbolIcon />
        Manifests
      </h1>
      <table class="w-full text-sm text-left">
        <thead class="text-xs text-slate-700 uppercase">
          <tr class="border-b border-slate-200">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Delay
            </th>
            <th scope="col" class="px-6 py-3">
              Latency
            </th>
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Manifest
            </th>
          </tr>
        </thead>
        <tbody>
          {data.value.manifests.map((manifest, idx) => {
            return (
              <tr key={idx} class="border-b border-slate-200 text-xs">
                <td scope="col" class="px-6 py-3 bg-slate-50 w-96">
                  <Histogram
                    vector={manifest.delay}
                    colors={delayColors}
                    buckets={data.value.buckets}
                  />
                </td>
                <td scope="col" class="px-6 py-3 w-96">
                  <Histogram
                    vector={manifest.latency}
                    colors={latencyColors}
                    buckets={data.value.buckets}
                  />
                </td>
                <td scope="col" class="px-6 py-3 bg-slate-50">
                  <code>
                    <ManifestIcon />
                    {manifest.hash}
                  </code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h1 class="h3 mt-10">
        <SymbolIcon />
        Symbols
      </h1>
      <table class="w-full text-sm text-left">
        <thead class="text-xs text-slate-700 uppercase">
          <tr class="border-b border-slate-200">
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Delay
            </th>
            <th scope="col" class="px-6 py-3">
              Latency
            </th>
            <th scope="col" class="px-6 py-3 bg-slate-50">
              Symbol
            </th>
          </tr>
        </thead>
        <tbody>
          {data.value.symbols.map((symbol) => (
            <tr key={symbol.hash} class="border-b border-slate-200 text-xs">
              <td scope="col" class="px-6 py-3 bg-slate-50 w-96">
                <Histogram
                  vector={symbol.delay}
                  buckets={data.value.buckets}
                  colors={delayColors}
                />
              </td>
              <td scope="col" class="px-6 py-3 w-96">
                <Histogram
                  vector={symbol.latency}
                  colors={latencyColors}
                  buckets={data.value.buckets}
                />
              </td>
              <td scope="col" class="px-6 py-3 bg-slate-50">
                <SymbolTile symbol={symbol.hash} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <nav class="flex gap-4 mt-6">
        {data.value.page > 1 && <Link href={`?page=${data.value.page - 1}`}>Previous</Link>}
        {data.value.hasNext && <Link href={`?page=${data.value.page + 1}`}>Next</Link>}
      </nav>
    </div>
  );
});
