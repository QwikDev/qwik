import { component$ } from '@builder.io/qwik';
import { useNavigate } from '@builder.io/qwik-city';
import Button from '~/components/button';
import Container from '~/components/container';
import AppsIcon from '~/components/icons/apps';
import GithubIcon from '~/components/icons/github';
import Layout from '~/components/layout';
import { useAuthSession, useAuthSignin } from './plugin@auth';
import styles from './styles.module.css';

export default component$(() => {
  const navigate = useNavigate();
  const signInSig = useAuthSignin();
  const sessionSig = useAuthSession();

  return (
    <Layout mode="bright">
      <Container position="center" width="small">
        <div class={styles.wrapper}>
          <h1 class="h4">Log in to Qwik Insights</h1>

          {sessionSig.value?.user?.email ? (
            <>
              <Button onClick$={() => navigate('/app')}>
                <AppsIcon /> Go to the Dashboard
              </Button>
            </>
          ) : (
            <Button
              theme="github"
              onClick$={async () => {
                signInSig.submit({ providerId: 'github' });
              }}
            >
              <GithubIcon />
              Continue with GitHub
            </Button>
          )}
        </div>
      </Container>
    </Layout>
  );
});
