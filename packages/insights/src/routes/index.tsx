import { component$ } from '@qwik.dev/core';
import Button from '~/components/button';
import Container from '~/components/container';
import GithubIcon from '~/components/icons/github';
import Layout from '~/components/layout';
import { useSignIn } from './plugin@auth';

export default component$(() => {
  const signInSig = useSignIn();

  return (
    <Layout>
      <Container position="center" width="small">
        <div class="flex-nowrap flex min-h-[calc(100vh-76px)] flex-col items-center justify-center">
          <div class="rounded-lg bg-white p-10 text-center shadow-sm">
            <h1 class="h1 mb-20">Welcome</h1>
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
    </Layout>
  );
});
