import { $, Catch, Pending, component$, useOn, useSignal, useServerData } from '@qwik.dev/core';
import { isServer } from '@qwik.dev/core/build';
import { releaseGated } from '../../../../../utils/release-gate';

const GatedFailure = component$(async () => {
  const requestId = useServerData<string>('ooosRequestId');
  const url = useServerData<string>('url');
  if (isServer) {
    await releaseGated(requestId, new URL(url).searchParams.get('release'), () => {});
  }
  throw new Error('PRIVATE_USE_ON_FAILURE');
});

const CatchButton = component$(() => {
  const count = useSignal(0);
  const empty = new URL(useServerData<string>('url')).searchParams.has('empty');
  useOn(
    'click',
    $(() => {
      count.value++;
    })
  );
  return (
    <Catch fallback$={() => <button id="caught-button">{count.value}</button>}>
      <Pending
        fallback$={() => (empty ? null : <button id="waiting-button">{count.value}</button>)}
      >
        <GatedFailure />
      </Pending>
    </Catch>
  );
});

export default component$(() => {
  const requestId = useServerData<string>('ooosRequestId');
  const url = useServerData<string>('url');
  const releaseId = new URL(url).searchParams.get('release');
  return (
    <main>
      <div id="release" data-release-url={`/__ooos-release/${requestId}/${releaseId}`} />
      <CatchButton />
    </main>
  );
});
