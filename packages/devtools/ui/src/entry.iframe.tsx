import qwikLoaderUrl from '@qwik.dev/core/qwikloader.js?url';
import { render } from '@qwik.dev/core';
import { getOrCreateQwikDevtoolsGlobal, QWIK_DEVTOOLS_GLOBAL } from '@qwik.dev/devtools/kit';
import { initializeIframeAppBase } from './devtools/app-base';
import { createIframePageDataSource } from './devtools/page-data-source';
import { QwikDevtoolsIframe } from './devtools/QwikDevtoolsIframe';

const app = document.getElementById('app');
if (!app) {
  throw new Error('Qwik DevTools app element is missing.');
}

try {
  initializeIframeAppBase(window.location);
  const devtoolsGlobal = getOrCreateQwikDevtoolsGlobal(window);
  devtoolsGlobal[QWIK_DEVTOOLS_GLOBAL.props.pageDataSource] = createIframePageDataSource(window);
  const loader = document.createElement('script');
  loader.src = qwikLoaderUrl;
  loader.onload = () => {
    void render(app, <QwikDevtoolsIframe />).catch((error: unknown) => {
      console.error('[Qwik DevTools] Failed to render the iframe:', error);
      app.textContent = 'Unable to initialize Qwik DevTools.';
    });
  };
  loader.onerror = () => {
    console.error('[Qwik DevTools] Failed to load the Qwik event loader.');
    app.textContent = 'Unable to initialize Qwik DevTools.';
  };
  document.head.appendChild(loader);
} catch (error) {
  console.error('[Qwik DevTools] Failed to initialize the iframe:', error);
  app.textContent = 'Unable to initialize Qwik DevTools.';
}
