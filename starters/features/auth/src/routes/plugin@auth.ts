import { serverAuth$ } from 'qwik-auth';
import GitHub from '@auth/core/providers/github';

export const { onRequest, getSession, signup, logout } = serverAuth$(({ env }) => ({
  secret: env.VITE_AUTH_SECRET as string,
  trustHost: true,
  providers: [
    GitHub({
      clientId: env.VITE_GITHUB_ID as string,
      clientSecret: env.VITE_GITHUB_SECRET as string,
    }) as any,
  ],
}));
