import { type ReadonlySignal, component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import Histogram, { delayColors, latencyColors } from '~/components/histogram';
import { ManifestIcon } from '~/components/icons/manifest';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { getEdges, getSymbolDetails } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';
import { BUCKETS, vectorAdd, vectorNew } from '~/stats/vector';
import { css } from '~/styled-system/css';

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
      <h1>Manifests</h1>
      <table>
        <tbody>
          {data.value.manifests.map((manifest, idx) => {
            return (
              <tr key={idx}>
                <td>
                  <Histogram
                    vector={manifest.delay}
                    colors={delayColors}
                    buckets={data.value.buckets}
                  />
                </td>
                <td>
                  <Histogram
                    vector={manifest.latency}
                    colors={latencyColors}
                    buckets={data.value.buckets}
                  />
                </td>
                <td>
                  <code>
                    <ManifestIcon
                      class={css({
                        display: 'inline-block',
                        marginBottom: '3px',
                      })}
                    />
                    {manifest.hash}
                  </code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h1>Symbols</h1>
      <table>
        <tbody>
          {data.value.symbols.map((symbol) => (
            <tr key={symbol.hash}>
              <td>
                <Histogram
                  vector={symbol.delay}
                  buckets={data.value.buckets}
                  colors={delayColors}
                />
              </td>
              <td>
                <Histogram
                  vector={symbol.latency}
                  colors={latencyColors}
                  buckets={data.value.buckets}
                />
              </td>
              <td>
                <SymbolTile symbol={symbol.hash} />(
                <code>
                  {symbol.origin}/{symbol.fullName}
                </code>
                )
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
