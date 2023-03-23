import { component$ } from '@builder.io/qwik';
import qwikApiData from './qwik/api.json';
import qwikCityApiData from './qwik-city/api.json';
import { toSnakeCase } from '../../utils/utils';

const KINDS = new Set();
const getUniqueKinds = () => {
  if (KINDS.size) {
    return;
  }

  qwikApiData.members.forEach((member) => KINDS.add(toSnakeCase(member.kind)));
}

export default component$(() => {
  getUniqueKinds();
  return (
    <>
      <h1>API Reference</h1>

      <h2>Filter</h2>
      <div class="grid grid-cols-4 gap-2">
        {Array.from(KINDS).map((kind) => (
          <button class="block bg-slate-200 text-sm rounded-md text-left" data-kind-label={kind.substring(0,1).toUpperCase()}>{kind}</button>
        ))}
      </div>

      <h2>Qwik</h2>
      <a href="qwik">
        <h3>Qwik</h3>
      </a>
      <ApiMemberList data={qwikApiData} />

      <h2>Qwik City</h2>
      <a href="qwik-city">
        <h3>Qwik-City</h3>
      </a>
      <ApiMemberList data={qwikCityApiData} />
    </>
  );
});

// TODO: move into standalone cmp and adjust typings!
export const ApiMemberList = component$(({ data }: any) => (
  <ul class="grid md:grid-cols-2 lg:grid-cols-3">
    {data.members.map((member) => {
      if (!member.name) {
        return;
      }

      // pascal to snake case
      const kind = toSnakeCase(member.kind);

      // TODO: link must be adjusted!
      return (
        <li
          key={`member-${member.id}`}
          data-kind={kind}
          data-kind-label={kind.substring(0, 1).toUpperCase()}
          class="api-item list-none text-sm"
        >
          <a href={`qwik#${member.id}`}>{member.name}</a>
        </li>
      );
    })}
  </ul>
));
