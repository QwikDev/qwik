import { QwikAuth$ } from '@auth/qwik';
import GitHub from '@auth/qwik/providers/github';

export const { onRequest, useSession, useSignIn, useSignOut } = QwikAuth$(({ env }) => ({
  secret: env.get('PRIVATE_AUTH_SECRET'),
  trustHost: true,
  basePath: env.get('PRIVATE_AUTH_BASE_API'),
  providers: [
    GitHub({
      clientId: env.get('PRIVATE_GITHUB_ID')!,
      clientSecret: env.get('PRIVATE_GITHUB_SECRET')!,
    }),
  ],
}));
