import { type ReadonlySignal, component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import Histogram, { delayColors, latencyColors } from '~/components/histogram';
import { ManifestIcon } from '~/components/icons/manifest';
import { SymbolIcon } from '~/components/icons/symbol';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { getEdges, getSymbolDetails } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { BUCKETS, vectorAdd, vectorNew } from '~/stats/vector';

interface Symbol {
  hash: string;
  fullName: string;
  origin: string;
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
}

export const useData = routeLoader$<SymbolsInfo>(async ({ params, url }) => {
  const db = getDB();
  const limit = url.searchParams.get('limit')
    ? parseInt(url.searchParams.get('limit')!)
    : undefined;
  const manifestHashes = await dbGetManifestHashes(db, params.publicApiKey);
  const [edges, details] = await Promise.all([
    getEdges(db, params.publicApiKey, { limit, manifestHashes }),
    getSymbolDetails(db, params.publicApiKey, { manifestHashes }),
  ]);

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
  details.forEach((detail) => {
    const symbol = symbolMap.get(detail.hash);
    if (symbol) {
      symbol.fullName = detail.fullName;
      symbol.origin = detail.origin;
    }
  });
  return {
    symbols: Array.from(symbolMap.values()),
    manifests: Array.from(manifests.values()),
    buckets: BUCKETS,
  };
  ////////////////////////////////////////////////////////
  function getSymbol(name: string) {
    let symbol = symbolMap.get(name);
    if (!symbol) {
      symbol = {
        hash: name,
        fullName: '',
        origin: '',
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
  const data: ReadonlySignal<SymbolsInfo> = useData();
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
                <span class="block text-slate-500">
                  {symbol.origin}
                  {symbol.fullName}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
