import { Link, useLocation } from '@builder.io/qwik-city';
import {
  component$,
  useStyles$,
  useContext,
  useVisibleTask$,
  type PropsOf,
  useSignal,
  $,
} from '@builder.io/qwik';
import { DocSearch } from '../docsearch/doc-search';
import { CloseIcon } from '../svgs/close-icon';
import { DiscordLogo } from '../svgs/discord-logo';
import { GithubLogo } from '../svgs/github-logo';
import { MoreIcon } from '../svgs/more-icon';
import { QwikLogo } from '../svgs/qwik-logo';
import { TwitterLogo } from '../svgs/twitter-logo';
import styles from './header.css?inline';
import { GlobalStore } from '../../context';
import {
  getColorPreference,
  setPreference,
  ThemeToggle,
  getEffectiveTheme,
} from '../theme-toggle/theme-toggle';
import { SearchIcon } from '../docsearch/icons/SearchIcon';
import { getPkgManagerPreference } from '../package-manager-tabs';
import { colorSchemeChangeListener } from '../theme-toggle/theme-script';

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
    const pref = getColorPreference();
    globalStore.theme = getEffectiveTheme(pref);
    return colorSchemeChangeListener((isDark) => {
      const currentPref = getColorPreference();
      if (currentPref === 'auto') {
        globalStore.theme = isDark ? 'dark' : 'light';
        setPreference('auto');
      }
    });
  });

  const closeHeaderMenuOpen = $(() => {
    globalStore.headerMenuOpen = false;
  });

  return (
    <>
      <header
        class={{
          'header-container': true,
          'home-page-header': pathname === '/',
        }}
      >
        <a class="v2-docs-super-header" href="https://next.qwik.dev/">
          <span class="v2-docs-super-header-inner">
            <span class="v2-docs-super-header-icon" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 2.75 13.83 8.4 19.5 10.2l-5.67 1.8L12 17.65 10.17 12 4.5 10.2l5.67-1.8L12 2.75Z"
                  fill="currentColor"
                />
                <path
                  d="m18.5 15.25.65 2.1 2.1.65-2.1.65-.65 2.1-.65-2.1-2.1-.65 2.1-.65.65-2.1ZM5.5 3.25l.5 1.5 1.5.5-1.5.5-.5 1.5-.5-1.5-1.5-.5 1.5-.5.5-1.5Z"
                  fill="white"
                  fill-opacity=".9"
                />
              </svg>
            </span>
            <span class="v2-docs-super-header-copy">
              <strong>Qwik v2 beta</strong>
              <span>Lighter, faster, better.</span>
            </span>
            <span class="v2-docs-super-header-arrow" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3.25 8h8.5m0 0L8.5 4.75M11.75 8 8.5 11.25"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.7"
                />
              </svg>
            </span>
          </span>
        </a>
        <div class="header-inner">
          <div class="header-logo">
            <Link href="/">
              <span class="sr-only">Qwik Homepage</span>
              <QwikLogo width={130} height={44} />
            </Link>
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
              <Link
                href="/docs/"
                class={{ active: pathname.startsWith('/docs') }}
                onClick$={closeHeaderMenuOpen}
              >
                <span>Docs</span>
              </Link>
            </li>
            <li>
              <Link
                href="/ecosystem/"
                class={{ active: pathname.startsWith('/ecosystem') }}
                onClick$={closeHeaderMenuOpen}
              >
                <span>Ecosystem</span>
              </Link>
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
              <Link
                href="/blog/"
                class={{ active: pathname.startsWith('/blog') }}
                aria-label="Qwik blog"
                onClick$={closeHeaderMenuOpen}
              >
                <span>Blog</span>
              </Link>
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
