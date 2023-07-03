import { component$, useContext, useTask$, useVisibleTask$ } from '@builder.io/qwik';
import { getUserFromEvent, removeAuthCookies, updateAuthCookies } from '~/supabase/auth/auth';
import { globalAction$, routeLoader$, useNavigate, z, zod$ } from '@builder.io/qwik-city';

import AppsIcon from '~/components/icons/apps';
import Button from '~/components/button';
import GithubIcon from '~/components/icons/github';
import Layout from '~/components/layout';
import { UserContext } from '~/context/user';
import { createSupabase } from '~/supabase/auth';

export const useUser = routeLoader$((event) => {
  return getUserFromEvent(event);
});

export const useSetSessionAction = globalAction$(
  (data, event) => {
    updateAuthCookies(event, data);
  },
  zod$({
    access_token: z.string(),
    expires_in: z.coerce.number(),
    refresh_token: z.string(),
  })
);

export const useGitHubAction = globalAction$(async (_, event) => {
  const supabase = createSupabase(event);

  const response = await supabase.auth.signInWithOAuth({
    provider: 'github',
  });
  return {
    success: true,
    url: response.data.url || '',
  };
});

export const useSingOut = globalAction$(async (_, event) => {
  removeAuthCookies(event);
});

export const useAuthRoute = routeLoader$(async (event) => {
  const user = await getUserFromEvent(event);
  return user;
});

export default component$(() => {
  const userSig = useAuthRoute();
  const navigate = useNavigate();
  const action = useSetSessionAction();
  const gitHubAction = useGitHubAction();
  const singOut = useSingOut();

  const userCtx = useContext(UserContext);

  useTask$(async ({ track }) => {
    track(() => userSig.value);
    userCtx.value = userSig.value;
  });

  useVisibleTask$(async () => {
    const hash = window.location.hash.substring(1);

    if (!hash) {
      return;
    }

    const params = new URLSearchParams(hash);
    const access_token = params.get('access_token');
    const expires_in = params.get('expires_in');
    const refresh_token = params.get('refresh_token');

    if (!access_token || !expires_in || !refresh_token) {
      return;
    }

    await action.submit({
      access_token,
      expires_in: +expires_in,
      refresh_token,
    });

    if (action.value?.failed) {
      return;
    }

    navigate('/');
  });

  return (
    <Layout mode="bright">
      <h1>Log in to Qwik Insights</h1>

      {userCtx.value?.id ? (
        <>
          <Button onClick$={() => navigate('/app')}>
            <AppsIcon /> Go to the Dashboard
          </Button>

          <Button
            onClick$={() => {
              singOut.submit();
            }}
          >
            Sign Out
          </Button>
        </>
      ) : (
        <Button
          theme="github"
          onClick$={async () => {
            const { value } = await gitHubAction.submit();
            window.open(value.url, '_self');
          }}
        >
          <GithubIcon />
          Continue with GitHub
        </Button>
      )}

      <pre>{JSON.stringify(userCtx, null, 2)}</pre>
    </Layout>
  );
});
