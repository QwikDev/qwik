import { component$, useSignal, useStore, useTask$ } from '@builder.io/qwik';
import qwikApiData from './qwik/api.json';
import { toSnakeCase } from '../../utils/utils';

const _KINDS = new Set();
const getUniqueKinds = () => {
  if (_KINDS.size) {
    return _KINDS;
  }

  qwikApiData.members.forEach((member) => _KINDS.add(toSnakeCase(member.kind)));
  return _KINDS;
};

const getInitialFilterState = () => {
  return Array.from(getUniqueKinds()).reduce((acc: any, kind) => {
    if (typeof kind !== 'string') {
      return acc;
    }
    acc[kind] = true;
    return acc;
  },{}) || {};
};

export default component$(() => {
  const filters = useStore(getInitialFilterState());


  return (
    <>
      <h1>API Reference</h1>

      <h2>Filter</h2>
      <div class="grid grid-cols-4 gap-2">
        {Array.from(getUniqueKinds()).map((kind) => (
          <button
            key={`filter-${kind}`}
            onClick$={() => {
              filters[kind] = !filters[kind];
              console.log(filters);
            }}
            class={`filter-item block text-sm rounded-md text-left ${filters[kind] ? 'active' : ''}`}
            data-kind-label={kind.substring(0, 1).toUpperCase()}
          >
            {kind.split('-').join(' ')}
          </button>
        ))}
      </div>

      <h2>Qwik</h2>
      <a href="qwik">
        <h3>Qwik</h3>
      </a>
      <ApiMemberList id="qwik" data={qwikApiData} />
    </>
  );
});

// TODO: move into standalone cmp and adjust typings!
export const ApiMemberList = component$(({ id, data}: any) => (
  <ul class="grid md:grid-cols-2 lg:grid-cols-4">
    {data.members.map((member) => {
      if (!member.name) {
        return;
      }

      // pascal to snake case
      const kind = toSnakeCase(member.kind);

      // TODO: link must be adjusted!
      return (
        <li
          key={`${id}-member-${member.id}`}
          data-kind={kind}
          data-kind-label={kind.substring(0, 1).toUpperCase()}
          class="api-item list-none text-xs"
        >
          <a href={`qwik#${member.id}`}>{member.name}</a>
        </li>
      );
    })}
  </ul>
));
