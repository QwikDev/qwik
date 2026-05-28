import type { RequestEvent, RequestHandler } from '@qwik.dev/router';
import { renderDynamicOgImage } from '~/utils/og-image-render';

const setOgImageCache = ({ cacheControl }: RequestEvent) => {
  cacheControl({
    public: true,
    maxAge: 60 * 60 * 24 * 30,
    staleWhileRevalidate: 60 * 60 * 24,
  });
};

export const onGet: RequestHandler = (requestEvent) => {
  const { query, send } = requestEvent;
  const title = query.get('title') || 'Qwik';
  const subtitle = query.get('subtitle') || 'Documentation';
  const svg = renderDynamicOgImage(title, subtitle);

  setOgImageCache(requestEvent);

  send(
    new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
      },
    })
  );
};

export const onHead: RequestHandler = (requestEvent) => {
  setOgImageCache(requestEvent);

  requestEvent.send(
    new Response(null, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
      },
    })
  );
};
