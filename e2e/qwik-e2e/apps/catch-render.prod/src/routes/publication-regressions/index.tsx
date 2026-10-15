import { Pending, component$, useComputed$, useSignal, useServerData } from '@qwik.dev/core';
import { isServer } from '@qwik.dev/core/build';
import { releaseGated } from '../../../../../utils/release-gate';

const GatedComputed = component$(async () => {
  const requestId = useServerData<string>('ooosRequestId');
  const url = useServerData<string>('url');
  if (isServer) {
    await releaseGated(requestId, new URL(url).searchParams.get('release'), () => {});
  }
  const value = useComputed$(() => 17, { initial: 1, clientOnly: true });
  return <output id="eager-result">{value.value}</output>;
});

export default component$(() => {
  const selected = useSignal('');
  const rows = useSignal([{ label: 'Alpha', kind: 'business', flags: 0 }]);
  const requestId = useServerData<string>('ooosRequestId');
  const url = useServerData<string>('url');
  const releaseId = new URL(url).searchParams.get('release') ?? 'eager';
  return (
    <main>
      <ul>
        {rows.value.map((row) => (
          <li>
            <button
              id="row-select"
              onClick$={() => {
                selected.value = `${row.kind}:${row.flags}:${row.label}`;
              }}
            >
              {row.label}
            </button>
          </li>
        ))}
      </ul>
      <output id="row-selected">{selected.value}</output>
      <div id="release" data-release-url={`/__ooos-release/${requestId}/${releaseId}`} />
      <Pending fallback$={() => <p id="eager-placeholder">waiting</p>}>
        <GatedComputed />
      </Pending>
    </main>
  );
});
