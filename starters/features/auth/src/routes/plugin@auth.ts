import { serverAuth$ } from '@builder.io/qwik-auth';
import GitHub from '@auth/core/providers/github';
import type { Provider } from '@auth/core/providers';

export const { onRequest, useAuthSession, useAuthSignin, useAuthSignout } = serverAuth$(
  () => ({
    secret: import.meta.env.VITE_AUTH_SECRET,
    trustHost: true,
    providers: [
      GitHub({
        clientId: import.meta.env.VITE_GITHUB_ID,
        clientSecret: import.meta.env.VITE_GITHUB_SECRET,
      }),
    ] as Provider[],
  })
);
