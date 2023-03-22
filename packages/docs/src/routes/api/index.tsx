import { component$ } from '@builder.io/qwik';
import qwikApiData from './qwik/api.json';
import { toSnakeCase } from '../../utils/utils';

export default component$(() => {
  return (
    <>
      <h1>API Reference</h1>

      <h2>Qwik</h2>
      <a href="qwik">
        <h3>Qwik</h3>
      </a>
      <ApiMemberList data={qwikApiData} />
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
          key="member"
          data-kind={kind}
          data-kind-label={kind.substring(0, 1).toUpperCase()}
          class="api-item list-none text-sm"
        >
          <a href={`qwik#${member.name}`}>{member.name}</a>
        </li>
      );
    })}
  </ul>
));
