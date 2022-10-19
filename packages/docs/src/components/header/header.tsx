import { useLocation } from '@builder.io/qwik-city';
import { component$, useStyles$, useContext } from '@builder.io/qwik';
import { DocSearch } from '../docsearch/doc-search';
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

  return (
    <header class="header-container">
      <div class="header-inner">
        <div class="header-logo">
          <a href="/">
            <span className="sr-only">Qwik Homepage</span>
            <QwikLogo width={180} height={50} />
          </a>
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
        <ul className="md:grow md:flex md:justify-end md:p-4 menu-toolkit">
          <li>
            <a href="/docs/overview/" class={{ active: pathname.startsWith('/docs') }}>
              <span>Docs</span>
            </a>
          </li>
          <li>
            <a href="/qwikcity/overview/" class={{ active: pathname.startsWith('/qwikcity') }}>
              <span>Qwik City</span>
            </a>
          </li>
          <li>
            <a href="/media/" class={{ active: pathname.startsWith('/media') }}>
              <span>Media</span>
            </a>
          </li>
          <li>
            <a
              href="/examples/introduction/hello-world/"
              class={{ active: pathname.startsWith('/examples') }}
            >
              <span>Examples</span>
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
            <a href="/playground/" class={{ active: pathname.startsWith('/playground') }}>
              <span>Playground</span>
            </a>
          </li>
          <li>
            <DocSearch
              appId={import.meta.env.VITE_ALGOLIA_APP_ID}
              apiKey={import.meta.env.VITE_ALGOLIA_SEARCH_KEY}
              indexName={import.meta.env.VITE_ALGOLIA_INDEX}
            />
          </li>
          <li>
            <a href="https://github.com/BuilderIO/qwik" target="_blank" title="Github">
              <span class="md:hidden">Github</span>
              <span class="hidden md:block">
                <GithubLogo width={22} height={22} />
              </span>
            </a>
          </li>
          <li>
            <a href="https://twitter.com/QwikDev" target="_blank" title="Twitter">
              <span class="md:hidden">@QwikDev</span>
              <span class="hidden md:block">
                <TwitterLogo width={22} height={22} />
              </span>
            </a>
          </li>
          <li>
            <a href="https://qwik.builder.io/chat" target="_blank" title="Discord">
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
