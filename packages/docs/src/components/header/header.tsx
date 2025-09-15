import {
  component$,
  useContext,
  useStyles$,
  useSignal,
  useVisibleTask$,
  type PropsOf,
} from '@qwik.dev/core';
import { useLocation } from '@qwik.dev/router';
import { GlobalStore } from '../../context';
import { DocSearch } from '../docsearch/doc-search';
import { SearchIcon } from '../docsearch/icons/SearchIcon';
import { CloseIcon } from '../svgs/close-icon';
import { DiscordLogo } from '../svgs/discord-logo';
import { GithubLogo } from '../svgs/github-logo';
import { MoreIcon } from '../svgs/more-icon';
import { QwikLogo } from '../svgs/qwik-logo';
import { TwitterLogo } from '../svgs/twitter-logo';
import { ThemeToggle } from '../theme-toggle/theme-toggle';
import styles from './header.css?inline';
import { getPkgManagerPreference } from '../package-manager-tabs';

export const SearchButton = component$<PropsOf<'button'>>(({ ...props }) => {
  return (
    <button
      {...props}
      class={['DocSearch-Button', props.class]}
      type="button"
      title="Search"
      aria-label="Search"
    >
      <span class="mr-2 md:inline-block sm:hidden hidden sm:visible">Search</span>
      <SearchIcon />
    </button>
  );
});

export const Header = component$(() => {
  useStyles$(styles);
  const shouldActivate = useSignal(false);
  const globalStore = useContext(GlobalStore);
  const pathname = useLocation().url.pathname;

  useVisibleTask$(() => {
    globalStore.pkgManager = getPkgManagerPreference();
  });

  return (
    <>
      <header
        class={{
          'header-container': true,
          'home-page-header': pathname === '/',
        }}
      >
        <div class="header-inner">
          <div class="header-logo">
            <a href="/">
              <span class="sr-only">Qwik Homepage</span>
              <QwikLogo width={130} height={44} />
            </a>
          </div>
          <div class="flex items-center lg:hidden">
            <SearchButton
              onClick$={() => {
                shouldActivate.value = true;
              }}
              class="absolute right-14 lg:hidden"
            />
          </div>
          <button
            onClick$={() => {
              globalStore.headerMenuOpen = !globalStore.headerMenuOpen;
            }}
            class="mobile-menu"
            type="button"
            title="Toggle right menu"
            aria-label="Toggle right menu"
          >
            <span class="more-icon">
              <MoreIcon width={30} height={30} />
            </span>
            <span class="close-icon">
              <CloseIcon width={30} height={30} />
            </span>
          </button>
          <ul class="lg:grow lg:flex lg:justify-end lg:p-4 menu-toolkit">
            <li>
              <a href="/docs/" class={{ active: pathname.startsWith('/docs') }}>
                <span>Docs</span>
              </a>
            </li>
            <li>
              <a href="/ecosystem/" class={{ active: pathname.startsWith('/ecosystem') }}>
                <span>Ecosystem</span>
              </a>
            </li>
            <li>
              <a
                href="/tutorial/welcome/overview/"
                class={{ active: pathname.startsWith('/tutorial') }}
              >
                <span>Tutorial</span>
              </a>
            </li>
            <li>
              <a
                href="/examples/introduction/hello-world/"
                class={{ active: pathname.startsWith('/examples') }}
                aria-label="Qwik playground"
              >
                <span class="qwiksand" aria-hidden="true">
                  Qwik Sandbox
                </span>
              </a>
            </li>
            <li>
              <a
                href="/blog/"
                class={{ active: pathname.startsWith('/blog') }}
                aria-label="Qwik blog"
              >
                <span>Blog</span>
              </a>
            </li>
            <li class="hidden lg:flex">
              <SearchButton
                onClick$={() => {
                  shouldActivate.value = true;
                }}
              />
            </li>
            <li>
              <ThemeToggle />
            </li>
            <li>
              <a href="https://github.com/QwikDev/qwik" target="_blank" title="GitHub">
                <span class="lg:hidden">GitHub</span>
                <span class="hidden lg:block">
                  <GithubLogo width={22} height={22} />
                </span>
              </a>
            </li>
            <li>
              <a href="https://twitter.com/QwikDev" target="_blank" title="Twitter">
                <span class="lg:hidden">@QwikDev</span>
                <span class="hidden lg:block">
                  <TwitterLogo width={22} height={22} />
                </span>
              </a>
            </li>
            <li>
              <a href="https://qwik.dev/chat" target="_blank" title="Discord">
                <span class="lg:hidden">Discord</span>
                <span class="hidden lg:block">
                  <DiscordLogo width={22} height={22} />
                </span>
              </a>
            </li>
          </ul>
        </div>
        <DocSearch
          isOpen={shouldActivate}
          appId={import.meta.env.VITE_ALGOLIA_APP_ID}
          apiKey={import.meta.env.VITE_ALGOLIA_SEARCH_KEY}
          indexName={import.meta.env.VITE_ALGOLIA_INDEX}
        />
      </header>
    </>
  );
});
