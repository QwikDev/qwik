import { component$, Resource } from '@builder.io/qwik';
import { DocumentHead, loader$ } from '@builder.io/qwik-city';
import { delay } from '../actions/login';

export const useThing = loader$(() => {
  return async () => {
    await delay(1000);
    return { name: 'thing' };
  };
});

export const useOther = loader$(() => {
  return async () => {
    await delay(2000);
    return { name: 'other' };
  };
});

export const useAnother = loader$(() => {
  return { name: 'another' };
});

export default component$(() => {
  const resourceThing = useThing();
  const resourceOther = useOther();
  return (
    <div>
      <h1>Streaming</h1>
      <Resource
        value={resourceThing}
        onResolved={(thing) => {
          return <div>FIRST: {thing.name}</div>;
        }}
      />
      <Resource
        value={resourceOther}
        onResolved={(thing) => {
          return <div>SECOND: {thing.name}</div>;
        }}
      />
    </div>
  );
});

// export const onGet: RequestHandler = async ({cacheControl}) => {
//   cacheControl('static');
// };

export const head: DocumentHead = {
  title: 'About Us',
};
