import { useLocation } from '@builder.io/qwik-city';
import { component$, $, useStyles$, useContext, useClientEffect$ } from '@builder.io/qwik';
import { CloseIcon } from '../svgs/close-icon';
import { DiscordLogo } from '../svgs/discord-logo';
import { GithubLogo } from '../svgs/github-logo';
import { MoreIcon } from '../svgs/more-icon';
import { QwikLogo } from '../svgs/qwik-logo';
import { TwitterLogo } from '../svgs/twitter-logo';
import styles from './header.css?inline';
import { GlobalStore } from '../../context';

export const Header = component$(() => {
  useStyles$(styles);
  const globalStore = useContext(GlobalStore);
  const pathname = useLocation().pathname;

  useClientEffect$(() => {
    // @ts-ignore
    window.docsearch({
      container: '#docsearch',
      appId: 'EGKUXMJIF5',
      indexName: 'docsearch-legacy',
      apiKey: 'f33b1a3676a3ee83ed7c133203a7e762',
      transformItems(items: any[]) {
        console.log(items);
        return items.map((item) => ({
          ...item,
          url: item.url?.replace('http://host.docker.internal:3000', window.origin),
        }));
      },
    });
  });

  const toggleMenu = $(() => {
    globalStore.headerMenuOpen = !globalStore.headerMenuOpen;
  });

  const closeMenu = $(() => {
    globalStore.headerMenuOpen = false;
  });

  return (
    <header>
      <div class="header-inner">
        <div class="header-logo">
          <a href="/">
            <span className="sr-only">Qwik Homepage</span>
            <QwikLogo width={110} height={50} />
          </a>
        </div>
        <button onClick$={toggleMenu} class="mobile-menu" type="button">
          <span class="more-icon">
            <MoreIcon width={30} height={30} />
          </span>
          <span class="close-icon">
            <CloseIcon width={30} height={30} />
          </span>
        </button>
        <ul className="md:grow md:flex md:justify-end md:p-4 menu-toolkit">
          <li>
            <div id="docsearch"></div>
          </li>
          <li>
            <a
              href="/docs/overview"
              class={{ active: pathname.startsWith('/docs') }}
              onClick$={closeMenu}
            >
              <span>Docs</span>
            </a>
          </li>
          <li>
            <a
              href="/qwikcity/overview"
              class={{ active: pathname.startsWith('/qwikcity') }}
              onClick$={closeMenu}
            >
              <span>Qwik City</span>
            </a>
          </li>
          <li>
            <a href="/examples/introduction/hello-world" onClick$={closeMenu}>
              <span>Examples</span>
            </a>
          </li>
          <li>
            <a href="/tutorial/welcome/overview" onClick$={closeMenu}>
              <span>Tutorial</span>
            </a>
          </li>
          <li>
            <a href="/playground" onClick$={closeMenu}>
              <span>Playground</span>
            </a>
          </li>
          <li>
            <a href="https://github.com/BuilderIO/qwik" target="_blank" onClick$={closeMenu}>
              <span class="md:hidden">Github</span>
              <span class="hidden md:block">
                <GithubLogo width={22} height={22} />
              </span>
            </a>
          </li>
          <li>
            <a href="https://twitter.com/QwikDev" target="_blank" onClick$={closeMenu}>
              <span class="md:hidden">@Builder.io</span>
              <span class="hidden md:block">
                <TwitterLogo width={22} height={22} />
              </span>
            </a>
          </li>
          <li>
            <a href="https://qwik.builder.io/chat" target="_blank" onClick$={closeMenu}>
              <span class="md:hidden">Discord</span>
              <span class="hidden md:block">
                <DiscordLogo width={22} height={22} />
              </span>
            </a>
          </li>
        </ul>
      </div>
    </header>
  );
});
