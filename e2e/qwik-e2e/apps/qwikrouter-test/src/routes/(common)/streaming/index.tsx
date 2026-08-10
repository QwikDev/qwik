import { type DocumentHead, routeLoader$ } from '@qwik.dev/router';
import { component$, Resource } from '@qwik.dev/core';
import { delay } from '../actions/login';

export const useThing = routeLoader$(({ defer }) => {
  return defer(async () => {
    await delay(1000);
    return { name: 'thing' };
  });
});

export const useOther = routeLoader$(({ defer }) => {
  return defer(
    delay(2000).then(() => {
      return { name: 'other' };
    })
  );
});

export const useAnother = routeLoader$(() => {
  return { name: 'another' };
});

export default component$(() => {
  const resourceThing = useThing();
  const resourceOther = useOther();
  return (
    <div>
      <h1>Streaming</h1>
      {resourceThing.value && <div>FIRST: {resourceThing.value.name}</div>}
      {resourceOther.value && <div>SECOND: {resourceOther.value.name}</div>}
    </div>
  );
});

// export const onGet: RequestHandler = async ({cacheControl}) => {
//   cacheControl('static');
// };

export const head: DocumentHead = {
  title: 'About Us',
};
