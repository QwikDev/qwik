import { component$, useContext, useTask$, useVisibleTask$ } from '@builder.io/qwik';
import { getUserFromEvent, updateAuthCookies } from '~/supabase/auth/auth';
import { globalAction$, routeLoader$, useNavigate, z, zod$ } from '@builder.io/qwik-city';

import AppsIcon from '~/components/icons/apps';
import Button from '~/components/button';
import Container from '~/components/container';
import GithubIcon from '~/components/icons/github';
import Layout from '~/components/layout';
import { UserContext } from '~/context/user';
import { createSupabase } from '~/supabase/auth';
import styles from './styles.module.css';

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

export const useAuthRoute = routeLoader$(async (event) => {
  const user = await getUserFromEvent(event);
  return user;
});

export default component$(() => {
  const userSig = useAuthRoute();
  const navigate = useNavigate();
  const action = useSetSessionAction();
  const gitHubAction = useGitHubAction();

  const userCtx = useContext(UserContext);

  // update user context
  useTask$(async ({ track }) => {
    track(() => userSig.value);
    userCtx.value = userSig.value;
  });

  // handle login
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
      <Container position="center" width="small">
        <div class={styles.wrapper}>
          <h1 class="h4">Log in to Qwik Insights</h1>

          {userCtx.value?.id ? (
            <>
              <Button onClick$={() => navigate('/app')}>
                <AppsIcon /> Go to the Dashboard
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
        </div>
      </Container>
      {/* <pre>{JSON.stringify(userCtx, null, 2)}</pre> */}
    </Layout>
  );
});
