import { component$, Host, $ } from '@builder.io/qwik';
import { DiscordLogo } from '../svgs/discord-logo';
import { GithubLogo } from '../svgs/github-logo';
import { QwikLogo } from '../svgs/qwik-logo';
import { TwitterLogo } from '../svgs/twitter-logo';

export const Header = component$(
  () => {
    return $(() => (
      <Host className="fixed top-0 z-40 w-full bg-gray-900 ">
        <div class="max-w-[1400px] mx-auto">
          <div className="fixed top-[13px] left-[max(0px,calc(50%-45rem))] pl-4">
            <a href="/" class="hover:opacity-70">
              <span className="sr-only">Qwik Homepage</span>
              <QwikLogo width={110} height={35} />
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
              className="font-semibold text-slate-200 hover:text-slate-400 px-2 ml-4"
              href="https://github.com/BuilderIO/qwik"
              target="_blank"
            >
              <span className="sr-only">Github</span>
              <GithubLogo width={22} height={22} />
            </a>
            <a
              className="font-semibold text-slate-200 hover:text-slate-400 px-2 ml-2"
              href="https://twitter.com/QwikDev"
              target="_blank"
            >
              <span className="sr-only">Twitter</span>
              <TwitterLogo width={22} height={22} />
            </a>
            <a
              className="font-semibold text-slate-200 hover:text-slate-400 px-2 ml-2"
              href="https://discord.gg/Fd9Cwb3Z8D"
              target="_blank"
            >
              <span className="sr-only">Discord</span>
              <DiscordLogo width={22} height={22} />
            </a>
          </div>
        </div>
      </Host>
    ));
  },
  { tagName: 'header' }
);
