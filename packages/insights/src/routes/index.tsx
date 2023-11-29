import { component$, useContext, useTask$ } from '@builder.io/qwik';
import { useAuthSession, useAuthSignin } from './plugin@auth';

import Button from '~/components/button';
import Container from '~/components/container';
import GithubIcon from '~/components/icons/github';
import Layout from '~/components/layout';
import type { Session } from '@auth/core/types';
import { UserContext } from '~/context/user';
import { routeLoader$ } from '@builder.io/qwik-city';
import styles from './styles.module.css';

export const useIsAuthUser = routeLoader$(({ sharedMap, redirect }) => {
  const session = sharedMap.get('session') as Session | null;
  if (session) {
    throw redirect(307, '/app/');
  }
});

export default component$(() => {
  const signInSig = useAuthSignin();
  const sessionSig = useAuthSession();
  const userCtx = useContext(UserContext);

  // update user context
  useTask$(({ track }) => {
    track(() => sessionSig.value?.user?.email);
    userCtx.value = sessionSig.value?.user;
  });

  return (
    <Layout>
      <Container position="center" width="small">
        <div class={styles.wrapper}>
          <div class={styles.box}>
            <h1 class="h1">Welcome</h1>
            <Button
              theme="github"
              onClick$={async () => {
                signInSig.submit({ providerId: 'github' });
              }}
            >
              <GithubIcon />
              Continue with GitHub
            </Button>
          </div>
        </div>
      </Container>
      {/* <pre>{JSON.stringify(userCtx, null, 2)}</pre> */}
    </Layout>
  );
});
