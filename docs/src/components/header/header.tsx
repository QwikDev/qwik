import { component$, Host, $ } from '@builder.io/qwik';
import { GithubLogo } from '../svgs/github-logo';

export const Header = component$(
  () => {
    return $(() => (
      <Host className="fixed top-0 z-40 w-full bg-gray-900 ">
        <div class="max-w-[1400px] mx-auto">
          <div className="fixed top-[13px] left-[max(0px,calc(50%-45rem))] pl-4">
            <a href="/" class="hover:opacity-70">
              <span className="sr-only">Qwik Homepage</span>
              <img src="/logos/qwik.svg" alt="Qwik Logo" width="110" height="35" />
            </a>
          </div>
          <div className="grow flex justify-end p-4">
            <a
              className="font-semibold text-slate-200 hover:text-slate-400 px-2 mx-2"
              href="/guide/overview"
            >
              Guide
            </a>
            <a
              className="font-semibold text-slate-200 hover:text-slate-400 px-2 ml-2"
              href="https://qwik-playground.builder.io/"
              target="_blank"
            >
              Playground
            </a>
            <a
              className="font-semibold text-slate-200 hover:text-slate-400 px-2 ml-2"
              href="https://qwik-playground.builder.io/"
              target="_blank"
            >
              <GithubLogo />
            </a>
          </div>
        </div>
      </Host>
    ));
  },
  { tagName: 'header' }
);
