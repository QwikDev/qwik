import { component$ } from '@qwik.dev/core';
import { routeLoader$ } from '@qwik.dev/router';

export const useFlakyData = routeLoader$(async (requestEvent) => {
  const { existsSync, writeFileSync } = await import('node:fs');
  const marker = requestEvent.env.get('SSG_RETRIES_MARKER')!;
  if (!existsSync(marker)) {
    writeFileSync(marker, 'failed once');
    throw requestEvent.error(503, 'Service unavailable');
  }
  return 'rendered after a retry';
});

export default component$(() => {
  const data = useFlakyData();
  return <p>{data.value}</p>;
});
