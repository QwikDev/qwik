import { component$, Host, $ } from '@builder.io/qwik';
import { GithubLogo } from '../svgs/github-logo';

export const Header = component$(
  () => {
    return $(() => (
      <Host className="sticky top-0 z-40 w-full flex-none py-6 bg-gray-900">
        <div className="flex justify-between flex-wrap max-w-7xl mx-auto md:px-8">
          <div className="flex items-center flex-shrink-0 text-white">
            <a href="/" class="hover:opacity-70">
              <span className="sr-only">Qwik Homepage</span>
              <img src="/logos/qwik.svg" alt="Qwik Logo" width="110" height="35" />
            </a>
          </div>
          <nav className="grow flex justify-end">
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
          </nav>
          <div className="flex justify-items-end flex-shrink-0 text-white ml-6 pt-1">
            <a
              href="https://github.com/BuilderIO/qwik"
              className="ml-2 block text-slate-200 hover:text-slate-400"
              target="_blank"
            >
              <span className="sr-only">Qwik on GitHub</span>
              <GithubLogo />
            </a>
          </div>
        </div>
      </Host>
    ));
  },
  { tagName: 'header' }
);
