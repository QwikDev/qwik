import { onRender$, component$, Host } from '@builder.io/qwik';
import { GithubLogo } from '../svgs/github-logo';
import { QwikLogo } from '../svgs/qwik-logo';

export const Header = component$(() => {
  return onRender$(() => (
    <Host class="builder">
      <header className="sticky top-0 z-40 w-full flex-none p-4 bg-gray-900">
        <div className="flex justify-between flex-wrap max-w-7xl mx-auto">
          <div className="flex items-center flex-shrink-0 text-white mr-6">
            <a href="/">
              <span className="sr-only">Qwik Homepage</span>
              <QwikLogo />
            </a>
          </div>
          <nav className="grow flex justify-end">
            <a className="font-semibold text-slate-400 hover:text-slate-500 px-2 mx-2" href="/docs">
              Docs
            </a>
            <a
              className="font-semibold text-slate-400 hover:text-slate-500 px-2 ml-2"
              href="https://qwik-playground.builder.io/"
            >
              Playground
            </a>
          </nav>
          <div className="flex justify-items-end flex-shrink-0 text-white ml-6">
            <GithubLogo />
          </div>
        </div>
      </header>
    </Host>
  ));
});
