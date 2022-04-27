import { component$, Host, $, useScopedStyles$ } from '@builder.io/qwik';
import { CloseIcon } from '../svgs/close-icon';
import { DiscordLogo } from '../svgs/discord-logo';
import { GithubLogo } from '../svgs/github-logo';
import { MoreIcon } from '../svgs/more-icon';
import { QwikLogo } from '../svgs/qwik-logo';
import { TwitterLogo } from '../svgs/twitter-logo';
import type { SiteStore } from '../app/app';
import styles from './header.css?inline';

interface HeaderProps {
  store: SiteStore;
}

export const Header = component$(
  (props: HeaderProps) => {
    useScopedStyles$(styles);

    const toggleMenu = $(() => {
      props.store.headerMenuOpen = !props.store.headerMenuOpen;
    });

    const closeMenu = $(() => {
      props.store.headerMenuOpen = false;
    });

    return (
      <Host className="fixed top-0 z-40 w-full h-[56px]">
        <div class="max-w-[1400px] mx-auto">
          <div className="fixed top-[13px] left-[max(0px,calc(50%-45rem))] pl-4">
            <a href="/" class="hover:opacity-70">
              <span className="sr-only">Qwik Homepage</span>
              <QwikLogo width={110} height={35} />
            </a>
          </div>
          <button onClickQrl={toggleMenu} class="p-3 md:hidden fixed right-0">
            <span class="more-icon">
              <MoreIcon width={30} height={30} />
            </span>
            <span class="close-icon">
              <CloseIcon width={30} height={30} />
            </span>
          </button>
          <ul className="md:grow md:flex md:justify-end md:p-4 bg-gray-900">
            <li>
              <a href="/guide/overview" onClickQrl={closeMenu}>
                <span>Guide</span>
              </a>
            </li>
            <li>
              <a href="https://qwik-playground.builder.io/" target="_blank" onClickQrl={closeMenu}>
                <span>Playground</span>
              </a>
            </li>
            <li>
              <a href="https://github.com/BuilderIO/qwik" target="_blank" onClickQrl={closeMenu}>
                <span class="md:hidden">Github</span>
                <span class="hidden md:block">
                  <GithubLogo width={22} height={22} />
                </span>
              </a>
            </li>
            <li>
              <a href="https://twitter.com/QwikDev" target="_blank" onClickQrl={closeMenu}>
                <span class="md:hidden">@Builder.io</span>
                <span class="hidden md:block">
                  <TwitterLogo width={22} height={22} />
                </span>
              </a>
            </li>
            <li>
              <a href="https://discord.gg/Fd9Cwb3Z8D" target="_blank" onClickQrl={closeMenu}>
                <span class="md:hidden">Discord</span>
                <span class="hidden md:block">
                  <DiscordLogo width={22} height={22} />
                </span>
              </a>
            </li>
          </ul>
        </div>
      </Host>
    );
  },
  { tagName: 'header' }
);
