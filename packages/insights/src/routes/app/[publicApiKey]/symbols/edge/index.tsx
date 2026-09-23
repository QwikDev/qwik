import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';
import Button, { ButtonLink } from '~/components/button';
import PageHeader from '~/components/page-header';
import { SymbolTile } from '~/components/symbol-tile';
import { getDB } from '~/db';
import { computeSymbolGraph, computeSymbolTree, type SymbolTreeNode } from '~/stats/edges';
import { getSymbolGraphEdges } from '~/db/query';
import { dbGetManifestHashes } from '~/db/sql-manifest';

export const useRootSymbol = routeLoader$(async ({ params, url }) => {
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
  if (pageManifestHashes.length === 0) {
    return { rootSymbol: computeSymbolTree(computeSymbolGraph([])[0]), page, hasNext };
  }
  const symbols = await getSymbolGraphEdges(db, params.publicApiKey, {
    limit,
    manifestHashes: pageManifestHashes,
  });
  return { rootSymbol: computeSymbolTree(computeSymbolGraph(symbols)[0]), page, hasNext };
});

export default component$(() => {
  const rootSymbol = useRootSymbol();
  const firstEdge = rootSymbol.value.rootSymbol.children.at(0);
  return (
    <section>
      <PageHeader
        eyebrow="Edge graph"
        title="Edge"
        description="Symbol execution paths across the latest 100 manifests."
        class="mb-editorial-8"
      >
        <Pagination page={rootSymbol.value.page} hasNext={rootSymbol.value.hasNext} />
      </PageHeader>

      <div class="overflow-x-auto">
        <div class="flex h-12 min-w-[36rem] items-center gap-editorial-3 border-b border-editorial-border px-editorial-4 text-editorial-12 text-editorial-secondary">
          <span class="inline-flex min-w-editorial-26 items-center justify-center rounded-editorial-full border border-editorial-border bg-editorial-subtle px-editorial-3 py-editorial-1 font-editorial-mono font-semibold text-editorial-primary">
            {firstEdge ? `${firstEdge.count} / ${firstEdge.to.count}` : '— / —'}
          </span>
          <span>triggered / total</span>
          <span class="h-editorial-5 w-px bg-editorial-border-strong" />
          <span class="rounded-editorial-full bg-editorial-subtle px-editorial-3 py-editorial-1 font-semibold text-editorial-primary">
            {firstEdge ? `Depth ${firstEdge.to.depth}` : 'Depth'}
          </span>
          <span>depth</span>
        </div>

        <div class="min-w-max p-editorial-4">
          <SymbolTree symbol={rootSymbol.value.rootSymbol} depth={0} />
        </div>
      </div>
    </section>
  );
});

function Pagination({ page, hasNext }: { page: number; hasNext: boolean }) {
  const buttonClass = '!min-h-[41px]';
  return (
    <nav aria-label="Pagination" class="flex items-center gap-editorial-6 self-end md:self-auto">
      {page > 1 ? (
        <ButtonLink href={`?page=${page - 1}`} theme="secondary" class={buttonClass}>
          ← Previous
        </ButtonLink>
      ) : (
        <Button disabled theme="secondary" class={buttonClass}>
          ← Previous
        </Button>
      )}
      <span class="text-editorial-12 font-semibold whitespace-nowrap">Page {page}</span>
      {hasNext ? (
        <ButtonLink href={`?page=${page + 1}`} theme="primary" class={buttonClass}>
          Next →
        </ButtonLink>
      ) : (
        <Button disabled theme="primary" class={buttonClass}>
          Next →
        </Button>
      )}
    </nav>
  );
}

function SymbolTree({
  symbol,
  depth,
  count,
}: {
  symbol: SymbolTreeNode;
  depth: number;
  count?: number;
}) {
  const nextDepth = depth + 1;
  const children = [...symbol.children].sort(
    (a, b) => (b.to.depth === nextDepth ? b.count : 0) - (a.to.depth === nextDepth ? a.count : 0)
  );
  const terminal = symbol.depth !== depth;
  return (
    <>
      {depth === 0 && (
        <div class="mb-editorial-2">
          <span class="inline-flex rounded-editorial-full bg-editorial-data-previous px-editorial-4 py-editorial-1 text-editorial-12 font-bold whitespace-nowrap text-editorial-on-accent">
            App
          </span>
        </div>
      )}

      {symbol.count > 0 && (
        <div class="flex h-6 items-center text-editorial-12 whitespace-nowrap">
          <span class="inline-flex min-w-editorial-26 items-center justify-center rounded-editorial-full border border-editorial-border bg-editorial-surface px-editorial-3 py-editorial-1 font-editorial-mono font-semibold text-editorial-primary">
            {count} / {symbol.count}
          </span>
          <span class="ml-editorial-4 inline-flex min-w-36 items-center font-editorial-mono font-semibold text-editorial-primary">
            <span>
              <SymbolTile symbol={symbol.name} />
            </span>
          </span>
          <span class="inline-flex rounded-editorial-full bg-editorial-subtle px-editorial-3 py-editorial-1 font-medium text-editorial-secondary">
            Depth {symbol.depth}
          </span>
        </div>
      )}
      {!terminal && (
        <ul class="m-0 list-none p-0">
          {children.map((edge) => (
            <li
              key={edge.to.name}
              class={[
                'relative pt-editorial-2 pl-editorial-14',
                'before:absolute before:top-0 before:left-editorial-6 before:h-full before:w-px last:before:h-[19px]',
                'after:absolute after:top-[19px] after:left-editorial-6 after:h-px after:w-editorial-8',
                depth === 0
                  ? 'before:bg-editorial-accent after:bg-editorial-accent'
                  : 'before:bg-editorial-border-strong after:bg-editorial-border-strong',
              ]}
            >
              <SymbolTree symbol={edge.to} depth={nextDepth} count={edge.count} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
