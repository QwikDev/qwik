import { component$, useStore } from '@builder.io/qwik';
import { toSnakeCase } from '../../utils/utils';
import qwikApiData from './qwik/api.json';
import qwikCityApiData from './qwik-city/api.json';
// import fs from 'node:fs';

// const _API_DOC_FILE_NAME = 'api.json';
const _KINDS = new Set();

// const apiData = fs
//   .readdirSync('./src/routes/api/', {withFileTypes: true})
//   .filter(dirent => dirent.isDirectory())
//   .map(dirent => {
//     return fs.existsSync(`./src/routes/api/${dirent.name}/${_API_DOC_FILE_NAME}`) ? dirent.name : null;
//   })
//   .reduce((acc, file) => {
//     const data = JSON.parse(fs.readFileSync(`./src/routes/api/${file}/${_API_DOC_FILE_NAME}`, 'utf-8'));
//     acc[data.id] = data;
//     return acc;
//   }, {});

const apiData = {
  qwik: qwikApiData,
  'qwik-city': qwikCityApiData
}

const getUniqueKinds = () => {
  if (_KINDS.size) {
    return _KINDS;
  }

  apiData['qwik'].members.forEach((member) => _KINDS.add(toSnakeCase(member.kind)));
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
      <div class="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {Array.from(getUniqueKinds()).map((kind) => (
          <button
            key={`filter-${kind}`}
            onClick$={() => {
              filters[kind] = !filters[kind];
            }}
            class={`filter-item block text-sm rounded-md text-left ${filters[kind] ? 'active' : ''}`}
            data-kind-label={kind.substring(0, 1).toUpperCase()}
          >
            {kind.split('-').join(' ')}
          </button>
        ))}
      </div>

      {Object.keys(apiData).map((key) => (
        <div key={`block-${key}`}>
          <a href={apiData[key].id}>
            <h2>{apiData[key].package}</h2>
          </a>
          <ApiMemberList id={apiData[key].id} data={apiData[key]} filters={filters} />
        </div>
      ))}
    </>
  );
});

// TODO: move into standalone cmp and adjust typings!
export const ApiMemberList = component$(({ id, data, filters}: any) => (
  <ul class="grid md:grid-cols-2 lg:grid-cols-3">
    {data.members.map((member) => {
      const kind = toSnakeCase(member.kind);

      if (!member.name) {
        return;
      }

      return (
        <li
          key={`${id}-member-${member.id}`}
          data-kind={kind}
          data-kind-label={kind.substring(0, 1).toUpperCase()}
          class={`api-item list-none text-xs ${kind in filters && !filters[kind] && 'hidden' || ''}`}
        >
          <a href={`qwik#${member.id}`}>{member.name}</a>
        </li>
      );
    })}
  </ul>
));
