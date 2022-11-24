import { component$, Resource, useResource$ } from '@builder.io/qwik';
import { isServer } from '../../../../../../packages/qwik/src/build';
import type { Framework } from '@prisma/client';

export default component$(() => {
  const trpcResource = useResource$(async () => {
    if (isServer) {
      const { tServer } = await import('../../trpc-server/router');
      return tServer.framework.list('');
    }
    const { trpc } = await import('../../client/trpc');
    return trpc.framework.list.query('');
  });

  return (
    <div>
      Records:
      <Resource
        value={trpcResource}
        onPending={() => <div>loading</div>}
        onRejected={() => <div>error</div>}
        onResolved={(data: Framework[]) => {
          return (
            <>
              {data.map((item) => {
                return (
                  <>
                    <div>Id: {item.id}</div>
                    <div>Name: {item.name}</div>
                    <hr />
                  </>
                );
              })}
            </>
          );
        }}
      />
    </div>
  );
});
