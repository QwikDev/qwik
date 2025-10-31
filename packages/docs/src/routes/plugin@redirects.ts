import type { RequestEvent } from '@qwik.dev/router';

// Keep in sync with `public/_redirects`

export const onGet = ({ url, redirect }: RequestEvent) => {
  const { pathname } = url;
  const tempRedirect = tempRedirects[pathname];
  if (tempRedirect) {
    throw redirect(307, tempRedirect);
  }
  const redirectUrl = redirects[pathname];
  if (redirectUrl) {
    throw redirect(308, redirectUrl);
  }
  const rewritePrefix = (path: string, replacement: string) => {
    if (pathname.startsWith(path)) {
      throw redirect(308, pathname.replace(path, replacement));
    }
  };
  rewritePrefix('/docs/components/', '/docs/core/');
  rewritePrefix('/deployments/', '/docs/deployments/');
  rewritePrefix('/integrations/', '/docs/integrations/');
  rewritePrefix('/qwikcity/', '/docs/');
};

const tempRedirects: Record<string, string> = {
  '/chat': ' https://discord.gg/TsNCMd6uGW',
  '/chat/': ' https://discord.gg/TsNCMd6uGW',

  '/examples ': '/examples/introduction/hello-world/',
  '/examples/ ': '/examples/introduction/hello-world/',
  '/guide ': '/docs/',
  '/guide/ ': '/docs/',
  '/tutorial ': '/tutorial/welcome/overview/',
  '/tutorial/ ': '/tutorial/welcome/overview/',
  '/tutorials ': '/tutorial/welcome/overview/',
  '/tutorials/ ': '/tutorial/welcome/overview/',
};

const redirects: Record<string, string> = {
  '/tutorial/hooks/use-client-effect/': '/tutorial/hooks/use-visible-task/',

  '/integrations/deployments/azure-swa/': '/deployments/azure-swa/',
  '/integrations/deployments/cloudflare-pages/': '/deployments/cloudflare-pages/',
  '/integrations/deployments/express/': '/deployments/express/',
  '/integrations/deployments/netlify-edge/': '/deployments/netlify-edge/',
  '/integrations/deployments/vercel-edge/': '/deployments/vercel-edge/',

  '/qwikcity/advanced/prefetching/': '/docs/advanced/modules-prefetching/',
  '/qwikcity/content/component/': '/docs/pages/',
  '/qwikcity/content/head/': '/docs/pages/',
  '/qwikcity/content/mdx/': '/docs/guides/mdx/',
  '/qwikcity/content/menu/': '/docs/advanced/menu/',
  '/qwikcity/data/endpoints/': '/docs/endpoints/',
  '/qwikcity/data/modify/': '/docs/endpoints/',
  '/qwikcity/data/overview/': '/docs/routing/',
  '/qwikcity/data/redirects/': '/docs/guides/redirects/',
  '/qwikcity/data/retrieve/': '/docs/routing/',
  '/qwikcity/directory-layout/': '/docs/project-structure/',
  '/qwikcity/layout/grouped/': '/docs/advanced/routing/',
  '/qwikcity/layout/named/': '/docs/advanced/routing/',
  '/qwikcity/layout/nested/': '/docs/advanced/routing/',
  '/qwikcity/layout/overview/': '/docs/layout/',
  '/qwikcity/loader/': '/docs/route-loader/',
  '/qwikcity/middleware/azure-swa/': '/deployments/azure-swa/',
  '/qwikcity/middleware/cloudflare-pages/': '/deployments/cloudflare-pages/',
  '/qwikcity/middleware/express/': '/deployments/node/',
  '/qwikcity/middleware/netlify-edge/': '/deployments/netlify-edge/',
  '/qwikcity/middleware/node/': '/deployments/node/',
  '/qwikcity/prefetching/overview/': '/docs/advanced/speculative-module-fetching/',
  '/qwikcity/prefetching/parallelizing-network-requests/':
    '/docs/advanced/speculative-module-fetching/',
  '/qwikcity/prefetching/request-response-cache/': '/docs/advanced/speculative-module-fetching/',
  '/qwikcity/prefetching/service-worker-prefetching/':
    '/docs/advanced/speculative-module-fetching/',
  '/qwikcity/routing/error-responses/': '/docs/advanced/routing/',
  '/qwikcity/routing/overview/': '/docs/routing/',
  '/qwikcity/routing/pathless/': '/docs/layout/grouped/',
  '/qwikcity/routing/route-parameters/': '/docs/routing/',
  '/qwikcity/static-assets/': '/docs/advanced/static-assets/',
  '/qwikcity/static-site-generation/dynamic-routes/': '/docs/guides/static-site-generation/',
  '/qwikcity/static-site-generation/overview/': '/docs/guides/static-site-generation/',
  '/qwikcity/static-site-generation/static-site-config/': '/docs/guides/static-site-generation/',

  '/docs/advanced/i18n/': '/docs/integrations/i18n/',
  '/docs/cheat/best-practices/': '/docs/guides/best-practices/',
  '/docs/cheat/qwik-react/': '/docs/integrations/react/',
  '/docs/cheat/serialization/': '/docs/guides/serialization/',
  '/docs/components/inline-components/': '/docs/core/overview/',
  '/docs/components/lifecycle/': '/docs/core/tasks/',
  '/docs/components/projection/': '/docs/core/slots/',
  '/docs/components/resource/': '/docs/core/state/',
  '/docs/cookbook/re-exporting-loaders/': '/docs/re-exporting-loaders/',
  '/docs/env-variables/': '/docs/guides/env-variables/',
  '/docs/overview': '/docs/',
  '/docs/overview/': '/docs/',
  '/docs/think-qwik/': '/docs/concepts/think-qwik/',
};
