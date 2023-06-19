import { component$ } from '@builder.io/qwik';
import {
  routeLoader$,
  type RequestHandler,
  type Cookie,
} from '@builder.io/qwik-city';

interface User {
  username: string;
  email: string;
}

export const onRequest: RequestHandler = async ({
  sharedMap,
  cookie,
  send,
}) => {
  const user = loadUserFromCookie(cookie);
  if (user) {
    sharedMap.set('user', user);
  } else {
    throw send(401, 'NOT_AUTHORIZED');
  }
};

function loadUserFromCookie(cookie: Cookie): User | null {
  // this is where you would check cookie for user.
  if (cookie) {
    // just return mock user for this demo.
    return {
      username: `Mock User`,
      email: `mock@users.com`,
    };
  } else {
    return null;
  }
}

export const useUser = routeLoader$(({ sharedMap }) => {
  return sharedMap.get('user') as User;
});

export default component$(() => {
  const log = useUser();
  return (
    <div>
      {log.value.username} ({log.value.email})
    </div>
  );
});
