import { Catch, component$, useServerData, useTask$, type JSXOutput } from '@qwik.dev/core';
import type { RequestHandler } from '@qwik.dev/router';
import { ServerError } from '@qwik.dev/router/middleware/request-handler';
import { CatchAlwaysThrower, defaultFallback } from '../../components/catch/catch';

export const onGet: RequestHandler = ({ cacheControl, query }) => {
  if (query.has('cached')) {
    cacheControl({ public: true, maxAge: 300 });
  }
};

const AwaitedContent = component$(() => {
  useTask$(async () => {
    await Promise.resolve();
  });
  return <p id="render-crash-awaited">awaited</p>;
});

const ServerErrorThrower = component$((): JSXOutput => {
  throw new ServerError(403, 'render-crash-forbidden');
});

export default component$(() => {
  const url = useServerData<string>('url');
  const scenario = url ? new URL(url).searchParams.get('scenario') : null;
  switch (scenario) {
    case 'caught':
      return (
        <Catch fallback$={defaultFallback}>
          <CatchAlwaysThrower message="render-crash-boom" />
        </Catch>
      );
    case 'crash-after-await':
      return (
        <>
          <AwaitedContent />
          <CatchAlwaysThrower message="render-crash-boom" />
        </>
      );
    case 'server-error':
      return <ServerErrorThrower />;
    default:
      return <CatchAlwaysThrower message="render-crash-boom" />;
  }
});
