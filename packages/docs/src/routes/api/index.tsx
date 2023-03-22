import { component$ } from '@builder.io/qwik';
import qwikApiData from './qwik/api.json';

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
      const kindClass = member.kind
        .split(/\.?(?=[A-Z])/)
        .join('-')
        .toLowerCase();

      // TODO: link must be adjusted!
      return (
        <li key="member" class={`list-none text-sm ${kindClass}`}>
          <a href={`qwik#${member.name}`}>{member.name}</a>
        </li>
      );
    })}
  </ul>
));
