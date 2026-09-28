import { component$ } from '@qwik.dev/core';
import { routeLoader$, type RequestEventLoader } from '@qwik.dev/router';
import { HttpError } from '@qwik.dev/router/middleware/request-handler';

const failWhenAsked = (ev: RequestEventLoader) => {
  const failure = ev.cookie.get('loader-failure')?.value;
  if (failure === 'crash') {
    throw new Error('refresh boom');
  }
  if (failure === 'http') {
    throw new HttpError(404, 'gone');
  }
};

export const useBlockingData = routeLoader$(
  (ev) => {
    failWhenAsked(ev);
    return 'blocking data';
  },
  { serializationStrategy: 'always' }
);

export const useStreamedData = routeLoader$(
  (ev) => {
    failWhenAsked(ev);
    return 'streamed data';
  },
  { blockSSR: false, serializationStrategy: 'always' }
);

export default component$(() => {
  const blocking = useBlockingData();
  const streamed = useStreamedData();
  return (
    <div>
      <button id="refresh-blocking" onClick$={() => blocking.invalidate()}>
        refresh blocking
      </button>
      <button id="refresh-streamed" onClick$={() => streamed.invalidate()}>
        refresh streamed
      </button>
      <p id="blocking-value">{blocking.value}</p>
      <p id="blocking-error">{blocking.error?.message}</p>
      <p id="streamed-value">{streamed.value}</p>
      <p id="streamed-error">{streamed.error?.message}</p>
    </div>
  );
});
