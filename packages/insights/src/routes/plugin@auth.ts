import { serverAuth$ } from "@builder.io/qwik-auth";
import GitHub from "@auth/core/providers/github";
import type { Provider } from "@auth/core/providers";

export const { onRequest, useAuthSession, useAuthSignin, useAuthSignout } =
  serverAuth$(({ env }) => ({
    secret: env.get("PRIVATE_AUTH_SECRET"),
    trustHost: true,
    providers: [
      GitHub({
        clientId: env.get("PRIVATE_GITHUB_ID")!,
        clientSecret: env.get("PRIVATE_GITHUB_SECRET")!,
      }),
    ] as Provider[],
  }));
