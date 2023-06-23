import { useDocumentHead, useLocation } from '@builder.io/qwik-city';
import {
  component$,
  useStyles$,
  useContext,
  useVisibleTask$,
  useSignal,
  useTask$,
} from '@builder.io/qwik';
import { DocSearch } from '../docsearch/doc-search';
import { CloseIcon } from '../svgs/close-icon';
import { DiscordLogo } from '../svgs/discord-logo';
import { GithubLogo } from '../svgs/github-logo';
import { MoreIcon } from '../svgs/more-icon';
import { QwikLogo } from '../svgs/qwik-logo';
import { TwitterLogo } from '../svgs/twitter-logo';
import styles from './header.css?inline';
import ogImage from './ogImage.css?inline';
import { GlobalStore } from '../../context';
import {
  colorSchemeChangeListener,
  getColorPreference,
  setPreference,
  ThemeToggle,
} from '../theme-toggle/theme-toggle';
import BuilderContentComp from '../../components/builder-content';
import { BUILDER_TOP_BAR_MODEL, BUILDER_PUBLIC_API_KEY } from '../../constants';

export const Header = component$(() => {
  // the title of the current page
  const pageTitle = useDocumentHead().title;
  const { url } = useLocation();

  // arrayed url

  // parent route
  const arrayedUrl = url.href.split('/');
  const parentRoute = arrayedUrl.slice(3)[0];

  //turn the title into array
  const arrayedTitle = pageTitle.split(' | ');

  //check if we are on home page or level 0 or 1 route
  let isBaseRoute = true;
  isBaseRoute = arrayedTitle.length > 0 ? false : true;

  // set the text for the ogimage
  const biggerTitle = isBaseRoute ? undefined : arrayedTitle[0]; //.replace('#', '');
  const smallerTitle = isBaseRoute ? undefined : arrayedTitle[1];

  // check the outputs on the server
  console.log(arrayedTitle);
  console.log('Array length ' + arrayedTitle.length);
  console.log('Bigger text is ' + biggerTitle + ' and smaller text ' + smallerTitle);
  console.log(arrayedUrl);
  console.log(parentRoute);
  console.log('third level route is ' + arrayedUrl[2]);

  useStyles$(styles);
  useStyles$(ogImage);
  const globalStore = useContext(GlobalStore);
  const pathname = useLocation().url.pathname;
  const routeLevel = useSignal(0);

  const imageUrl = useSignal('');
  const ogImgTitle = useSignal('');
  const ogImgSubTitle = useSignal('');
  // const ogImgFragment = useSignal('');

  //the url
  const urlString = pathname;

  //turn the url into array
  const array = urlString.split('/').slice(1, -1).reverse();
  //check if we are on home page or level 0/1 route
  let isHomePage = true;
  isHomePage = array.length > 0 ? false : true;

  useTask$(() => {
    //change the value of the title and subtitle
    ogImgTitle.value = biggerTitle!;
    ogImgSubTitle.value = smallerTitle!;

    //decide whether or not to show subtitle
    if (ogImgSubTitle.value == undefined || ogImgTitle == undefined) {
      ogImgTitle.value = biggerTitle!;

      routeLevel.value = 0;
      imageUrl.value = `/logos/social-card.jpg`;
    } else {
      routeLevel.value = 1;
      // check if on example a.k.a qwik-sandbox because the navigation in qwik-sandbox does not update useDocumenthead()
      if (parentRoute == 'examples') {
        imageUrl.value = `https://next-satori.vercel.app/api/og/?level=${
          routeLevel.value
        }&title=${'Examples'}&subtitle=${'Qwik Sandbox'}`;
      } else {
        imageUrl.value = `https://next-satori.vercel.app/api/og/?level=${routeLevel.value}&title=${ogImgTitle.value}&subtitle=${ogImgSubTitle.value}`;
      }
    }

    // console.log(ogImgTitle.value + "aaaa "+ ogImgSubTitle.value + " bbb")
  });

  useVisibleTask$(() => {
    // console.log(useLocation().url.hash); // dont forget to remove this bruh
    console.log(pageTitle);

    globalStore.theme = getColorPreference();
    return colorSchemeChangeListener((isDark) => {
      globalStore.theme = isDark ? 'dark' : 'light';
      setPreference(globalStore.theme);
    });
  });

  const hasBuilderBar = !(
    pathname.startsWith('/examples') ||
    pathname.startsWith('/tutorial') ||
    pathname.startsWith('/playground')
  );

  return (
    <>
      {hasBuilderBar && (
        <div class="builder-bar">
          <BuilderContentComp
            apiKey={BUILDER_PUBLIC_API_KEY}
            model={BUILDER_TOP_BAR_MODEL}
            tag="div"
          />
        </div>
      )}
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
              <DocSearch
                appId={import.meta.env.VITE_ALGOLIA_APP_ID}
                apiKey={import.meta.env.VITE_ALGOLIA_SEARCH_KEY}
                indexName={import.meta.env.VITE_ALGOLIA_INDEX}
              />
            </li>
            <li>
              <ThemeToggle />
            </li>
            <li>
              <a href="https://github.com/BuilderIO/qwik" target="_blank" title="GitHub">
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
              <a href="https://qwik.builder.io/chat" target="_blank" title="Discord">
                <span class="lg:hidden">Discord</span>
                <span class="hidden lg:block">
                  <DiscordLogo width={22} height={22} />
                </span>
              </a>
            </li>
          </ul>
        </div>
        {/* <div
          style={{
            position: 'absolute',
            left: '20px',
            display: 'block',
            height: '300px',
            width: '300px',
          }}
        > */}
        <div
          style={{
            position: 'absolute',
            right: '-80px',
            display: 'block',
            height: '300px',
            width: '600px',
          }}
        >
          {' '}
          <img
            id="ogImage"
            src={imageUrl.value}
            draggable={true}
            // style={{
            //   position: 'absolute',
            //   width: '300px',
            //   height: 'auto',
            //   top: '360px',
            //   left: '1100px',
            // }}
          />
          <img id="tweetPostShell" src={`/logos/tweetPostshell.png`} />
        </div>
        {/* </div> */}
      </header>
    </>
  );
});
