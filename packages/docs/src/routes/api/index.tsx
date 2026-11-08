import { $, component$, isBrowser, useOn, useSignal, useStore, useTask$ } from '@qwik.dev/core';
import { Link } from '@qwik.dev/router';
import { toSnakeCase } from '../../utils/utils';

type ApiData = { id: string; package: string; members: { kind: string; name: string }[] };

const apiJsonModules = import.meta.glob<ApiData>('./*/api.json', { eager: true, import: 'default' });

// Sorting by npm name keeps each package next to its subpaths.
const apiPackages = Object.values(apiJsonModules).sort((a, b) =>
  a.package.localeCompare(b.package)
);

const apiKinds = [
  ...new Set(apiPackages.flatMap((api) => api.members.map((member) => toSnakeCase(member.kind)))),
];

export default component$(() => {
  const filters = useStore<Record<string, boolean>>(
    Object.fromEntries(apiKinds.map((kind) => [kind, true]))
  );

  return (
    <>
      <h1 class="overview">API Reference</h1>

      <h2>Filters</h2>
      <div class="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mb-10">
        {apiKinds.map((kind) => (
          <button
            key={`filter-${kind}`}
            onClick$={() => {
              filters[kind] = !filters[kind];
            }}
            class={`filter-item block text-sm rounded-md text-left ${
              filters[kind] ? 'active' : ''
            }`}
            data-kind-label={kind.substring(0, 1).toUpperCase()}
          >
            {kind.split('-').join(' ')}
          </button>
        ))}
      </div>

      <h2>References</h2>
      {apiPackages.map((api) => (
        <ApiMemberWrapper key={`api-member-wrapper-${api.id}`} id={api.id} data={api} filters={filters} />
      ))}
    </>
  );
});

export const ApiMemberWrapper = component$(({ id, data, filters }: any) => {
  const isCollapsed = useSignal(true);

  useTask$(({track}) => {
    track(filters);
    if (isBrowser) {
      isCollapsed.value = false;
    }
  });

  // TODO: find a solution to get this work
  useOn('beforematch', $(() => {
    isCollapsed.value = false;
  }));

  if(!data.members.length) {
    return null;
  }

  return (
    <div class={`section ${isCollapsed.value}`}>
      <h2
        data-icon={isCollapsed.value ? '→' : '↓'}
        class="section-title cursor-pointer"
        onClick$={() => isCollapsed.value = !isCollapsed.value }
      >
        <span>{data.package}</span>
      </h2>
      <div hidden={isCollapsed.value ? 'until-found' : false}>
        <ApiMemberList id={id} data={data} filters={filters} />
      </div>
    </div>
  );
});


export const ApiMemberList = component$(({ id, data, filters }: any) => {
  const nameCounts = data.members.reduce((acc: Record<string, number>, m: any) => {
    if (m.name) {
      const normalizedName = m.name.toLowerCase();
      acc[normalizedName] = (acc[normalizedName] || 0) + 1;
    }
    return acc;
  }, {});
  return (
    <ul class="grid sm:grid-cols-2 lg:grid-cols-3 pb-5">
      {data.members.map((member: any) => {
        const kind = toSnakeCase(member.kind);

        if (!member.name) {
          return;
        }
      
        const anchorId =
          nameCounts[member.name.toLowerCase()] > 1 ? `${member.id}-${kind}` : member.id;

        return (
          <li
            key={`${id}-member-${member.id}-${kind}`}
            data-kind={kind}
            data-kind-label={kind.substring(0, 1).toUpperCase()}
            class={`api-item list-none text-xs ${
              (kind in filters && !filters[kind] && 'hidden') || ''
            }`}
          >
            <Link href={`/api/${data.id}/#${anchorId}`}>{member.name}</Link>
          </li>
        );
      })}
    </ul>
  );
});
