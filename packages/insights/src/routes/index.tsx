import { component$ } from '@qwik.dev/core';
import type { DocumentHead } from '@qwik.dev/router';
import BrandLockup from '~/components/brand-lockup';
import Button from '~/components/button';
import GithubIcon from '~/components/icons/github';
import latencyPreview from '~/media/Group.svg?url';
import { useSignIn } from './plugin@auth';

export const head: DocumentHead = {
  title: 'Qwik Insights',
};

export default component$(() => {
  const signInSig = useSignIn();

  return (
    <main class="min-h-screen bg-editorial-canvas font-editorial-ui text-editorial-primary">
      <div class="mx-auto min-h-screen max-w-editorial-viewport editorial-desktop:grid editorial-desktop:grid-cols-[11fr_7fr]">
        <section
          class="hidden min-w-0 px-editorial-16 editorial-desktop:block"
          aria-labelledby="login-evidence-title"
        >
          <BrandLockup class="mt-14 ml-editorial-2" />

          <div class="mt-editorial-16 ml-editorial-10">
            <div class="mt-editorial-5">
              <p class="text-editorial-11 font-semibold leading-tight tracking-[0.08em] text-editorial-muted uppercase">
                Built for Qwik teams
              </p>
              <h2
                id="login-evidence-title"
                class="mt-editorial-4 text-editorial-44 leading-[1.2] font-bold tracking-[-0.035em]"
              >
                Performance evidence
                <br />
                for every deployment.
              </h2>
              <p class="mt-editorial-4 max-w-2xl text-editorial-16 leading-[1.2] text-editorial-secondary">
                See which routes and symbols changed after every deployment,
                <br />
                so regressions are clear before users report them.
              </p>
            </div>
          </div>

          <div class="mt-editorial-16">
            <div class="mt-editorial-6 max-w-editorial-chart">
              <img
                src={latencyPreview}
                width={692}
                height={311}
                alt="Checkout p75 latency rising from 1.49 seconds to 2.05 seconds"
                class="block h-auto w-full"
              />

              <div class="mt-editorial-10 ml-editorial-10 flex gap-editorial-12">
                <p class="min-w-34 text-editorial-20 leading-6 font-semibold text-editorial-danger">
                  2.05 s <span class="text-editorial-12 font-medium">CURRENT</span>
                </p>
                <p class="min-w-37 text-editorial-20 leading-6 font-semibold text-editorial-secondary">
                  1.49 s <span class="text-editorial-12 font-medium">PREVIOUS</span>
                </p>
                <p class="text-editorial-20 leading-6 font-semibold text-editorial-danger">
                  ↑ 38% <span class="text-editorial-12 font-medium">REGRESSION</span>
                </p>
              </div>

              <p class="mt-9 ml-editorial-10 text-editorial-12 leading-4 text-editorial-muted">
                * Example visualization using sample performance data.
              </p>
            </div>
          </div>
        </section>

        <section class="min-h-screen border-editorial-border px-editorial-6 py-editorial-8 editorial-desktop:border-l editorial-desktop:px-0 editorial-desktop:py-0">
          <div class="mx-auto max-w-editorial-auth-control editorial-desktop:ml-editorial-16 editorial-desktop:pt-editorial-16">
            <BrandLockup class="editorial-desktop:hidden" />

            <div class="mt-editorial-16 editorial-desktop:mt-35">
              <p class="text-editorial-11 font-semibold leading-tight tracking-[0.08em] text-editorial-muted uppercase">
                Welcome
              </p>
              <h1 class="mt-editorial-3 text-editorial-36 leading-[1.2] font-bold tracking-[-0.03em]">
                Continue to Qwik Insights
              </h1>
              <p class="mt-editorial-2 text-editorial-14 leading-[1.2] text-editorial-secondary">
                Sign in with GitHub to access performance data
                <br class="hidden sm:block" />
                for your applications.
              </p>

              <div class="mt-9 border-t border-editorial-border pt-11">
                <Button
                  theme="github"
                  class="w-full"
                  onClick$={() => {
                    signInSig.submit({ providerId: 'github' });
                  }}
                >
                  <GithubIcon class="h-6 w-6" aria-hidden="true" />
                  Continue with GitHub
                </Button>
              </div>

              <p class="mt-editorial-6 text-center text-editorial-12 leading-[1.2] text-editorial-muted">
                GitHub shares your basic profile and email address.
              </p>

              <div class="mt-13">
                <p class="text-editorial-11 font-semibold leading-tight tracking-[0.08em] text-editorial-muted uppercase">
                  After signing in
                </p>
                <p class="mt-editorial-3 text-editorial-14 leading-5 text-editorial-secondary">
                  Choose an existing application or add a new one with its name, URL, and
                  description.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
});
